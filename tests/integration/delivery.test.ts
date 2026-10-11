import { and, eq, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as auditGet } from "@/app/api/v1/admin/audit-events/route";
import { GET as kitchenGet } from "@/app/api/v1/admin/kitchen/route";
import { POST as applyPost } from "@/app/api/v1/courier/application/route";
import { PUT as availabilityPut } from "@/app/api/v1/courier/availability/route";
import { GET as activeGet } from "@/app/api/v1/courier/deliveries/active/route";
import { GET as deliveriesGet } from "@/app/api/v1/courier/deliveries/route";
import { GET as earningsGet } from "@/app/api/v1/courier/earnings/route";
import { GET as courierMeGet } from "@/app/api/v1/courier/me/route";
import { POST as declinePost } from "@/app/api/v1/courier/offers/[orderId]/decline/route";
import { GET as offersGet } from "@/app/api/v1/courier/offers/route";
import * as schema from "@/server/db/schema";
import { seedCatalog } from "@/server/seed/catalog";
import type {
  CourierOrderView,
  DeliverySummaryView,
  EarningsView,
  KitchenOrderView,
  OfferView,
} from "@/shared/schemas/delivery";
import type { OrderDetailView } from "@/shared/schemas/ordering";

import { signedInUser } from "../support/auth";
import { BURGER, courierAccount, readyOrder, transition, viewOrder } from "../support/delivery";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";
import { addToCart, checkout, clearOrdering, openAllWeek, seeded } from "../support/ordering";

type ErrorBody = { error: { code: string; message: string } };
const codeOf = async (response: Response) => (await bodyOf<ErrorBody>(response)).error?.code;

const offers = async (jar: CookieJar) => offersGet(appRequest("/api/v1/courier/offers", { jar }));
const offerList = async (jar: CookieJar) => (await bodyOf<{ data: OfferView[] }>(await offers(jar))).data;
const decline = (jar: CookieJar, orderId: string) =>
  declinePost(appRequest(`/api/v1/courier/offers/${orderId}/decline`, { body: {}, jar }), {
    params: Promise.resolve({ orderId }),
  });

describe("courier delivery (PRD DLV-1…11)", () => {
  let pool: Pool;
  let db: TestDb;
  let alex: CookieJar; // customer
  let alexId: string;
  let sam: Awaited<ReturnType<typeof courierAccount>>; // approved courier
  let riley: Awaited<ReturnType<typeof courierAccount>>; // second approved courier
  let admin: CookieJar;

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    const email = uniqueEmail("alex");
    alex = await signedInUser(email);
    alexId = (await db.select().from(schema.users).where(eq(schema.users.email, email)))[0]!.id;
    await db.insert(schema.userProfiles).values({ userId: alexId, displayName: null });
    sam = await courierAccount(db, "sam");
    riley = await courierAccount(db, "riley");
    const adminEmail = uniqueEmail("admin");
    admin = await signedInUser(adminEmail);
    await db.update(schema.users).set({ role: "ADMIN" }).where(eq(schema.users.email, adminEmail));
  });
  beforeEach(async () => {
    await clearOrdering(db);
    await openAllWeek(db, seeded.restaurant(BURGER));
    await db
      .update(schema.courierProfiles)
      .set({ isOnline: true, onlineSince: new Date(), status: "APPROVED" })
      .where(eq(schema.courierProfiles.userId, sam.userId));
  });
  afterAll(async () => {
    await pool.end();
  });

  describe("applying and going online (DLV-1, DLV-2)", () => {
    it("takes an application as PENDING and never lets the applicant approve themselves", async () => {
      const student = await signedInUser(uniqueEmail("applicant"));
      expect((await courierMeGet(appRequest("/api/v1/courier/me", { jar: student }))).status).toBe(404);

      const apply = (body: unknown) =>
        applyPost(appRequest("/api/v1/courier/application", { body, jar: student }));
      expect((await apply({ transportMode: "BIKE", acceptGuidelines: false })).status).toBe(400);
      expect(
        (await apply({ transportMode: "BIKE", acceptGuidelines: true, status: "APPROVED" })).status,
      ).toBe(400);
      expect((await apply({ transportMode: "CAR", acceptGuidelines: true })).status).toBe(400);

      const applied = await apply({ transportMode: "BIKE", acceptGuidelines: true });
      expect(applied.status).toBe(201);
      expect(await bodyOf(applied)).toMatchObject({
        status: "PENDING",
        transportMode: "BIKE",
        isOnline: false,
      });
      const again = await apply({ transportMode: "WALK", acceptGuidelines: true });
      expect(again.status).toBe(409);
      expect(await codeOf(again)).toBe("COURIER_APPLICATION_EXISTS");

      // Pending applicants can't go online or see offers.
      const online = await availabilityPut(
        appRequest("/api/v1/courier/availability", { method: "PUT", body: { online: true }, jar: student }),
      );
      expect(online.status).toBe(403);
      expect(await codeOf(online)).toBe("COURIER_NOT_APPROVED");
      expect((await offers(student)).status).toBe(403);
    });

    it("lets a rejected applicant apply again", async () => {
      const rejected = await courierAccount(db, "rejected", {
        status: "REJECTED",
        isOnline: false,
        reviewNote: "Incomplete",
      });
      const response = await applyPost(
        appRequest("/api/v1/courier/application", {
          body: { transportMode: "SCOOTER", acceptGuidelines: true },
          jar: rejected.jar,
        }),
      );
      expect(response.status).toBe(201);
      expect(await bodyOf(response)).toMatchObject({
        status: "PENDING",
        transportMode: "SCOOTER",
        reviewNote: null,
      });
    });

    it("toggles availability and keeps the original online-since time", async () => {
      const set = async (online: boolean) =>
        bodyOf<{ isOnline: boolean; onlineSince: string | null }>(
          await availabilityPut(
            appRequest("/api/v1/courier/availability", { method: "PUT", body: { online }, jar: sam.jar }),
          ),
        );
      expect(await set(false)).toEqual({ isOnline: false, onlineSince: null });
      expect((await offers(sam.jar)).status).toBe(403);
      expect(await codeOf(await offers(sam.jar))).toBe("COURIER_OFFLINE");
      const first = await set(true);
      expect(first.isOnline).toBe(true);
      expect((await set(true)).onlineSince).toBe(first.onlineSince);
    });
  });

  describe("offers (DLV-3, DLV-4, THREAT_MODEL T-05)", () => {
    it("shows ready orders with only what a courier needs to decide: no customer name, note, or prices", async () => {
      const orderId = await readyOrder(alex, {
        tipCents: 300,
        deliveryInstructions: "Meet at the east doors",
      });
      const list = await offerList(sam.jar);
      expect(list).toEqual([
        {
          orderId,
          restaurantName: "The Burger Joint",
          pickupLocation: "Retail, Auxiliary, and Dining (RAD) Center",
          dropLocation: "M.D. Anderson Memorial Library",
          itemCount: 2,
          readySince: expect.any(String),
          estimatedPayoutCents: 549,
          payoutIsSimulated: true,
        },
      ]);
      expect(JSON.stringify(list)).not.toMatch(/Alex|Rivera|east doors|totalCents|subtotal|email/i);
    });

    it("never offers couriers their own orders, or orders that aren't ready", async () => {
      await addToCart(sam.jar, { menuItemId: seeded.item(BURGER, "fries"), quantity: 2 });
      const own = await checkout(sam.jar, seeded.location("library"));
      expect(await offerList(sam.jar)).toEqual([]); // own order is still PLACED, and would be hidden anyway
      expect((await decline(sam.jar, own.id)).status).toBe(404);
    });

    it("hides a declined offer from that courier only, idempotently", async () => {
      const orderId = await readyOrder(alex);
      expect((await decline(sam.jar, orderId)).status).toBe(204);
      expect((await decline(sam.jar, orderId)).status).toBe(204);
      expect(await offerList(sam.jar)).toEqual([]);
      expect((await offerList(riley.jar)).map((o) => o.orderId)).toEqual([orderId]);
      expect((await decline(sam.jar, crypto.randomUUID())).status).toBe(404);
    });
  });

  describe("accepting (DLV-5…7)", () => {
    it("assigns the courier, shows them the delivery, and tells the customer", async () => {
      const orderId = await readyOrder(alex, {
        tipCents: 300,
        deliveryInstructions: "Meet at the east doors",
      });
      const response = await transition(sam.jar, orderId, { toStatus: "ASSIGNED" });
      expect(response.status).toBe(200);
      const view = await bodyOf<CourierOrderView>(response);
      expect(view).toMatchObject({
        viewer: "COURIER",
        status: "ASSIGNED",
        customerName: "Alex R.",
        deliveryInstructions: "Meet at the east doors",
        deliveryLocation: { name: "M.D. Anderson Memorial Library" },
        payoutCents: 549,
        payoutIsSimulated: true,
        allowedTransitions: [
          { toStatus: "READY_FOR_PICKUP", reasonRequired: true },
          { toStatus: "PICKED_UP", reasonRequired: false },
        ],
      });
      expect(view.items).toEqual([
        { name: "Double cheeseburger", quantity: 2, options: ["Bacon"], specialInstructions: null },
      ]);
      expect(JSON.stringify(view)).not.toMatch(/email|subtotalCents|totalCents|customerId/);

      const customerView = await bodyOf<OrderDetailView>(await viewOrder(alex, orderId));
      expect(customerView).toMatchObject({
        status: "ASSIGNED",
        courier: { firstName: "Sam", transportMode: "WALK" },
      });
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orderId, orderId));
      expect(notices.map((n) => n.type)).toContain("COURIER_ASSIGNED");

      // Re-sending the accept changes nothing; another courier is told it's gone.
      expect((await transition(sam.jar, orderId, { toStatus: "ASSIGNED" })).status).toBe(200);
      const late = await transition(riley.jar, orderId, { toStatus: "ASSIGNED" });
      expect(late.status).toBe(409);
      expect(await codeOf(late)).toBe("OFFER_UNAVAILABLE");
      expect(await offerList(riley.jar)).toEqual([]);
      const events = await db
        .select()
        .from(schema.orderStatusEvents)
        .where(eq(schema.orderStatusEvents.orderId, orderId));
      expect(events.filter((e) => e.toStatus === "ASSIGNED")).toHaveLength(1);
    });

    it("uses the customer's chosen display name when they set one", async () => {
      await db
        .update(schema.userProfiles)
        .set({ displayName: "AJ" })
        .where(eq(schema.userProfiles.userId, alexId));
      const orderId = await readyOrder(alex);
      const view = await bodyOf<CourierOrderView>(
        await transition(sam.jar, orderId, { toStatus: "ASSIGNED" }),
      );
      expect(view.customerName).toBe("AJ");
      await db
        .update(schema.userProfiles)
        .set({ displayName: null })
        .where(eq(schema.userProfiles.userId, alexId));
    });

    it("refuses offline couriers, their own orders, and a second delivery at once (DLV-6, THREAT_MODEL T-06)", async () => {
      const first = await readyOrder(alex);
      const second = await readyOrder(alex);
      await db
        .update(schema.courierProfiles)
        .set({ isOnline: false, onlineSince: null })
        .where(eq(schema.courierProfiles.id, sam.courierId));
      const offline = await transition(sam.jar, first, { toStatus: "ASSIGNED" });
      expect([offline.status, await codeOf(offline)]).toEqual([403, "COURIER_OFFLINE"]);
      await db
        .update(schema.courierProfiles)
        .set({ isOnline: true, onlineSince: new Date() })
        .where(eq(schema.courierProfiles.id, sam.courierId));

      expect((await transition(sam.jar, first, { toStatus: "ASSIGNED" })).status).toBe(200);
      const busy = await transition(sam.jar, second, { toStatus: "ASSIGNED" });
      expect([busy.status, await codeOf(busy)]).toEqual([409, "COURIER_HAS_ACTIVE_DELIVERY"]);

      // A courier's own order: the customer side is irrelevant, it can't be accepted.
      await addToCart(riley.jar, { menuItemId: seeded.item(BURGER, "fries"), quantity: 2 });
      const own = await checkout(riley.jar, seeded.location("library"));
      const { transitionOrder } = await import("@/server/services/order-workflow");
      const { getDb } = await import("@/server/db/client");
      for (const toStatus of ["CONFIRMED", "READY_FOR_PICKUP"] as const) {
        await transitionOrder(getDb(), {
          orderId: own.id,
          toStatus,
          actorType: "RESTAURANT_SIM",
          actorUserId: null,
        });
      }
      const self = await transition(riley.jar, own.id, { toStatus: "ASSIGNED" });
      expect([self.status, await codeOf(self)]).toEqual([422, "CANNOT_ACCEPT_OWN_ORDER"]);
    });

    it("lets exactly one of many simultaneous couriers win, 20 rounds in a row (DLV-5, THREAT_MODEL T-09)", async () => {
      const couriers = [sam, riley];
      for (let i = 0; i < 4; i++) couriers.push(await courierAccount(db, `racer${i}`));
      for (let round = 0; round < 20; round++) {
        await db.delete(schema.deliveryAssignments);
        await db.delete(schema.rateLimitBuckets); // 20 orders a minute is over the real limit
        const orderId = await readyOrder(alex);
        const responses = await Promise.all(
          couriers.map((c) => transition(c.jar, orderId, { toStatus: "ASSIGNED" })),
        );
        const statuses = responses.map((r) => r.status).sort();
        expect(statuses, `round ${round}`).toEqual([200, 409, 409, 409, 409, 409]);
        for (const r of responses.filter((r) => r.status === 409))
          expect(await codeOf(r)).toBe("OFFER_UNAVAILABLE");
        const active = await db
          .select()
          .from(schema.deliveryAssignments)
          .where(
            and(eq(schema.deliveryAssignments.orderId, orderId), isNull(schema.deliveryAssignments.endedAt)),
          );
        expect(active, `round ${round}`).toHaveLength(1);
      }
    });

    it("lets a courier double-tapping two offers end up with only one (DLV-6)", async () => {
      for (let round = 0; round < 10; round++) {
        await db.delete(schema.deliveryAssignments);
        const [a, b] = [await readyOrder(alex), await readyOrder(alex)];
        const responses = await Promise.all(
          [a, b].map((id) => transition(sam.jar, id, { toStatus: "ASSIGNED" })),
        );
        expect(responses.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 409]);
        const loser = responses.find((r) => r.status === 409)!;
        expect(await codeOf(loser)).toBe("COURIER_HAS_ACTIVE_DELIVERY");
        const active = await db
          .select()
          .from(schema.deliveryAssignments)
          .where(
            and(
              eq(schema.deliveryAssignments.courierId, sam.courierId),
              isNull(schema.deliveryAssignments.endedAt),
            ),
          );
        expect(active).toHaveLength(1);
        // The losing order stays an offer for others.
        const [loserOrder] = await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.status, "READY_FOR_PICKUP"));
        expect(loserOrder).toBeDefined();
        await clearOrdering(db);
        await openAllWeek(db, seeded.restaurant(BURGER));
      }
    });
  });

  describe("delivering (DLV-8…10)", () => {
    it("goes picked up → delivered, records the simulated payout, captures the demo payment, and hides the note after", async () => {
      const orderId = await readyOrder(alex, {
        tipCents: 300,
        deliveryInstructions: "Meet at the east doors",
      });
      await transition(sam.jar, orderId, { toStatus: "ASSIGNED" });

      const early = await transition(sam.jar, orderId, { toStatus: "DELIVERED" });
      expect([early.status, await codeOf(early)]).toEqual([409, "INVALID_TRANSITION"]);
      expect((await transition(riley.jar, orderId, { toStatus: "PICKED_UP" })).status).toBe(404);
      expect((await transition(alex, orderId, { toStatus: "PICKED_UP" })).status).toBe(409);

      const picked = await bodyOf<CourierOrderView>(
        await transition(sam.jar, orderId, { toStatus: "PICKED_UP" }),
      );
      expect(picked.status).toBe("PICKED_UP");
      expect(picked.assignment.pickedUpAt).not.toBeNull();
      expect((await transition(sam.jar, orderId, { toStatus: "READY_FOR_PICKUP", reason: "x" })).status).toBe(
        409,
      );

      const delivered = await bodyOf<CourierOrderView>(
        await transition(sam.jar, orderId, { toStatus: "DELIVERED" }),
      );
      expect(delivered).toMatchObject({
        status: "DELIVERED",
        payoutCents: 549,
        deliveryInstructions: null,
        allowedTransitions: [],
        assignment: { endReason: "DELIVERED" },
      });
      const [assignment] = await db
        .select()
        .from(schema.deliveryAssignments)
        .where(eq(schema.deliveryAssignments.orderId, orderId));
      expect(assignment).toMatchObject({ payoutCents: 549, endReason: "DELIVERED" });
      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
      expect(payment!.status).toBe("CAPTURED");

      const customer = await bodyOf<OrderDetailView>(await viewOrder(alex, orderId));
      expect(customer).toMatchObject({
        status: "DELIVERED",
        courier: { firstName: "Sam" },
        payment: { status: "CAPTURED" },
      });
      expect(customer.timeline.map((t) => [t.status, t.actorType])).toEqual([
        ["PLACED", "CUSTOMER"],
        ["CONFIRMED", "RESTAURANT_SIM"],
        ["READY_FOR_PICKUP", "RESTAURANT_SIM"],
        ["ASSIGNED", "COURIER"],
        ["PICKED_UP", "COURIER"],
        ["DELIVERED", "COURIER"],
      ]);

      const history = await bodyOf<{ data: DeliverySummaryView[] }>(
        await deliveriesGet(appRequest("/api/v1/courier/deliveries", { jar: sam.jar })),
      );
      expect(history.data).toEqual([
        expect.objectContaining({ orderId, endReason: "DELIVERED", payoutCents: 549 }),
      ]);
      const earnings = await bodyOf<EarningsView>(
        await earningsGet(appRequest("/api/v1/courier/earnings", { jar: sam.jar })),
      );
      expect(earnings).toEqual({
        simulated: true,
        todayCents: 549,
        weekCents: 549,
        allTimeCents: 549,
        completedDeliveries: 1,
        averageRating: null,
        ratingsCount: 0,
      });
      expect(
        (await activeGet(appRequest("/api/v1/courier/deliveries/active", { jar: sam.jar }))).status,
      ).toBe(204);
    });

    it("lets the courier release before pickup with a reason; the order returns to other couriers (DLV-9)", async () => {
      const orderId = await readyOrder(alex);
      await transition(sam.jar, orderId, { toStatus: "ASSIGNED" });
      const active = await activeGet(appRequest("/api/v1/courier/deliveries/active", { jar: sam.jar }));
      expect((await bodyOf<CourierOrderView>(active)).id).toBe(orderId);

      const noReason = await transition(sam.jar, orderId, { toStatus: "READY_FOR_PICKUP" });
      expect([noReason.status, await codeOf(noReason)]).toEqual([422, "REASON_REQUIRED"]);
      const released = await transition(sam.jar, orderId, {
        toStatus: "READY_FOR_PICKUP",
        reason: "Class ran late",
      });
      expect(released.status).toBe(200);

      expect(await offerList(sam.jar)).toEqual([]); // the courier who gave it up doesn't see it again
      expect((await offerList(riley.jar)).map((o) => o.orderId)).toEqual([orderId]);
      const [ended] = await db
        .select()
        .from(schema.deliveryAssignments)
        .where(eq(schema.deliveryAssignments.orderId, orderId));
      expect(ended).toMatchObject({ endReason: "RELEASED_BY_COURIER", payoutCents: null });
      const notices = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orderId, orderId));
      expect(notices.map((n) => n.type)).toContain("COURIER_RELEASED");
      // Released in the last 24 hours: still visible to that courier, without the customer's note.
      const view = await bodyOf<CourierOrderView>(await viewOrder(sam.jar, orderId));
      expect(view).toMatchObject({
        status: "READY_FOR_PICKUP",
        deliveryInstructions: null,
        allowedTransitions: [],
      });
    });

    it("lets the courier report a failed delivery after pickup, voiding the payment and paying nothing", async () => {
      const orderId = await readyOrder(alex);
      await transition(sam.jar, orderId, { toStatus: "ASSIGNED" });
      await transition(sam.jar, orderId, { toStatus: "PICKED_UP" });
      expect((await transition(sam.jar, orderId, { toStatus: "DELIVERY_FAILED" })).status).toBe(422);
      const failed = await bodyOf<CourierOrderView>(
        await transition(sam.jar, orderId, { toStatus: "DELIVERY_FAILED", reason: "Building was locked" }),
      );
      expect(failed.status).toBe("DELIVERY_FAILED");
      const [assignment] = await db
        .select()
        .from(schema.deliveryAssignments)
        .where(eq(schema.deliveryAssignments.orderId, orderId));
      expect(assignment).toMatchObject({ endReason: "DELIVERY_FAILED", payoutCents: null });
      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
      expect(payment!.status).toBe("VOIDED");
    });
  });

  describe("who can see a delivery (THREAT_MODEL T-01, T-05)", () => {
    it("is invisible to other couriers, and to its courier 24 hours after it ends", async () => {
      const orderId = await readyOrder(alex);
      expect((await viewOrder(sam.jar, orderId)).status).toBe(404); // an offer isn't an order you can open
      await transition(sam.jar, orderId, { toStatus: "ASSIGNED" });
      expect((await viewOrder(riley.jar, orderId)).status).toBe(404);
      expect((await viewOrder(sam.jar, orderId)).status).toBe(200);
      await transition(sam.jar, orderId, { toStatus: "PICKED_UP" });
      await transition(sam.jar, orderId, { toStatus: "DELIVERED" });
      await db
        .update(schema.deliveryAssignments)
        .set({ endedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
        .where(eq(schema.deliveryAssignments.orderId, orderId));
      expect((await viewOrder(sam.jar, orderId)).status).toBe(404);
    });
  });

  describe("Kitchen Console (PRD ADM-7, simulated restaurant)", () => {
    it("lets admins confirm and mark ready as RESTAURANT_SIM, with an audit record naming them", async () => {
      await addToCart(alex, { menuItemId: seeded.item(BURGER, "fries"), quantity: 2 });
      const order = await checkout(alex, seeded.location("library"));

      const queue = await bodyOf<{ data: KitchenOrderView[] }>(
        await kitchenGet(appRequest("/api/v1/admin/kitchen", { jar: admin })),
      );
      expect(queue.data).toEqual([
        expect.objectContaining({
          id: order.id,
          status: "PLACED",
          items: [{ name: "Fries", quantity: 2, options: [], specialInstructions: null }],
        }),
      ]);
      expect(JSON.stringify(queue.data)).not.toMatch(/email|customer|Alex/i);

      const confirm = await transition(admin, order.id, {
        toStatus: "CONFIRMED",
        actingAs: "RESTAURANT_SIM",
      });
      expect(confirm.status).toBe(200);
      expect(await bodyOf<KitchenOrderView>(confirm)).toMatchObject({ status: "CONFIRMED", version: 1 });
      await transition(admin, order.id, { toStatus: "READY_FOR_PICKUP", actingAs: "RESTAURANT_SIM" });

      const customer = await bodyOf<OrderDetailView>(await viewOrder(alex, order.id));
      expect(customer.timeline.slice(1).map((t) => t.actorType)).toEqual([
        "RESTAURANT_SIM",
        "RESTAURANT_SIM",
      ]);

      const audit = await bodyOf<{
        data: { action: string; actor: { email: string } | null; metadata: Record<string, unknown> }[];
      }>(
        await auditGet(
          appRequest(`/api/v1/admin/audit-events?targetType=order&targetId=${order.id}`, { jar: admin }),
        ),
      );
      expect(audit.data.map((e) => e.action)).toEqual([
        "order.kitchen_ready_for_pickup",
        "order.kitchen_confirmed",
      ]);
      expect(audit.data[0]!.metadata).toMatchObject({
        actingAs: "RESTAURANT_SIM",
        from: "CONFIRMED",
        to: "READY_FOR_PICKUP",
      });
      expect(audit.data[0]!.actor).not.toBeNull();
    });

    it("needs a reason to reject, and refuses non-admins and moves a restaurant can't make", async () => {
      await addToCart(alex, { menuItemId: seeded.item(BURGER, "fries"), quantity: 2 });
      const order = await checkout(alex, seeded.location("library"));
      const noReason = await transition(admin, order.id, {
        toStatus: "CANCELLED",
        actingAs: "RESTAURANT_SIM",
      });
      expect([noReason.status, await codeOf(noReason)]).toEqual([422, "REASON_REQUIRED"]);
      expect(
        (await transition(sam.jar, order.id, { toStatus: "CONFIRMED", actingAs: "RESTAURANT_SIM" })).status,
      ).toBe(403);
      expect(
        (await transition(admin, order.id, { toStatus: "DELIVERED", actingAs: "RESTAURANT_SIM" })).status,
      ).toBe(409);
      expect((await kitchenGet(appRequest("/api/v1/admin/kitchen", { jar: sam.jar }))).status).toBe(403);

      const rejected = await transition(admin, order.id, {
        toStatus: "CANCELLED",
        actingAs: "RESTAURANT_SIM",
        reason: "Out of fries",
      });
      expect(await bodyOf<KitchenOrderView>(rejected)).toMatchObject({ status: "CANCELLED" });
      const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
      expect(payment!.status).toBe("VOIDED");
      expect(
        (
          await bodyOf<{ data: KitchenOrderView[] }>(
            await kitchenGet(appRequest("/api/v1/admin/kitchen", { jar: admin })),
          )
        ).data,
      ).toEqual([]);
    });
  });
});
