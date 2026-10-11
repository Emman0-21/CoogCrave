import { describe, expect, it } from "vitest";

import { notificationHref } from "@/server/services/notifications";

describe("notification links", () => {
  it("sends each reader to a page they can open", () => {
    expect(notificationHref("ORDER_DELIVERED", "o1", true)).toBe("/orders/o1");
    expect(notificationHref("ORDER_CANCELLED", "o1", false)).toBe("/courier/history");
    expect(notificationHref("COURIER_APPLICATION_DECIDED", null, false)).toBe("/courier");
    expect(notificationHref("ORDER_PLACED", null, true)).toBeNull();
  });
});
