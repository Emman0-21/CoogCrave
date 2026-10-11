import { and, eq, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as auditGet } from "@/app/api/v1/admin/audit-events/route";
import { POST as decisionPost } from "@/app/api/v1/admin/couriers/[courierId]/decision/route";
import { GET as couriersGet } from "@/app/api/v1/admin/couriers/route";
import { GET as metricsGet } from "@/app/api/v1/admin/metrics/route";
import { GET as adminOrdersGet } from "@/app/api/v1/admin/orders/route";
import { PATCH as userPatch } from "@/app/api/v1/admin/users/[userId]/route";
import { GET as usersGet } from "@/app/api/v1/admin/users/route";
import { PUT as availabilityPut } from "@/app/api/v1/courier/availability/route";
import { GET as offersGet } from "@/app/api/v1/courier/offers/route";
import { GET as meGet } from "@/app/api/v1/me/route";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { transitionOrder } from "@/server/services/order-workflow";
import { seedCatalog } from "@/server/seed/catalog";
import type {
  AdminCourierView,
  AdminMetricsView,
  AdminOrderListView,
  AdminOrderView,
  AdminUserListView,
  AdminUserView,
} from "@/shared/schemas/admin";

import { signedInUser } from "../support/auth";
import { BURGER, courierAccount, readyOrder, transition, viewOrder } from "../support/delivery";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";
import { addToCart, checkout, clearOrdering, openAllWeek, seeded } from "../support/ordering";

type ErrorBody = { error: { code: string; message: string } };
const codeOf = async (response: Response) => (await bodyOf<ErrorBody>(response)).error?.code;
const ctx = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const decide = (jar: CookieJar, courierId: string, body: Record<string, unknown>) =>
  decisionPost(appRequest(`/api/v1/admin/couriers/${courierId}/decision`, { body, jar }), ctx({ courierId }));
const suspend = (jar: CookieJar, userId: string, body: Record<string, unknown>) =>
  userPatch(appRequest(`/api/v1/admin/users/${userId}`, { method: "PATCH", body, jar }), ctx({ userId }));
const auditFor = async (jar: CookieJar, targetType: string, targetId: string) =>
  (
    await bodyOf<{
      data: { action: string; metadata: Record<string, unknown>; actor: { id: string } | null }[];
    }>(
      await auditGet(
        appRequest(`/api/v1/admin/audit-events?targetType=${targetType}&targetId=${targetId}`, { jar }),
      ),
    )
  ).data;

describe("admin operations (PRD ADM-1…3, ADM-6, ADM-8, ADM-9)", () => {
  let pool: Pool;
  let db: TestDb;
  let admin: CookieJar;
  let adminId: string;
  let customer: CookieJar;
  let customerId: string;
  let customerEmail: string;

  const userIdOf = async (email: string) =>
    (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0]!.id;
  const notificationsOf = (userId: string) =>
    db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    const adminEmail = uniqueEmail("ada");
    admin = await signedInUser(adminEmail);
    await db
      .update(schema.users)
      .set({ role: "ADMIN", name: "Ada Admin" })
      .where(eq(schema.users.email, adminEmail));
    adminId = await userIdOf(adminEmail);
    customerEmail = uniqueEmail("casey");
    customer = await signedInUser(customerEmail);
    customerId = await userIdOf(customerEmail);
  });
  beforeEach(async () => {
    await clearOrdering(db);
    await openAllWeek(db, seeded.restaurant(BURGER));
  });
  afterAll(async () => {
    await pool.end();
  });

  describe("courier decisions (ADM-2)", () => {
    it("approves a pending applicant, who is told and can then go online; the decision is audited", async () => {
      const applicant = await courierAccount(db, "jamie", { status: "PENDING", isOnline: false });
      const response = await decide(admin, applicant.courierId, { decision: "APPROVE", note: "Welcome!" });
      expect(response.status).toBe(200);
      expect(await bodyOf<AdminCourierView>(response)).toMatchObject({
        status: "APPROVED",
        reviewedBy: "Ada Admin",
        reviewNote: "Welcome!",
        isOnline: false,
      });

      const [notice] = await notificationsOf(applicant.userId);
      expect(notice).toMatchObject({
        type: "COURIER_APPLICATION_DECIDED",
        title: "You're approved to deliver",
      });
      expect(await auditFor(admin, "courier", applicant.courierId)).toEqual([
        expect.objectContaining({
          action: "courier.approve",
          metadata: { from: "PENDING", to: "APPROVED", note: "Welcome!" },
          actor: expect.objectContaining({ id: adminId }),
        }),
      ]);
      const online = await availabilityPut(
        appRequest("/api/v1/courier/availability", {
          method: "PUT",
          body: { online: true },
          jar: applicant.jar,
        }),
      );
      expect(online.status).toBe(200);
    });

    it("refuses decisions that don't fit the courier's status, and deciding on your own profile", async () => {
      const approved = await courierAccount(db, "drew");
      const again = await decide(admin, approved.courierId, { decision: "APPROVE" });
      expect(again.status).toBe(409);
      expect(await codeOf(again)).toBe("INVALID_TRANSITION");
      expect((await decide(admin, approved.courierId, { decision: "REINSTATE" })).status).toBe(409);
      expect((await decide(admin, approved.courierId, { decision: "PROMOTE" })).status).toBe(400);

      const [own] = await db
        .insert(schema.courierProfiles)
        .values({ userId: adminId, transportMode: "WALK", guidelinesAcceptedAt: new Date() })
        .returning();
      const self = await decide(admin, own!.id, { decision: "APPROVE" });
      expect(self.status).toBe(422);
      expect(await codeOf(self)).toBe("CANNOT_MODERATE_SELF");
      await db.delete(schema.courierProfiles).where(eq(schema.courierProfiles.id, own!.id));
    });

    it("rejects with a note; the applicant may apply again", async () => {
      const applicant = await courierAccount(db, "morgan", { status: "PENDING", isOnline: false });
      const response = await decide(admin, applicant.courierId, {
        decision: "REJECT",
        note: "Add a photo ID",
      });
      expect(await bodyOf<AdminCourierView>(response)).toMatchObject({
        status: "REJECTED",
        reviewNote: "Add a photo ID",
      });
      const [notice] = await notificationsOf(applicant.userId);
      expect(notice?.title).toBe("Courier application not approved");
    });

    it("suspends an approved courier (offline, no offers) and reinstates them", async () => {
      const courier = await courierAccount(db, "quinn");
      expect(
        (await decide(admin, courier.courierId, { decision: "SUSPEND", note: "Late twice" })).status,
      ).toBe(200);
      const [profile] = await db
        .select()
        .from(schema.courierProfiles)
        .where(eq(schema.courierProfiles.id, courier.courierId));
      expect(profile).toMatchObject({ status: "SUSPENDED", isOnline: false, onlineSince: null });
      const offers = await offersGet(appRequest("/api/v1/courier/offers", { jar: courier.jar }));
      expect(offers.status).toBe(403);
      expect(await codeOf(offers)).toBe("COURIER_NOT_APPROVED");

      const back = await decide(admin, courier.courierId, { decision: "REINSTATE" });
      expect(await bodyOf<AdminCourierView>(back)).toMatchObject({ status: "APPROVED", isOnline: false });
    });

    it("won't suspend a courier in the middle of a delivery", async () => {
      const courier = await courierAccount(db, "reese");
      const orderId = await readyOrder(customer);
      expect((await transition(courier.jar, orderId, { toStatus: "ASSIGNED" })).status).toBe(200);
      const response = await decide(admin, courier.courierId, { decision: "SUSPEND" });
      expect(response.status).toBe(409);
      expect(await codeOf(response)).toBe("ACTIVE_DELIVERY_IN_PROGRESS");
    });

    it("never lets a suspension and an accept both succeed, 15 rounds of racing them", async () => {
      for (let round = 0; round < 15; round++) {
        await clearOrdering(db);
        const courier = await courierAccount(db, `race${round}`);
        const orderId = await readyOrder(customer);
        const [accept, suspension] = await Promise.all([
          transition(courier.jar, orderId, { toStatus: "ASSIGNED" }),
          decide(admin, courier.courierId, { decision: "SUSPEND" }),
        ]);
        const active = await db
          .select()
          .from(schema.deliveryAssignments)
          .where(
            and(
              eq(schema.deliveryAssignments.courierId, courier.courierId),
              isNull(schema.deliveryAssignments.endedAt),
            ),
          );
        if (accept.status === 200) {
          // The accept committed first: the suspension saw the delivery and refused.
          expect(suspension.status).toBe(409);
          expect(active).toHaveLength(1);
        } else {
          // The suspension committed first: the accept saw a suspended, offline courier.
          expect(suspension.status).toBe(200);
          expect(accept.status).toBe(403);
          expect(active).toHaveLength(0);
        }
      }
    });

    it("lists couriers by status, oldest application first, with delivery counts", async () => {
      const response = await couriersGet(
        appRequest("/api/v1/admin/couriers?status=APPROVED", { jar: admin }),
      );
      const list = (await bodyOf<{ data: AdminCourierView[] }>(response)).data;
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((c) => c.status === "APPROVED")).toBe(true);
      const applied = list.map((c) => c.appliedAt);
      expect([...applied].sort()).toEqual(applied);
      expect(
        (await couriersGet(appRequest("/api/v1/admin/couriers?status=NOPE", { jar: admin }))).status,
      ).toBe(400);
    });
  });

  describe("users and suspension (ADM-3, THREAT_MODEL T-07)", () => {
    it("suspends a student: signed out everywhere, offline as a courier, audited with the reason", async () => {
      const target = await courierAccount(db, "sky");
      const response = await suspend(admin, target.userId, { suspended: true, reason: "Fake orders" });
      expect(response.status).toBe(200);
      expect(await bodyOf<AdminUserView>(response)).toMatchObject({
        id: target.userId,
        suspendedAt: expect.any(String),
      });

      // Their session is gone, not just refused.
      expect(
        await db.select().from(schema.sessions).where(eq(schema.sessions.userId, target.userId)),
      ).toEqual([]);
      expect((await meGet(appRequest("/api/v1/me", { jar: target.jar }))).status).toBe(401);
      const [profile] = await db
        .select()
        .from(schema.courierProfiles)
        .where(eq(schema.courierProfiles.userId, target.userId));
      expect(profile?.isOnline).toBe(false);

      // Repeating it changes nothing and writes no second audit row.
      expect((await suspend(admin, target.userId, { suspended: true, reason: "Again" })).status).toBe(200);
      expect((await auditFor(admin, "user", target.userId)).map((e) => e.action)).toEqual(["user.suspend"]);

      const back = await suspend(admin, target.userId, { suspended: false, reason: "Appeal accepted" });
      expect(await bodyOf<AdminUserView>(back)).toMatchObject({ suspendedAt: null });
      const audit = await auditFor(admin, "user", target.userId);
      expect(audit.map((e) => e.action)).toEqual(["user.unsuspend", "user.suspend"]);
      expect(audit[1]!.metadata).toEqual({ reason: "Fake orders" });
    });

    it("needs a reason, and refuses yourself, other admins, and couriers mid-delivery", async () => {
      const noReason = await suspend(admin, customerId, { suspended: true, reason: "   " });
      expect(noReason.status).toBe(400);

      const self = await suspend(admin, adminId, { suspended: true, reason: "Oops" });
      expect(self.status).toBe(422);
      expect(await codeOf(self)).toBe("CANNOT_MODERATE_SELF");

      const otherEmail = uniqueEmail("ola");
      await signedInUser(otherEmail);
      await db.update(schema.users).set({ role: "ADMIN" }).where(eq(schema.users.email, otherEmail));
      const other = await suspend(admin, await userIdOf(otherEmail), { suspended: true, reason: "Coup" });
      expect(other.status).toBe(422);
      expect(await codeOf(other)).toBe("CANNOT_MODERATE_ADMIN");

      const busy = await courierAccount(db, "blake");
      const orderId = await readyOrder(customer);
      await transition(busy.jar, orderId, { toStatus: "ASSIGNED" });
      const midDelivery = await suspend(admin, busy.userId, { suspended: true, reason: "Rude" });
      expect(midDelivery.status).toBe(409);
      expect(await codeOf(midDelivery)).toBe("ACTIVE_DELIVERY_IN_PROGRESS");
    });

    it("searches by name or email and filters by suspension, newest first, a page at a time", async () => {
      const search = await usersGet(
        appRequest(`/api/v1/admin/users?q=${encodeURIComponent(customerEmail)}`, { jar: admin }),
      );
      expect((await bodyOf<AdminUserListView>(search)).data.map((u) => u.id)).toEqual([customerId]);

      const byName = await bodyOf<AdminUserListView>(
        await usersGet(appRequest("/api/v1/admin/users?q=ada%20admin", { jar: admin })),
      );
      expect(byName.data.map((u) => u.id)).toContain(adminId);

      // A literal % doesn't match everything.
      const wildcard = await bodyOf<AdminUserListView>(
        await usersGet(appRequest("/api/v1/admin/users?q=%25", { jar: admin })),
      );
      expect(wildcard.data).toEqual([]);

      const first = await bodyOf<AdminUserListView>(
        await usersGet(appRequest("/api/v1/admin/users?limit=2", { jar: admin })),
      );
      expect(first.data).toHaveLength(2);
      const second = await bodyOf<AdminUserListView>(
        await usersGet(appRequest(`/api/v1/admin/users?limit=2&cursor=${first.nextCursor}`, { jar: admin })),
      );
      expect(second.data.map((u) => u.id)).not.toContain(first.data[0]!.id);
      expect(Date.parse(second.data[0]!.createdAt)).toBeLessThanOrEqual(Date.parse(first.data[1]!.createdAt));

      const suspended = await bodyOf<AdminUserListView>(
        await usersGet(appRequest("/api/v1/admin/users?suspended=true", { jar: admin })),
      );
      expect(suspended.data.every((u) => u.suspendedAt !== null)).toBe(true);
      expect((await usersGet(appRequest("/api/v1/admin/users?role=OWNER", { jar: admin }))).status).toBe(400);
    });
  });

  describe("orders (ADM-6, ADM-8)", () => {
    it("shows admins the full record: customer, who did what and why, assignments, payment", async () => {
      const courier = await courierAccount(db, "kai");
      const orderId = await readyOrder(customer, { tipCents: 200, deliveryInstructions: "Lobby" });
      await transition(courier.jar, orderId, { toStatus: "ASSIGNED" });
      await transition(courier.jar, orderId, { toStatus: "READY_FOR_PICKUP", reason: "Flat tire" });

      const response = await viewOrder(admin, orderId);
      expect(response.status).toBe(200);
      const view = await bodyOf<AdminOrderView>(response);
      expect(view).toMatchObject({
        viewer: "ADMIN",
        status: "READY_FOR_PICKUP",
        customer: { id: customerId, email: customerEmail },
        deliveryInstructions: "Lobby",
        payment: { mode: "DEMO", status: "AUTHORIZED", amountCents: view.price.totalCents },
      });
      expect(view.timeline.map((e) => [e.status, e.actorType, e.reason])).toEqual([
        ["PLACED", "CUSTOMER", null],
        ["CONFIRMED", "RESTAURANT_SIM", null],
        ["READY_FOR_PICKUP", "RESTAURANT_SIM", null],
        ["ASSIGNED", "COURIER", null],
        ["READY_FOR_PICKUP", "COURIER", "Flat tire"],
      ]);
      expect(view.timeline[3]!.actor).toEqual({ id: courier.userId, name: "Kai Courier" });
      expect(view.assignments).toEqual([
        expect.objectContaining({ courierName: "Kai Courier", endReason: "RELEASED_BY_COURIER" }),
      ]);
      expect(view.allowedTransitions).toEqual([{ toStatus: "CANCELLED", reasonRequired: true }]);
    });

    it("cancels a new order with a reason: payment voided, customer told, audited", async () => {
      await addToCart(customer, { menuItemId: seeded.item(BURGER, "cheeseburger"), quantity: 1 });
      const order = await checkout(customer, seeded.location("library"));

      const noReason = await transition(admin, order.id, { toStatus: "CANCELLED" });
      expect(noReason.status).toBe(422);
      expect(await codeOf(noReason)).toBe("REASON_REQUIRED");

      const response = await transition(admin, order.id, {
        toStatus: "CANCELLED",
        reason: "Duplicate order",
      });
      expect(response.status).toBe(200);
      const view = await bodyOf<AdminOrderView>(response);
      expect(view).toMatchObject({ viewer: "ADMIN", status: "CANCELLED", payment: { status: "VOIDED" } });
      expect(view.timeline.at(-1)).toMatchObject({
        actorType: "ADMIN",
        actor: { id: adminId },
        reason: "Duplicate order",
      });
      expect((await notificationsOf(customerId)).map((n) => n.type)).toContain("ORDER_CANCELLED");
      expect(await auditFor(admin, "order", order.id)).toEqual([
        expect.objectContaining({
          action: "order.admin_cancelled",
          metadata: expect.objectContaining({ from: "PLACED", to: "CANCELLED", reason: "Duplicate order" }),
        }),
      ]);
    });

    it("unassigns a courier before pickup: back to ready, both sides told, gone from that courier's offers", async () => {
      const courier = await courierAccount(db, "lee");
      const orderId = await readyOrder(customer);
      await transition(courier.jar, orderId, { toStatus: "ASSIGNED" });

      const response = await transition(admin, orderId, {
        toStatus: "READY_FOR_PICKUP",
        reason: "Courier not moving",
      });
      expect(response.status).toBe(200);
      expect(await bodyOf<AdminOrderView>(response)).toMatchObject({
        status: "READY_FOR_PICKUP",
        assignments: [expect.objectContaining({ endReason: "UNASSIGNED_BY_ADMIN" })],
      });
      const [courierNotice] = await notificationsOf(courier.userId);
      expect(courierNotice).toMatchObject({ type: "COURIER_RELEASED", title: "Delivery reassigned" });
      expect((await notificationsOf(customerId)).map((n) => n.type)).toContain("COURIER_RELEASED");
      const offers = await offersGet(appRequest("/api/v1/courier/offers", { jar: courier.jar }));
      expect(
        (await bodyOf<{ data: { orderId: string }[] }>(offers)).data.map((o) => o.orderId),
      ).not.toContain(orderId);
    });

    it("cancels an assigned order and closes a picked-up one as failed, ending the delivery each time", async () => {
      const courier = await courierAccount(db, "max");
      const assigned = await readyOrder(customer);
      await transition(courier.jar, assigned, { toStatus: "ASSIGNED" });
      const cancel = await transition(admin, assigned, {
        toStatus: "CANCELLED",
        reason: "Restaurant closed early",
      });
      expect(await bodyOf<AdminOrderView>(cancel)).toMatchObject({
        status: "CANCELLED",
        payment: { status: "VOIDED" },
        assignments: [expect.objectContaining({ endReason: "ORDER_CANCELLED", payoutCents: null })],
      });
      expect((await notificationsOf(courier.userId)).map((n) => n.title)).toContain("Delivery cancelled");

      const pickedUp = await readyOrder(customer);
      await transition(courier.jar, pickedUp, { toStatus: "ASSIGNED" });
      await transition(courier.jar, pickedUp, { toStatus: "PICKED_UP" });
      // There's no "cancel" after pickup; the admin closes it as a failed delivery.
      expect((await transition(admin, pickedUp, { toStatus: "CANCELLED", reason: "x" })).status).toBe(409);
      const failed = await transition(admin, pickedUp, {
        toStatus: "DELIVERY_FAILED",
        reason: "Customer unreachable",
      });
      expect(await bodyOf<AdminOrderView>(failed)).toMatchObject({
        status: "DELIVERY_FAILED",
        payment: { status: "VOIDED" },
        assignments: [expect.objectContaining({ endReason: "DELIVERY_FAILED", payoutCents: null })],
      });
    });

    it("doesn't let admins make restaurant or courier moves as ADMIN", async () => {
      await addToCart(customer, { menuItemId: seeded.item(BURGER, "cheeseburger"), quantity: 1 });
      const order = await checkout(customer, seeded.location("library"));
      // Confirming is the restaurant's move: the Kitchen Console sends actingAs.
      const confirm = await transition(admin, order.id, { toStatus: "CONFIRMED", reason: "x" });
      expect(confirm.status).toBe(409);
      expect(await codeOf(confirm)).toBe("INVALID_TRANSITION");
    });

    it("lists every order newest first, filtered by status, order number, or customer email", async () => {
      await addToCart(customer, { menuItemId: seeded.item(BURGER, "cheeseburger"), quantity: 1 });
      const placed = await checkout(customer, seeded.location("library"));
      const ready = await readyOrder(customer);

      const all = await bodyOf<AdminOrderListView>(
        await adminOrdersGet(appRequest("/api/v1/admin/orders", { jar: admin })),
      );
      expect(all.data.map((o) => o.id)).toEqual([ready, placed.id]);
      expect(all.data[0]).toMatchObject({ customerEmail, restaurantName: "The Burger Joint" });

      const readyOnly = await bodyOf<AdminOrderListView>(
        await adminOrdersGet(
          appRequest("/api/v1/admin/orders?status=READY_FOR_PICKUP&status=ASSIGNED", { jar: admin }),
        ),
      );
      expect(readyOnly.data.map((o) => o.id)).toEqual([ready]);

      const byNumber = await bodyOf<AdminOrderListView>(
        await adminOrdersGet(
          appRequest(`/api/v1/admin/orders?q=${placed.orderNumber.toLowerCase()}`, { jar: admin }),
        ),
      );
      expect(byNumber.data.map((o) => o.id)).toEqual([placed.id]);

      const byEmail = await bodyOf<AdminOrderListView>(
        await adminOrdersGet(
          appRequest(`/api/v1/admin/orders?q=${encodeURIComponent(customerEmail)}`, { jar: admin }),
        ),
      );
      expect(byEmail.data).toHaveLength(2);

      const page = await bodyOf<AdminOrderListView>(
        await adminOrdersGet(appRequest("/api/v1/admin/orders?limit=1", { jar: admin })),
      );
      const next = await bodyOf<AdminOrderListView>(
        await adminOrdersGet(
          appRequest(`/api/v1/admin/orders?limit=1&cursor=${page.nextCursor}`, { jar: admin }),
        ),
      );
      expect(next.data.map((o) => o.id)).toEqual([placed.id]);
      expect(next.nextCursor).toBeNull();
    });
  });

  describe("dashboard (ADM-1)", () => {
    it("counts today's orders by status, couriers online, applications waiting, and captured demo payments", async () => {
      await db.delete(schema.courierProfiles).where(eq(schema.courierProfiles.status, "PENDING"));
      await db.update(schema.courierProfiles).set({ isOnline: false, onlineSince: null });
      const courier = await courierAccount(db, "nova");
      await courierAccount(db, "applicant", { status: "PENDING", isOnline: false });

      await addToCart(customer, { menuItemId: seeded.item(BURGER, "cheeseburger"), quantity: 1 });
      await checkout(customer, seeded.location("library"));
      const delivered = await readyOrder(customer);
      for (const toStatus of ["ASSIGNED", "PICKED_UP", "DELIVERED"] as const) {
        await transition(courier.jar, delivered, { toStatus });
      }
      const inProgress = await readyOrder(customer);
      await transition(courier.jar, inProgress, { toStatus: "ASSIGNED" });
      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, delivered));

      const metrics = await bodyOf<AdminMetricsView>(
        await metricsGet(appRequest("/api/v1/admin/metrics", { jar: admin })),
      );
      expect(metrics.ordersToday).toMatchObject({ PLACED: 1, ASSIGNED: 1, DELIVERED: 1, CANCELLED: 0 });
      expect(metrics).toMatchObject({
        onlineCouriers: 1,
        pendingApplications: 1,
        activeDeliveries: 1,
        simulatedGmvTodayCents: payment!.amountCents,
      });
    });
  });

  it("admin projection is admin-only: the customer still gets the customer view", async () => {
    const orderId = await readyOrder(customer);
    const asCustomer = await bodyOf<{ viewer: string; customer?: unknown }>(
      await viewOrder(customer, orderId),
    );
    expect(asCustomer.viewer).toBe("CUSTOMER");
    expect(asCustomer.customer).toBeUndefined();
    // The referee is also used directly by trusted code (seed, tests); admin moves there need a reason too.
    await expect(
      transitionOrder(getDb(), { orderId, toStatus: "CANCELLED", actorType: "ADMIN", actorUserId: adminId }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  });
});
