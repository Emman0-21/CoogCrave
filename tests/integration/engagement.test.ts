import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as earningsGet } from "@/app/api/v1/courier/earnings/route";
import { POST as markReadPost } from "@/app/api/v1/notifications/mark-read/route";
import { GET as notificationsGet } from "@/app/api/v1/notifications/route";
import { POST as reviewPost } from "@/app/api/v1/orders/[orderId]/review/route";
import * as schema from "@/server/db/schema";
import { seedCatalog } from "@/server/seed/catalog";
import type { AdminOrderView } from "@/shared/schemas/admin";
import type { CourierOrderView, EarningsView } from "@/shared/schemas/delivery";
import type { NotificationListView, ReviewView } from "@/shared/schemas/engagement";
import type { OrderDetailView } from "@/shared/schemas/ordering";

import { signedInUser } from "../support/auth";
import { BURGER, courierAccount, readyOrder, transition, viewOrder } from "../support/delivery";
import { openPool, resetDatabase } from "../support/db";
import { testDb, type TestDb } from "../support/fixtures";
import { appRequest, bodyOf, type CookieJar, uniqueEmail } from "../support/http";
import { clearOrdering, openAllWeek, seeded } from "../support/ordering";

type ErrorBody = { error: { code: string } };
const codeOf = async (response: Response) => (await bodyOf<ErrorBody>(response)).error?.code;

const inbox = (jar: CookieJar, query = "") =>
  notificationsGet(appRequest(`/api/v1/notifications${query}`, { jar }));
const inboxBody = async (jar: CookieJar, query = "") => bodyOf<NotificationListView>(await inbox(jar, query));
const markRead = (jar: CookieJar, body: unknown) =>
  markReadPost(appRequest("/api/v1/notifications/mark-read", { body, jar }));
const review = (jar: CookieJar, orderId: string, body: unknown) =>
  reviewPost(appRequest(`/api/v1/orders/${orderId}/review`, { body, jar }), {
    params: Promise.resolve({ orderId }),
  });

/** Notifications inbox (PRD NTF-1, NTF-2) and reviews (REV-1, REV-2, THREAT_MODEL T-13). */
describe("notifications and reviews", () => {
  let pool: Pool;
  let db: TestDb;
  let alex: CookieJar; // customer
  let jordan: CookieJar; // another student
  let sam: Awaited<ReturnType<typeof courierAccount>>;
  let admin: CookieJar;

  beforeAll(async () => {
    pool = openPool("app");
    db = testDb(pool);
    await resetDatabase();
    await seedCatalog(db);
    alex = await signedInUser(uniqueEmail("alex"));
    jordan = await signedInUser(uniqueEmail("jordan"));
    sam = await courierAccount(db, "sam");
    const adminEmail = uniqueEmail("admin");
    admin = await signedInUser(adminEmail);
    await db.update(schema.users).set({ role: "ADMIN" }).where(eq(schema.users.email, adminEmail));
  });
  beforeEach(async () => {
    await clearOrdering(db);
    await openAllWeek(db, seeded.restaurant(BURGER));
  });
  afterAll(async () => {
    await pool.end();
  });

  /** A ready order taken all the way to DELIVERED by Sam. */
  async function deliveredOrder(customer: CookieJar): Promise<string> {
    const orderId = await readyOrder(customer);
    for (const toStatus of ["ASSIGNED", "PICKED_UP", "DELIVERED"]) {
      expect((await transition(sam.jar, orderId, { toStatus })).status).toBe(200);
    }
    return orderId;
  }

  describe("inbox (NTF-1, NTF-2)", () => {
    it("lists only the caller's notifications, newest first, with the unread count", async () => {
      const orderId = await readyOrder(alex);
      const mine = await inboxBody(alex);
      // Placed, confirmed, ready: newest first.
      expect(mine.data.map((n) => n.type)).toEqual(["ORDER_READY", "ORDER_CONFIRMED", "ORDER_PLACED"]);
      expect(mine.data.every((n) => n.orderId === orderId && n.readAt === null)).toBe(true);
      expect(mine.unreadCount).toBe(3);
      expect(mine.nextCursor).toBeNull();

      const theirs = await inboxBody(jordan);
      expect(theirs).toEqual({ data: [], nextCursor: null, unreadCount: 0 });
    });

    it("pages with a cursor and filters to unread", async () => {
      await readyOrder(alex);
      const first = await inboxBody(alex, "?limit=2");
      expect(first.data).toHaveLength(2);
      const second = await inboxBody(alex, `?limit=2&cursor=${first.nextCursor}`);
      expect(second.data.map((n) => n.type)).toEqual(["ORDER_PLACED"]);
      expect(second.nextCursor).toBeNull();

      expect((await markRead(alex, { ids: [first.data[0]!.id] })).status).toBe(204);
      const unread = await inboxBody(alex, "?unreadOnly=true");
      expect(unread.data.map((n) => n.type)).toEqual(["ORDER_CONFIRMED", "ORDER_PLACED"]);
      expect(unread.unreadCount).toBe(2);

      expect((await inbox(alex, "?cursor=nope")).status).toBe(400);
      expect((await inbox(alex, "?sort=asc")).status).toBe(400);
    });

    it("marks some or all read, never touching someone else's, and keeps the first read time", async () => {
      await readyOrder(alex);
      await readyOrder(jordan);
      const alexIds = (await inboxBody(alex)).data.map((n) => n.id);
      const jordanIds = (await inboxBody(jordan)).data.map((n) => n.id);

      // Jordan's IDs in Alex's request are ignored, with the same answer as for unknown IDs.
      expect((await markRead(alex, { ids: jordanIds })).status).toBe(204);
      expect((await inboxBody(jordan)).unreadCount).toBe(3);

      await markRead(alex, { ids: [alexIds[0]] });
      const [firstRead] = await db
        .select({ readAt: schema.notifications.readAt })
        .from(schema.notifications)
        .where(eq(schema.notifications.id, alexIds[0]!));
      expect((await markRead(alex, { all: true })).status).toBe(204);
      const after = await inboxBody(alex);
      expect(after.unreadCount).toBe(0);
      expect(after.data.find((n) => n.id === alexIds[0])?.readAt).toBe(firstRead!.readAt!.toISOString());
      expect((await inboxBody(jordan)).unreadCount).toBe(3);

      for (const bad of [{}, { ids: [] }, { all: false }, { ids: ["x"] }, { all: true, ids: alexIds }]) {
        expect((await markRead(alex, bad)).status).toBe(400);
      }
    });

    it("links each notification to a page its reader can open", async () => {
      const delivered = await deliveredOrder(alex);
      const customer = (await inboxBody(alex)).data;
      expect(customer.map((n) => n.type)).toEqual(
        expect.arrayContaining(["COURIER_ASSIGNED", "ORDER_PICKED_UP", "ORDER_DELIVERED"]),
      );
      expect(new Set(customer.map((n) => n.href))).toEqual(new Set([`/orders/${delivered}`]));
      // Customer notices go to the customer only.
      expect((await inboxBody(sam.jar)).data).toEqual([]);

      // An admin takes a delivery away from Sam: Sam is told, and the link is Sam's history, not
      // Alex's order page (which Sam can't open).
      const orderId = await readyOrder(alex);
      await transition(sam.jar, orderId, { toStatus: "ASSIGNED" });
      expect(
        (await transition(admin, orderId, { toStatus: "READY_FOR_PICKUP", reason: "Courier unreachable" }))
          .status,
      ).toBe(200);
      const courierInbox = (await inboxBody(sam.jar)).data;
      expect(courierInbox.map((n) => [n.type, n.href])).toEqual([["COURIER_RELEASED", "/courier/history"]]);
    });
  });

  describe("reviews (REV-1, REV-2, THREAT_MODEL T-13)", () => {
    it("lets the customer rate a delivered order once; everyone sees it at their level", async () => {
      const orderId = await deliveredOrder(alex);
      const response = await review(alex, orderId, { rating: 5, comment: "  Fast and friendly  " });
      expect(response.status).toBe(201);
      const created = await bodyOf<ReviewView>(response);
      expect(created).toMatchObject({ rating: 5, comment: "Fast and friendly" });

      const again = await review(alex, orderId, { rating: 1 });
      expect([again.status, await codeOf(again)]).toEqual([409, "ALREADY_REVIEWED"]);

      // Customer: the whole review. Courier: the stars only. Admin: the whole review.
      const asCustomer = await bodyOf<OrderDetailView>(await viewOrder(alex, orderId));
      expect(asCustomer.review).toEqual(created);
      const asCourier = await bodyOf<CourierOrderView>(await viewOrder(sam.jar, orderId));
      expect(asCourier.rating).toBe(5);
      expect(JSON.stringify(asCourier)).not.toContain("Fast and friendly");
      const asAdmin = await bodyOf<AdminOrderView>(await viewOrder(admin, orderId));
      expect(asAdmin.review).toEqual(created);

      // The rating counts toward the courier's average (PRD DLV-11).
      const earnings = await bodyOf<EarningsView>(
        await earningsGet(appRequest("/api/v1/courier/earnings", { jar: sam.jar })),
      );
      expect(earnings).toMatchObject({ averageRating: 5, ratingsCount: 1 });
    });

    it("averages ratings across deliveries, rounded to one decimal", async () => {
      for (const rating of [5, 4, 4]) {
        const orderId = await deliveredOrder(alex);
        await review(alex, orderId, { rating });
      }
      const earnings = await bodyOf<EarningsView>(
        await earningsGet(appRequest("/api/v1/courier/earnings", { jar: sam.jar })),
      );
      expect(earnings).toMatchObject({ averageRating: 4.3, ratingsCount: 3 });
    });

    it("refuses other people's orders (404), orders not yet delivered (422), and bad input (400)", async () => {
      const orderId = await deliveredOrder(alex);
      expect((await review(jordan, orderId, { rating: 5 })).status).toBe(404);
      expect((await review(sam.jar, orderId, { rating: 5 })).status).toBe(404);
      expect((await review(admin, orderId, { rating: 5 })).status).toBe(404);

      const pending = await readyOrder(alex);
      const early = await review(alex, pending, { rating: 5 });
      expect([early.status, await codeOf(early)]).toEqual([422, "NOT_REVIEWABLE"]);

      for (const bad of [
        { rating: 0 },
        { rating: 6 },
        { rating: 4.5 },
        { rating: "5" },
        { rating: 5, comment: "x".repeat(501) },
        { rating: 5, comment: "<script>" },
        { rating: 5, courierId: "someone" },
      ]) {
        expect((await review(alex, orderId, bad)).status).toBe(400);
      }
      expect(await db.select().from(schema.reviews)).toEqual([]);
    });

    it("keeps exactly one review when the same rating is submitted five times at once", async () => {
      const orderId = await deliveredOrder(alex);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => review(alex, orderId, { rating: 4 })),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      expect(await db.select().from(schema.reviews).where(eq(schema.reviews.orderId, orderId))).toHaveLength(
        1,
      );
    });
  });
});
