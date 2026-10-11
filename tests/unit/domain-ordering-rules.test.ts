import { describe, expect, it } from "vitest";

import { openStatus, wallClock, zonedTimeToInstant, type HoursRange } from "@/server/domain/hours";
import { describeOptionProblem, validateSelection, type OptionGroupRule } from "@/server/domain/options";
import {
  allowedTransitions,
  checkTransition,
  isTerminal,
  TERMINAL_STATUSES,
  TRANSITIONS,
} from "@/server/domain/order-state-machine";
import {
  applyBps,
  divideRoundHalfUp,
  isValidTip,
  meetsMinimumSubtotal,
  priceLine,
  priceOrder,
  serviceFeeFor,
  type PricingConfig,
} from "@/server/domain/pricing";
import { ACTOR_TYPES, ORDER_STATUSES } from "@/shared/enums";

const CONFIG: PricingConfig = {
  deliveryFeeCents: 249,
  serviceFeeBps: 500,
  serviceFeeMinCents: 50,
  serviceFeeMaxCents: 300,
  taxRateBps: 825,
  minSubtotalCents: 500,
  maxTipCents: 5000,
};

describe("pricing (PRD §6 rule 1)", () => {
  it.each([
    [0, 10, 0],
    [4, 10, 0],
    [5, 10, 1], // exactly half rounds up
    [14, 10, 1],
    [15, 10, 2],
    [20, 10, 2],
    [10490, 100, 105], // 104.9
    [10450, 100, 105], // 104.5
    [10449, 100, 104],
  ])("divideRoundHalfUp(%i, %i) = %i", (n, d, expected) => {
    expect(divideRoundHalfUp(n, d)).toBe(expected);
  });

  it("refuses non-integer or negative inputs instead of guessing", () => {
    expect(() => divideRoundHalfUp(1.5, 10)).toThrow(RangeError);
    expect(() => divideRoundHalfUp(-1, 10)).toThrow(RangeError);
    expect(() => divideRoundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => applyBps(100, 2.5)).toThrow(RangeError);
  });

  it("reproduces the documented worked example (subtotal $20.98 + $3.00 tip → $29.34)", () => {
    const burger = priceLine({ unitPriceCents: 899, optionDeltasCents: [150], quantity: 2 });
    expect(burger).toEqual({
      unitPriceCents: 899,
      optionsTotalCents: 150,
      quantity: 2,
      lineTotalCents: 2098,
    });
    expect(priceOrder([burger], 300, CONFIG)).toEqual({
      subtotalCents: 2098,
      deliveryFeeCents: 249,
      serviceFeeCents: 105, // 2098 × 5% = 104.9
      taxCents: 182, // (2098 + 105) × 8.25% = 181.7475
      tipCents: 300,
      totalCents: 2934,
    });
  });

  it.each([
    [500, 50], // 25 → raised to the $0.50 minimum
    [1000, 50],
    [1010, 51], // 50.5 rounds up
    [5990, 300], // 299.5 rounds up to exactly the cap
    [6000, 300],
    [9000, 300], // 450 → capped at $3.00
  ])("service fee on a %i¢ subtotal is %i¢", (subtotal, fee) => {
    expect(serviceFeeFor(subtotal, CONFIG)).toBe(fee);
  });

  it("taxes the subtotal and service fee, but not the delivery fee or tip", () => {
    const line = priceLine({ unitPriceCents: 1000, optionDeltasCents: [], quantity: 1 });
    const noTip = priceOrder([line], 0, CONFIG);
    const bigTip = priceOrder([line], 5000, CONFIG);
    expect(noTip.taxCents).toBe(applyBps(1000 + 50, 825)); // 86.625 → 87
    expect(bigTip.taxCents).toBe(noTip.taxCents);
    expect(priceOrder([line], 0, { ...CONFIG, deliveryFeeCents: 999 }).taxCents).toBe(noTip.taxCents);
  });

  it("always produces integer parts that add up to the total (2 000 generated carts)", () => {
    // Deterministic pseudo-random generator, so a failure is reproducible.
    let seed = 42;
    const next = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let i = 0; i < 2000; i++) {
      const lines = Array.from({ length: 1 + next(6) }, () =>
        priceLine({
          unitPriceCents: next(3000),
          optionDeltasCents: Array.from({ length: next(4) }, () => next(400)),
          quantity: 1 + next(20),
        }),
      );
      const tip = next(5001);
      const p = priceOrder(lines, tip, CONFIG);
      for (const value of Object.values(p)) expect(Number.isInteger(value)).toBe(true);
      expect(p.totalCents).toBe(
        p.subtotalCents + p.deliveryFeeCents + p.serviceFeeCents + p.taxCents + p.tipCents,
      );
      expect(p.serviceFeeCents).toBeGreaterThanOrEqual(50);
      expect(p.serviceFeeCents).toBeLessThanOrEqual(300);
    }
  });

  it("multiplies options into each unit, then by quantity", () => {
    expect(priceLine({ unitPriceCents: 475, optionDeltasCents: [75, 75], quantity: 3 }).lineTotalCents).toBe(
      (475 + 150) * 3,
    );
  });

  it.each([0, 21, 1.5, -1])("rejects quantity %s", (quantity) => {
    expect(() => priceLine({ unitPriceCents: 100, optionDeltasCents: [], quantity })).toThrow(RangeError);
  });

  it("rejects negative or fractional prices and option deltas", () => {
    expect(() => priceLine({ unitPriceCents: -1, optionDeltasCents: [], quantity: 1 })).toThrow(RangeError);
    expect(() => priceLine({ unitPriceCents: 9.99, optionDeltasCents: [], quantity: 1 })).toThrow(RangeError);
    expect(() => priceLine({ unitPriceCents: 100, optionDeltasCents: [-50], quantity: 1 })).toThrow(
      RangeError,
    );
  });

  it("bounds tips to 0–$50 in whole cents, and refuses to price empty orders or bad tips", () => {
    expect(isValidTip(0, CONFIG)).toBe(true);
    expect(isValidTip(5000, CONFIG)).toBe(true);
    expect(isValidTip(5001, CONFIG)).toBe(false);
    expect(isValidTip(-1, CONFIG)).toBe(false);
    expect(isValidTip(2.5, CONFIG)).toBe(false);
    const line = priceLine({ unitPriceCents: 600, optionDeltasCents: [], quantity: 1 });
    expect(() => priceOrder([], 0, CONFIG)).toThrow(RangeError);
    expect(() => priceOrder([line], 5001, CONFIG)).toThrow(RangeError);
  });

  it("enforces the minimum subtotal at exactly $5.00", () => {
    expect(meetsMinimumSubtotal(499, CONFIG)).toBe(false);
    expect(meetsMinimumSubtotal(500, CONFIG)).toBe(true);
  });
});

describe("opening hours in campus time (PRD CAT-5)", () => {
  const TZ = "America/Chicago";
  const h = (hh: number, mm = 0) => hh * 60 + mm;
  // Wednesday 2026-10-14 is in daylight time (UTC−5).
  const wed = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 14, hh + 5, mm));
  const WED = 3;

  it("reads wall-clock time in the campus zone", () => {
    expect(wallClock(new Date("2026-10-14T05:30:00Z"), TZ)).toMatchObject({
      year: 2026,
      month: 10,
      day: 14,
      dayOfWeek: WED,
      minute: 30, // 00:30 local
    });
  });

  it("is open from the opening minute up to, but not including, the closing minute", () => {
    const hours: HoursRange[] = [{ dayOfWeek: WED, opensAtMinute: h(10), closesAtMinute: h(21) }];
    expect(openStatus(hours, wed(9, 59), TZ).isOpen).toBe(false);
    expect(openStatus(hours, wed(10), TZ)).toEqual({ isOpen: true, closesAtMinute: h(21), nextOpenAt: null });
    expect(openStatus(hours, wed(20, 59), TZ).isOpen).toBe(true);
    expect(openStatus(hours, wed(21), TZ).isOpen).toBe(false);
  });

  it("reports the next opening later today, across split shifts", () => {
    const hours: HoursRange[] = [
      { dayOfWeek: WED, opensAtMinute: h(11), closesAtMinute: h(14) },
      { dayOfWeek: WED, opensAtMinute: h(17), closesAtMinute: h(21) },
    ];
    expect(openStatus(hours, wed(8), TZ).nextOpenAt).toEqual(wed(11));
    expect(openStatus(hours, wed(15), TZ)).toEqual({
      isOpen: false,
      closesAtMinute: null,
      nextOpenAt: wed(17),
    });
  });

  it("stays open past midnight into the next day, and closes on time", () => {
    // Tuesday 18:00 → Wednesday 01:30.
    const hours: HoursRange[] = [{ dayOfWeek: 2, opensAtMinute: h(18), closesAtMinute: h(25, 30) }];
    expect(openStatus(hours, wed(0, 30), TZ)).toEqual({
      isOpen: true,
      closesAtMinute: h(1, 30),
      nextOpenAt: null,
    });
    expect(openStatus(hours, wed(1, 30), TZ).isOpen).toBe(false);
    // The same range on Thursday doesn't open Wednesday early morning.
    expect(openStatus([{ ...hours[0]!, dayOfWeek: 4 }], wed(0, 30), TZ).isOpen).toBe(false);
  });

  it("wraps Saturday-night hours into Sunday", () => {
    const hours: HoursRange[] = [{ dayOfWeek: 6, opensAtMinute: h(20), closesAtMinute: h(26) }];
    const sundayOneAm = new Date("2026-10-18T06:00:00Z"); // Sun 01:00 CDT
    expect(openStatus(hours, sundayOneAm, TZ).isOpen).toBe(true);
  });

  it("finds the next opening tomorrow, or the same weekday next week", () => {
    const hours: HoursRange[] = [{ dayOfWeek: WED, opensAtMinute: h(10), closesAtMinute: h(14) }];
    expect(openStatus(hours, wed(15), TZ).nextOpenAt).toEqual(new Date(Date.UTC(2026, 9, 21, 15))); // next Wed
    const thursday: HoursRange[] = [{ dayOfWeek: 4, opensAtMinute: h(7, 30), closesAtMinute: h(9) }];
    expect(openStatus(thursday, wed(15), TZ).nextOpenAt).toEqual(new Date(Date.UTC(2026, 9, 15, 12, 30)));
  });

  it("has no next opening when there are no hours", () => {
    expect(openStatus([], wed(12), TZ)).toEqual({ isOpen: false, closesAtMinute: null, nextOpenAt: null });
  });

  it("handles the daylight-saving changes in both directions", () => {
    const sundayTen: HoursRange[] = [{ dayOfWeek: 0, opensAtMinute: h(10), closesAtMinute: h(14) }];
    // Fall back on Sun 2026-11-01: 10:00 is CST (UTC−6).
    expect(openStatus(sundayTen, new Date("2026-11-01T04:00:00Z"), TZ).nextOpenAt).toEqual(
      new Date("2026-11-01T16:00:00Z"),
    );
    // Spring forward on Sun 2026-03-08: 10:00 is CDT (UTC−5).
    expect(openStatus(sundayTen, new Date("2026-03-08T04:00:00Z"), TZ).nextOpenAt).toEqual(
      new Date("2026-03-08T15:00:00Z"),
    );
    expect(zonedTimeToInstant(2026, 1, 15, h(12), TZ)).toEqual(new Date("2026-01-15T18:00:00Z"));
    expect(zonedTimeToInstant(2026, 7, 15, h(12), TZ)).toEqual(new Date("2026-07-15T17:00:00Z"));
  });
});

describe("menu option rules (PRD CART-2)", () => {
  const groups: OptionGroupRule[] = [
    {
      id: "size",
      name: "Size",
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: "regular", name: "Regular", priceDeltaCents: 0, isAvailable: true },
        { id: "large", name: "Large", priceDeltaCents: 75, isAvailable: true },
      ],
    },
    {
      id: "addons",
      name: "Add-ons",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: "bacon", name: "Bacon", priceDeltaCents: 150, isAvailable: true },
        { id: "egg", name: "Fried egg", priceDeltaCents: 125, isAvailable: true },
        { id: "truffle", name: "Truffle", priceDeltaCents: 300, isAvailable: false },
      ],
    },
  ];

  it("accepts a valid selection and returns it in menu order with prices", () => {
    expect(validateSelection(groups, ["egg", "large", "bacon"])).toEqual({
      ok: true,
      selected: [
        { id: "large", groupId: "size", groupName: "Size", name: "Large", priceDeltaCents: 75 },
        { id: "bacon", groupId: "addons", groupName: "Add-ons", name: "Bacon", priceDeltaCents: 150 },
        { id: "egg", groupId: "addons", groupName: "Add-ons", name: "Fried egg", priceDeltaCents: 125 },
      ],
    });
  });

  it("allows items with no option groups and no selection", () => {
    expect(validateSelection([], [])).toEqual({ ok: true, selected: [] });
  });

  it("requires required groups and caps every group", () => {
    expect(validateSelection(groups, [])).toEqual({
      ok: false,
      problems: [{ kind: "TOO_FEW", groupId: "size", groupName: "Size", min: 1 }],
    });
    expect(validateSelection(groups, ["regular", "large"])).toMatchObject({
      ok: false,
      problems: [{ kind: "TOO_MANY", groupId: "size" }],
    });
    expect(validateSelection(groups, ["regular", "bacon", "egg", "truffle"])).toMatchObject({
      ok: false,
      problems: [
        { kind: "OPTION_UNAVAILABLE", optionId: "truffle" },
        { kind: "TOO_MANY", groupId: "addons", max: 2 },
      ],
    });
  });

  it("rejects options from other items, duplicates, and unavailable options, reporting all of them", () => {
    const result = validateSelection(groups, ["regular", "regular", "someone-elses-option", "truffle"]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => p.kind)).toEqual([
      "DUPLICATE_OPTION",
      "UNKNOWN_OPTION",
      "OPTION_UNAVAILABLE",
    ]);
  });

  it("explains each problem in plain words", () => {
    expect(describeOptionProblem({ kind: "TOO_FEW", groupId: "s", groupName: "Size", min: 1 })).toBe(
      "Choose an option for Size.",
    );
    expect(describeOptionProblem({ kind: "TOO_FEW", groupId: "s", groupName: "Sides", min: 2 })).toBe(
      "Choose at least 2 options for Sides.",
    );
    expect(describeOptionProblem({ kind: "TOO_MANY", groupId: "s", groupName: "Size", max: 1 })).toBe(
      "Choose only one option for Size.",
    );
    expect(describeOptionProblem({ kind: "TOO_MANY", groupId: "a", groupName: "Add-ons", max: 3 })).toBe(
      "Choose up to 3 options for Add-ons.",
    );
    expect(describeOptionProblem({ kind: "OPTION_UNAVAILABLE", optionId: "t", optionName: "Truffle" })).toBe(
      "Truffle isn't available right now.",
    );
    expect(describeOptionProblem({ kind: "UNKNOWN_OPTION", optionId: "x" })).toMatch(/doesn't belong/);
    expect(describeOptionProblem({ kind: "DUPLICATE_OPTION", optionId: "x" })).toMatch(/twice/);
  });
});

describe("order state machine (docs/ARCHITECTURE.md §6)", () => {
  // Written out independently of TRANSITIONS, straight from the architecture table.
  const LEGAL = new Set([
    "PLACED>CONFIRMED:RESTAURANT_SIM",
    "PLACED>CANCELLED:CUSTOMER",
    "PLACED>CANCELLED:RESTAURANT_SIM",
    "PLACED>CANCELLED:ADMIN",
    "CONFIRMED>READY_FOR_PICKUP:RESTAURANT_SIM",
    "CONFIRMED>CANCELLED:RESTAURANT_SIM",
    "CONFIRMED>CANCELLED:ADMIN",
    "READY_FOR_PICKUP>ASSIGNED:COURIER",
    "READY_FOR_PICKUP>CANCELLED:ADMIN",
    "ASSIGNED>READY_FOR_PICKUP:COURIER",
    "ASSIGNED>READY_FOR_PICKUP:ADMIN",
    "ASSIGNED>PICKED_UP:COURIER",
    "ASSIGNED>CANCELLED:ADMIN",
    "PICKED_UP>DELIVERED:COURIER",
    "PICKED_UP>DELIVERY_FAILED:COURIER",
    "PICKED_UP>DELIVERY_FAILED:ADMIN",
  ]);

  it(`allows exactly the ${LEGAL.size} documented moves out of every status × status × actor combination`, () => {
    let checked = 0;
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        for (const actor of ACTOR_TYPES) {
          const decision = checkTransition(from, to, actor, "a reason");
          expect(decision.allowed, `${from}>${to}:${actor}`).toBe(LEGAL.has(`${from}>${to}:${actor}`));
          checked++;
        }
      }
    }
    expect(checked).toBe(ORDER_STATUSES.length ** 2 * ACTOR_TYPES.length);
    expect(TRANSITIONS.flatMap((t) => t.actors)).toHaveLength(LEGAL.size);
  });

  it("stops customers from moving their own order forward (THREAT_MODEL T-04)", () => {
    expect(checkTransition("PLACED", "CONFIRMED", "CUSTOMER").allowed).toBe(false);
    expect(checkTransition("CONFIRMED", "READY_FOR_PICKUP", "CUSTOMER").allowed).toBe(false);
    expect(allowedTransitions("PLACED", "CUSTOMER")).toEqual(["CANCELLED"]);
    expect(allowedTransitions("CONFIRMED", "CUSTOMER")).toEqual([]);
  });

  it("requires a reason from staff when cancelling, releasing, or failing a delivery", () => {
    expect(checkTransition("PLACED", "CANCELLED", "CUSTOMER")).toMatchObject({
      allowed: true,
      rule: { id: "T2" },
    });
    expect(checkTransition("PLACED", "CANCELLED", "ADMIN")).toEqual({
      allowed: false,
      code: "REASON_REQUIRED",
    });
    expect(checkTransition("PLACED", "CANCELLED", "ADMIN", "   ")).toEqual({
      allowed: false,
      code: "REASON_REQUIRED",
    });
    expect(checkTransition("PLACED", "CANCELLED", "ADMIN", "Out of stock").allowed).toBe(true);
    expect(checkTransition("ASSIGNED", "READY_FOR_PICKUP", "COURIER")).toEqual({
      allowed: false,
      code: "REASON_REQUIRED",
    });
    expect(
      checkTransition("PICKED_UP", "DELIVERY_FAILED", "COURIER", "Nobody at the drop point").allowed,
    ).toBe(true);
    expect(checkTransition("PICKED_UP", "DELIVERED", "COURIER")).toMatchObject({
      allowed: true,
      rule: { id: "T10" },
    });
  });

  it("has no way out of a terminal status, and never lets SYSTEM act directly", () => {
    expect(TERMINAL_STATUSES).toEqual(["DELIVERED", "CANCELLED", "DELIVERY_FAILED"]);
    for (const status of ORDER_STATUSES) {
      expect(isTerminal(status)).toBe(TERMINAL_STATUSES.includes(status));
      for (const actor of ACTOR_TYPES) {
        if (isTerminal(status)) expect(allowedTransitions(status, actor)).toEqual([]);
      }
      expect(allowedTransitions(status, "SYSTEM")).toEqual([]);
    }
  });
});
