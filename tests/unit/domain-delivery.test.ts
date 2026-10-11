import { describe, expect, it } from "vitest";

import {
  acceptRefusal,
  COURIER_ACCESS_AFTER_END_MS,
  courierCanSeeInstructions,
  courierCanViewOrder,
  customerNameForCourier,
  firstNameOf,
  payoutFor,
} from "@/server/domain/delivery";

describe("delivery rules (PRD §6 rules 2 and 4)", () => {
  it("pays the courier the delivery fee plus the whole tip, in integer cents", () => {
    expect(payoutFor({ deliveryFeeCents: 249, tipCents: 300 })).toBe(549);
    expect(payoutFor({ deliveryFeeCents: 249, tipCents: 0 })).toBe(249);
    expect(() => payoutFor({ deliveryFeeCents: 2.5, tipCents: 0 })).toThrow(RangeError);
    expect(() => payoutFor({ deliveryFeeCents: 249, tipCents: -1 })).toThrow(RangeError);
  });

  const ready = { status: "READY_FOR_PICKUP", customerId: "customer" };
  const courier = { id: "c1", status: "APPROVED" as const, isOnline: true, hasActiveDelivery: false };

  it("lets an approved, online, free courier accept someone else's ready order", () => {
    expect(acceptRefusal(courier, "courier-user", ready)).toBeNull();
  });

  it("reports the most basic problem first", () => {
    expect(acceptRefusal({ ...courier, status: "PENDING", isOnline: false }, "u", ready)).toBe(
      "COURIER_NOT_APPROVED",
    );
    expect(acceptRefusal({ ...courier, status: "SUSPENDED" }, "u", ready)).toBe("COURIER_NOT_APPROVED");
    expect(acceptRefusal({ ...courier, isOnline: false, hasActiveDelivery: true }, "u", ready)).toBe(
      "COURIER_OFFLINE",
    );
    expect(acceptRefusal({ ...courier, hasActiveDelivery: true }, "customer", ready)).toBe(
      "CANNOT_ACCEPT_OWN_ORDER",
    );
    expect(acceptRefusal({ ...courier, hasActiveDelivery: true }, "u", ready)).toBe(
      "COURIER_HAS_ACTIVE_DELIVERY",
    );
    for (const status of ["PLACED", "CONFIRMED", "ASSIGNED", "PICKED_UP", "DELIVERED", "CANCELLED"]) {
      expect(acceptRefusal(courier, "u", { ...ready, status }), status).toBe("OFFER_UNAVAILABLE");
    }
  });

  it("shows couriers a display name, or first name and last initial, never the full name", () => {
    expect(customerNameForCourier(null, "Alex Rivera")).toBe("Alex R.");
    expect(customerNameForCourier(null, "  maría   josé  de la cruz ")).toBe("maría C.");
    expect(customerNameForCourier(null, "Cher")).toBe("Cher");
    expect(customerNameForCourier(null, "   ")).toBe("Customer");
    expect(customerNameForCourier("  AJ  ", "Alex Rivera")).toBe("AJ");
    expect(customerNameForCourier("   ", "Alex Rivera")).toBe("Alex R.");
    expect(firstNameOf("Jordan Lee")).toBe("Jordan");
    expect(firstNameOf("  ")).toBe("Your courier");
  });

  it("shows instructions only during the delivery, and the order for 24 hours after (THREAT_MODEL T-05)", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(courierCanSeeInstructions({ endedAt: null })).toBe(true);
    expect(courierCanSeeInstructions({ endedAt: now })).toBe(false);
    expect(courierCanViewOrder({ endedAt: null }, now)).toBe(true);
    expect(courierCanViewOrder({ endedAt: new Date(now.getTime() - COURIER_ACCESS_AFTER_END_MS) }, now)).toBe(
      true,
    );
    expect(
      courierCanViewOrder({ endedAt: new Date(now.getTime() - COURIER_ACCESS_AFTER_END_MS - 1) }, now),
    ).toBe(false);
  });
});

describe("payout input", () => {
  it("accepts a whole order row and looks only at the fee and tip", () => {
    expect(payoutFor({ id: "order-1", deliveryFeeCents: 249, tipCents: 100 } as never)).toBe(349);
  });
});
