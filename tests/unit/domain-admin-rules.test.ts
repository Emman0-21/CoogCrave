import { describe, expect, it } from "vitest";

import {
  courierDecisionsFor,
  decisionStopsDeliveries,
  moderationRefusal,
  nextCourierStatus,
} from "@/server/domain/admin-rules";
import { COURIER_STATUSES } from "@/shared/enums";
import { COURIER_DECISIONS, demoResetSchema } from "@/shared/schemas/admin";

describe("courier decisions (PRD ADM-2)", () => {
  it("allows exactly the documented moves, from every status", () => {
    const table = Object.fromEntries(
      COURIER_STATUSES.map((status) => [
        status,
        Object.fromEntries(COURIER_DECISIONS.map((d) => [d, nextCourierStatus(status, d)])),
      ]),
    );
    expect(table).toEqual({
      PENDING: { APPROVE: "APPROVED", REJECT: "REJECTED", SUSPEND: null, REINSTATE: null },
      APPROVED: { APPROVE: null, REJECT: null, SUSPEND: "SUSPENDED", REINSTATE: null },
      REJECTED: { APPROVE: null, REJECT: null, SUSPEND: null, REINSTATE: null },
      SUSPENDED: { APPROVE: null, REJECT: null, SUSPEND: null, REINSTATE: "APPROVED" },
    });
  });

  it("offers the admin screen only the decisions that apply", () => {
    expect(courierDecisionsFor("PENDING")).toEqual(["APPROVE", "REJECT"]);
    expect(courierDecisionsFor("APPROVED")).toEqual(["SUSPEND"]);
    expect(courierDecisionsFor("REJECTED")).toEqual([]);
    expect(courierDecisionsFor("SUSPENDED")).toEqual(["REINSTATE"]);
  });

  it("only suspension takes a courier off the road", () => {
    expect(COURIER_DECISIONS.filter(decisionStopsDeliveries)).toEqual(["SUSPEND"]);
  });
});

describe("who an admin may suspend (PRD ADM-3)", () => {
  it("refuses yourself first, then other admins, and allows students", () => {
    expect(moderationRefusal("a", { id: "a", role: "ADMIN" })).toBe("CANNOT_MODERATE_SELF");
    expect(moderationRefusal("a", { id: "b", role: "ADMIN" })).toBe("CANNOT_MODERATE_ADMIN");
    expect(moderationRefusal("a", { id: "c", role: "STUDENT" })).toBeNull();
  });
});

describe("demo reset confirmation (THREAT_MODEL T-29)", () => {
  it("needs the exact phrase", () => {
    expect(demoResetSchema.safeParse({ confirm: "RESET DEMO DATA" }).success).toBe(true);
    expect(demoResetSchema.safeParse({ confirm: "reset demo data" }).success).toBe(false);
    expect(demoResetSchema.safeParse({}).success).toBe(false);
    expect(demoResetSchema.safeParse({ confirm: "RESET DEMO DATA", extra: 1 }).success).toBe(false);
  });
});
