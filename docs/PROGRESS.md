# CoogCrave — Progress

**Current phase:** 7 — UI refinement (short pass) · **Status:** `IN REVIEW`
**Branch:** `feature/polish` (1 commit on top of `main` at `a2a4ef3`) · **Last updated:** 2026-10-11

---

## Phase 7 report (short pass, at your request because of the deadline)

### 1. What was implemented
- **Phone header:** logo and account on the first row, page links on a second row that never wraps unpredictably (it scrolls sideways if it ever has to). Desktop unchanged.
- **Automated accessibility checks (axe, WCAG 2.1 A/AA):** 5 public pages at phone and desktop widths, and 14 signed-in pages (customer, courier, admin) each at 390 px and 1280 px. **No violations.**
- E2E made robust against the per-account sign-in limit (10 per 15 minutes): the signed-in accessibility check runs once and covers both widths; the T-01 test uses the demo courier instead of the demo admin.

### 2. Files changed
`src/components/layout/site-header.tsx`, `tests/e2e/{accessibility,ordering}.spec.ts`, `package.json` and lockfile (`@axe-core/playwright`, dev only), docs.

### 3. Commands executed (working tree at the commit, 2026-10-11)
| Command | Result |
|---|---|
| `pnpm verify` | ✅ exit 0; 38 files, **474/474** tests; coverage 96.3% statements, 89.9% branches |
| `pnpm test:e2e` (`CI=1`) | ✅ **35 passed**, 1 skipped by design (the signed-in accessibility test runs only in the desktop project and checks both widths itself) |
| `pnpm audit --audit-level=high` | ✅ pass |

Not re-run from a clean clone this time (deadline). The change is small and the full suites above passed.

### 4. Not done from the original Phase 7 plan (skipped for time)
Skeleton/loading states pass, CSP nonce tightening review, `EXPLAIN` query review, bundle analysis, PWA manifest, manual screen-reader pass.

### 5. Phase 8 (deployment) needs your decisions
Hosting, a managed Postgres, and an email provider all mean creating accounts and possibly paying, which I can't do without your approval. The app runs locally today (README).

---

## Phase 6b report

The second half of Phase 6. With it, every Phase 6 requirement is built (menu editing to the agreed essentials).

### 1. What was implemented

| Task | Status | Notes |
|---|---|---|
| Notifications inbox (NTF-1, NTF-2) | `COMPLETE` | Inbox page, unread badge in the header, open marks read and goes to the right page for that reader, mark all read, older pages |
| Ratings (REV-1, REV-2, DLV-11) | `COMPLETE` | 1–5 stars and an optional comment on delivered orders, once, customer only; counts toward the courier's average; couriers see the stars, admins the comment too |
| Menu editing, essentials (ADM-4, ADM-5) | `COMPLETE` | Stop or start orders per restaurant, mark items sold out and back, change prices; audited with before/after; the seed and demo reset restore samples. Opening hours and the rest of full editing are not built, as agreed |
| Demo auto-advance (Q3) | `COMPLETE` | `DEMO_AUTO_ADVANCE=true` plays the restaurant every 15 s for rehearsals; refused in production; safe alongside the Kitchen Console |
| Full J4 journey E2E | `COMPLETE` | Order to delivery, rating, inbox, admin record |
| `DEMO_GUIDE.md` | `COMPLETE` | Setup, three-window script, admin tour, reset, troubleshooting, what to say honestly. Its main story was run end to end with the demo accounts while taking the screenshots |

### 2. Files changed

58 files (23 added, 35 modified) since `main`.

- **Services:** `src/server/services/{reviews,admin-catalog}.ts` (new), `notifications.ts` (inbox, links), `orders.ts` and `admin-orders.ts` (rating in projections); `src/server/demo/auto-advance.ts`, `src/instrumentation.ts` (new); `src/server/config.ts` (`DEMO_AUTO_ADVANCE`); `src/server/http/{errors,limits}.ts`
- **API:** `src/app/api/v1/{notifications,notifications/mark-read,orders/[orderId]/review,admin/restaurants,admin/restaurants/[restaurantId],admin/menu-items/[menuItemId]}/route.ts`
- **Shared:** `src/shared/schemas/engagement.ts` (new), `ordering.ts`, `delivery.ts`, `admin.ts`
- **UI:** `/notifications` (inbox), rating panel on delivered orders, header Inbox badge, `/admin/restaurants` and `/admin/restaurants/[slug]`, rating on the admin order record, automatic steps labeled there
- **Tests:** `integration/{engagement,admin-catalog,auto-advance}`, `unit/notification-links`, config and role-matrix extensions, `component/engagement-ui`, admin and header component tests, E2E J4 completed and a menu-editing journey, E2E setup
- **Docs:** `DEMO_GUIDE.md` (new); API spec (§2, §7, §9, §10); architecture (§4, §10, §12, §16); threat model; testing; plan; PRD notes; README; review log; `.env.example`; this report

### 3. Commands executed (clean clone of `feature/notifications-reviews` at `228c873`, fresh `coogcrave_dev` and `coogcrave_test` databases, 2026-10-11)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm verify` (tracked-env, format, lint, typecheck, drift, coverage, build) | ✅ exit 0 |
| ↳ `pnpm test:coverage` | ✅ 38 files, **474/474 tests passed**. Coverage 96.3% statements, 89.9% branches, 97.4% functions, 98.1% lines. Domain 98.5% / 97.9% branches / 100% functions; services 94.8% / 87.6% branches |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:demo` | ✅ migrations applied; 14 buildings, 10 cuisines, 11 restaurants, 31 items; 4 demo accounts |
| `pnpm test:e2e` (Chromium, `CI=1`) | ✅ **32/32 passed** (16 tests × mobile + desktop), no retries |
| `pnpm audit --audit-level=high` | ✅ pass (same accepted dev-only exception; 1 moderate) |
| Auto-advance smoke test (production build, `DEMO_AUTO_ADVANCE=true`) | ✅ a placed order was confirmed by the loop within one tick; event recorded as `RESTAURANT_SIM` with no user |

**Checkpoint** (exit criteria: J3 and the full J4 demo E2E pass; draft `DEMO_GUIDE.md`): J3 passed in 6a and still passes; J4 now runs to the end (rating, inbox, admin record); the guide is written and its script was run with the demo accounts.

### 4. Tests by result

- 474 Vitest tests passed, 0 failed, 0 skipped (40 more than 6a).
- 32 E2E runs passed, 0 failed.
- Races: 5 simultaneous ratings → one row; auto-advance vs Kitchen Console, 10 rounds → never a double move.
- Mutation checks: 7 broken on purpose and caught (`TESTING.md` §4); one gap found this way and closed; one survivor kept as defense in depth.

### 5. Engineering risks remaining

- **Opening hours can't be edited in the app.** A demo has to run during sample hours (Burger Joint: weekdays 10:30 AM–9 PM, weekends 11 AM–7 PM) or with another open restaurant. If the demo slot is late at night this needs a decision.
- **The unread badge updates on navigation**, not live.
- **Sign-in rate limit during rehearsals:** 10 sign-ins per account per 15 minutes; the guide says to keep windows signed in.
- **Auto-advance runs in every server process** when on: safe (compare-and-set) but redundant if several instances run. It's a rehearsal tool, off by default and refused in production.
- Mobile header now has six items and wraps to two rows (Phase 7).

### 6. Ready for review?

**Yes.** All Phase 6b tasks are done; Phase 6's exit criteria (J3, full J4, demo guide) pass from a clean clone with fresh databases.

### 7. What should happen next

1. Review the branch, mainly `src/server/services/reviews.ts`, `admin-catalog.ts`, `src/server/demo/auto-advance.ts`, and `docs/DEMO_GUIDE.md`.
2. Decide whether the demo needs editable opening hours (see risk 1).
3. Push `feature/notifications-reviews` and open a PR to `main` so CI runs.
4. On approval and merge: Phase 7 (UI refinement and reliability).

---

## Phase 6a report

Phase 6 was split in two at your request: **6a** (this report) and **6b** (notifications inbox, reviews, essential restaurant and menu editing, demo auto-advance).

### 1. What was implemented

| Task | Status | Notes |
|---|---|---|
| Courier decisions (ADM-2) | `COMPLETE` | Review queue, oldest first; approve or reject with a note; suspend and reinstate; the courier is notified; audited. Suspending mid-delivery is refused until the order is resolved |
| Users and suspension (ADM-3, AUTH-7) | `COMPLETE` | Search, filters, paging; suspend with a reason signs the person out everywhere and takes them offline as a courier; admins can't suspend themselves or other admins |
| Admin orders and record (ADM-6) | `COMPLETE` | Every order, filterable; full record with customer, who did what and why, couriers, simulated payment. Reviews join it in 6b |
| Problem fixes (ADM-8) | `COMPLETE` | Cancel any open order, unassign before pickup, close a picked-up order as not delivered; reason required; customer and courier told; audited |
| Activity log (ADM-9) | `COMPLETE` | Own page now, with reasons and links to each user, courier, or order |
| Dashboard (ADM-1) | `COMPLETE` | Today's orders by stage, what needs attention, simulated sales |
| Demo reset (ADM-10) | `COMPLETE` | Off by default; never in production; exact phrase; demo accounts' data only; refuses while a demo courier holds a real customer's order |
| Demo auto-advance | `MOVED` → 6b | Goes with the rest of the demo tooling |

### 2. Files changed

55 files (29 added, 26 modified) since `main`.

- **Domain:** `src/server/domain/admin-rules.ts` (new)
- **Services:** `src/server/services/{admin-people,admin-orders,admin-ops}.ts` (new); `order-workflow.ts` (locked courier re-read on accept, courier told when an admin ends their delivery); `orders.ts` (admin projection, `ADMIN` transitions); `notifications.ts`; `src/server/seed/demo.ts` (profile restore reused by reset); `src/server/config.ts` (`DEMO_RESET_ENABLED`); `src/server/http/{errors,limits}.ts`
- **API:** `src/app/api/v1/admin/{metrics,users,users/[userId],couriers,couriers/[courierId]/decision,orders,demo/reset}/route.ts`
- **Shared:** `src/shared/schemas/admin.ts` (new), `ordering.ts`
- **UI:** admin layout and navigation; pages `/admin` (dashboard), `/admin/couriers`, `/admin/users`, `/admin/orders`, `/admin/orders/[orderId]`, `/admin/activity`; Kitchen Console moved into the admin frame; components `src/components/features/admin/`
- **Tests:** `unit/{domain-admin-rules,config}`, `integration/{admin,demo-reset}`, role matrix extended, `component/admin-ui`, `e2e/admin.spec.ts`, E2E setup and activity-log test updated
- **Docs:** API spec (§2, §7, §10), architecture (§4, §6, §7.1, §16), threat model, testing, plan, PRD notes, README, review log, `.env.example`, this report

### 3. Commands executed (clean clone of `feature/admin-operations` at `e1d6119`, fresh `coogcrave_dev` and `coogcrave_test` databases, 2026-10-11)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm verify` (tracked-env, format, lint, typecheck, drift, coverage, build) | ✅ exit 0 |
| ↳ `pnpm test:coverage` | ✅ 33 files, **434/434 tests passed**. Coverage 96.4% statements, 89.6% branches, 97.5% functions, 98.2% lines. Domain 98.5% / 97.9% branches / 100% functions; services 94.6% / 86.7% branches |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:demo` | ✅ migrations applied; 14 buildings, 10 cuisines, 11 restaurants, 31 items; 4 demo accounts |
| `pnpm test:e2e` (Chromium, `CI=1`) | ✅ **30/30 passed** (15 tests × mobile + desktop), no retries |
| `pnpm audit --audit-level=high` | ✅ pass (same accepted dev-only exception; 1 moderate) |

**Checkpoint** (exit criterion: J3 core): `e2e/admin.spec.ts` has a student apply, the admin approve them from the queue (they can then go online), a customer order and the admin cancel it from its record with a reason, and the admin suspend an account (signed out, sign-in refused) and lift it; each shows in the activity log.

### 4. Tests by result

- 434 Vitest tests passed, 0 failed, 0 skipped (41 more than Phase 5).
- 30 E2E runs passed, 0 failed.
- Race: suspension vs accept, 15 rounds per run: never both succeed, and both orderings occurred.
- Mutation checks: removing the locked courier re-read lets suspension and accept both succeed (test fails); removing the demo-reset busy-courier guard (test fails).

### 5. Engineering risks remaining

- **The session limit interrupted this phase once.** Nothing was lost (work was on disk), and every check above was re-run from scratch afterwards, but the gap means the code from before the interruption was reviewed again rather than as it was written.
- **No notifications inbox yet** (6b). Couriers and customers are notified (rows are written), but can't read them in the app until then.
- **Restaurants and menus** still come only from the seed (6b, essentials only).
- **Admin lists** return up to 200 couriers and paged users/orders; fine for a campus, revisit at scale.
- Demo reset is a destructive tool; it's off unless `.env` turns it on, and never in production.

### 6. Ready for review?

**Yes.** Every 6a task is done and the J3 core journey passes on phone and desktop from a clean clone with fresh databases.

### 7. What should happen next

1. Review the branch, mainly `src/server/services/admin-people.ts` (suspension and decisions with locking), `admin-ops.ts` (demo reset), and the new rows in `ARCHITECTURE.md` §16.
2. Push `feature/admin-operations` and open a PR to `main` so CI runs.
3. On approval and merge: Phase 6b on `feature/notifications-reviews`.

---

## Phase 5 report

### 1. What was implemented

| Task | Status | Notes |
|---|---|---|
| Courier application | `COMPLETE` | Walk / bike / scooter + guidelines; always `PENDING`; rejected applicants may reapply. Approval itself is an admin screen in Phase 6 (the demo seed provides an approved courier) |
| Availability | `COMPLETE` | Go online / offline; offline never affects a delivery in progress |
| Offers and decline | `COMPLETE` | Ready orders, oldest first; restaurant, pickup and drop buildings, item count, simulated payout, and nothing else (no customer name, note, or prices); skip hides it for that courier only; refreshes every 10 s |
| Accept | `COMPLETE` | Exactly one winner under simultaneous accepts; one delivery at a time per courier; own orders refused |
| Active delivery | `COMPLETE` | Pickup details, "Alex R." (or display name), drop point and note while active; only the moves the server allows |
| Transitions T5, T7–T11 | `COMPLETE` | One referee (`order-workflow.ts`) for all 11 rules: compare-and-set on status + version, assignment bookkeeping, simulated payout, payment capture/void after commit, customer notifications, audit for admin actions |
| History and simulated earnings | `COMPLETE` | Today / this week in campus time, all time, completed count; rating shows "No ratings yet" until reviews (Phase 6) |
| Customer tracking shows the courier | `COMPLETE` | First name and how they travel |
| **Kitchen Console** (scope added at the start of this phase) | `COMPLETE` | Admin-only; confirm, mark ready, reject with a reason; every action audited with the admin's name; refreshes every 10 s |

### 2. Files changed

53 files (26 added, 27 modified) since `main`.

- **Domain:** `src/server/domain/delivery.ts` (new); state machine unchanged except an unused helper removed in Phase 4
- **Services:** `src/server/services/{order-workflow,courier,kitchen}.ts` (new), `orders.ts` (who-is-the-caller routing, courier projection), `notifications.ts`; `src/server/payments/gateway.ts` (`capture`); `src/server/http/{errors,limits}.ts`
- **API:** `src/app/api/v1/courier/{application,me,availability,offers,offers/[orderId]/decline,deliveries,deliveries/active,earnings}/route.ts`, `admin/kitchen/route.ts`; `orders/[orderId]` and its transitions route now serve couriers and the Kitchen Console
- **Shared:** `src/shared/schemas/delivery.ts` (new), `ordering.ts` (`actingAs`, courier on the customer view)
- **UI:** pages `courier`, `courier/history`, `admin/kitchen`; components `src/components/features/{courier,kitchen}/`; header "Deliver" link, tracker shows the courier, admin page links to the console, landing copy
- **Tests:** `unit/domain-delivery`, `integration/delivery`, role matrix extended, `component/delivery-ui`, `e2e/delivery.spec.ts`, `tests/support/delivery.ts`, account helpers
- **Docs:** API spec §7, §8, §10; architecture (§2, §4, §6, §7.1, §9, §11, §16); threat model; testing; plan; PRD notes; README (status, three-window demo walkthrough); review log; this report

### 3. Commands executed (clean clone of `feature/courier-delivery` at `9ee30bf`, fresh `coogcrave_dev` and `coogcrave_test` databases, 2026-10-11)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm verify` (tracked-env, format, lint, typecheck, drift, coverage, build) | ✅ exit 0 |
| ↳ `pnpm test:coverage` | ✅ 29 files, **393/393 tests passed**. Coverage 96.5% statements, 90.0% branches, 98.1% functions, 98.2% lines. Domain 98.4% / 97.8% branches / 100% functions; services 94.5% / 86.8% branches |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:demo` | ✅ migrations applied; 14 buildings, 10 cuisines, 11 restaurants, 31 items; 4 demo accounts |
| `pnpm test:e2e` (Chromium, `CI=1`) | ✅ **28/28 passed** (14 tests × mobile + desktop), no retries. The first attempt didn't start: a server from an earlier screenshot session still held port 3000; stopped and re-run |
| `pnpm audit --audit-level=high` | ✅ pass (same accepted dev-only exception as Phase 4; 1 moderate) |
| Concurrency tests × 20 consecutive runs (each run = 20 rounds) | ✅ 20/20 green, run on `55aa9c9`; the referee code hasn't changed since |

**Checkpoint** (exit criteria: J2 E2E; concurrency test green 20 consecutive runs): `e2e/delivery.spec.ts` uses three browser sessions. The customer orders; the admin confirms and marks it ready in the Kitchen Console; the courier goes online, sees the offer without the customer's name or note, accepts, then sees "Riley N." and the note, picks up, delivers; the customer's page shows "Riley, by bike" and "Delivered"; the courier's history shows the simulated $4.49.

### 4. Tests by result

- 393 Vitest tests passed, 0 failed, 0 skipped (42 more than Phase 4: delivery unit and integration tests, the role matrix for the 9 new endpoints, and courier/kitchen component tests).
- 28 E2E runs passed, 0 failed.
- Mutation checks (broken on purpose, test failed, restored): assigned-courier check; instruction gating; compare-and-set guards plus unique-index translation; 404 for unapproved couriers; offer-list error handling. Removing only the compare-and-set guards does **not** fail the race test, because the database index still keeps one winner: that is the designed second layer, not a gap.

### 5. Engineering risks remaining

- **Courier approval has no screen** until Phase 6. Today an approved courier comes only from the demo seed or the database.
- **Admin resolutions** (unassign, fail, cancel a stuck order): the referee already applies the admin rules and the state-machine table is unit-tested, but there's no HTTP path or screen yet, and their side effects get integration tests in Phase 6. A courier who disappears mid-delivery currently leaves the order stuck.
- **Courier status is read at request start**, not locked during accept (`ARCHITECTURE.md` §16). Harmless today; matters once admins can suspend couriers mid-delivery.
- **Payment follow-ups after commit** can't fail with the demo gateway. A real processor would need a retry queue; noted in code and architecture.
- **Mobile header** wraps to two rows under ~400 px (Phase 7).
- All earnings, payments, and restaurant actions are simulations and labeled so.

### 6. Ready for review?

**Yes.** Both Phase 5 exit criteria pass from a clean clone with fresh databases: the J2 journey on phone and desktop, and the concurrency tests 20 runs in a row. The Kitchen Console was added to this phase with your approval; courier approval remains a Phase 6 admin task, as planned.

### 7. What should happen next

1. Review the branch, mainly `src/server/services/order-workflow.ts` (the referee), `orders.ts` (`orderTransition`), and the decisions added to `ARCHITECTURE.md` §16.
2. Push `feature/courier-delivery` and open a PR to `main` so CI runs.
3. On approval and merge: Phase 6 (administration, notifications, reviews) on `feature/admin-operations`, starting with courier approval and admin order resolution.

---

## Phase 4 report

### 1. What was implemented

| Task | Status | Notes |
|---|---|---|
| Pricing, hours, option rules, state machine | `COMPLETE` | Pure modules, exhaustive unit tests (integer cents, round-half-up, past-midnight hours, DST) |
| Restaurant list, search, filters | `COMPLETE` | Search over names and menu items; cuisine and "taking orders now" filters; works without JavaScript |
| Restaurant detail and menu | `COMPLETE` | Sample hours, pickup building, menu with choices; sold-out items shown disabled; "Sample menu, not affiliated" on every restaurant |
| Server-side cart | `COMPLETE` | One restaurant per cart (with "start a new cart"), option rules enforced on the server, live re-pricing, blocking problems flagged |
| Checkout and quote | `COMPLETE` | Drop-off building, courier note, tip; totals only from the server; labeled demo payment and sample tax |
| Order placement | `COMPLETE` | Idempotent (incl. simultaneous double-submits), snapshots, status history, simulated payment, notification row, cart emptied |
| Confirmation, tracking, history | `COMPLETE` | Polls every 5 s while active and visible, stops at a final status; real step times, no ETA |
| Customer cancel | `COMPLETE` | Only while `PLACED`; compare-and-set referee for every status change |
| Demo auto-advance (`DEMO_AUTO_ADVANCE`) | `DEFERRED` → Phase 6 | Goes with the Kitchen Console and other demo tooling |

### 2. Files changed

69 files (48 added, 21 modified) since `main`.

- **Domain:** `src/server/domain/{pricing,hours,options,order-state-machine}.ts`
- **Services:** `src/server/services/{catalog,cart,checkout,orders,notifications,pagination}.ts`, `src/server/payments/gateway.ts`, `src/server/db/pg-errors.ts`, `src/server/http/{errors,limits}.ts`
- **API:** `src/app/api/v1/{restaurants,restaurants/[slug],cuisines,cart,cart/items,cart/items/[cartItemId],checkout/quote,orders,orders/[orderId],orders/[orderId]/transitions}/route.ts`
- **Shared:** `src/shared/schemas/ordering.ts`, `src/shared/format.ts`
- **UI:** pages `restaurants`, `restaurants/[slug]`, `cart`, `checkout`, `orders`, `orders/[orderId]`; components in `src/components/features/{restaurants,cart,orders}/`; header (navigation, cart badge, phone fix), landing copy, `TextAreaField`, `src/client/api.ts` (headers, error details); proxy protects the new areas
- **Tests:** `unit/{domain-ordering-rules,format}`, `integration/{catalog-and-cart,checkout-and-orders}`, role matrix extended, `component/ordering-ui`, `e2e/ordering.spec.ts`, support helpers, E2E global setup
- **Docs:** API spec §5–7, architecture (§4, §6, §9, §11, §16), threat model, testing, PRD, plan, README, review log, this report

### 3. Commands executed (clean clone of `feature/customer-ordering` at `ef70a46`, fresh `coogcrave_dev` and `coogcrave_test` databases, 2026-10-11)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm verify` (tracked-env, format, lint, typecheck, drift, coverage, build) | ✅ exit 0 (the first run failed the domain coverage gate on an unused function; removed, re-run from scratch) |
| ↳ `pnpm test:coverage` | ✅ 26 files, **351/351 tests passed**. Coverage 97.0% statements, 90.7% branches, 98.5% functions, 98.5% lines. Domain 98.1% / 97.3% branches / 100% functions; services 95.2% / 87.9% branches |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:demo` | ✅ 14 buildings, 10 cuisines, 11 restaurants, 31 items; 4 demo accounts |
| `pnpm test:e2e` (Chromium 141, `CI=1`) | ✅ **24/24 passed** (12 tests × mobile + desktop), no retries needed; also 2 earlier consecutive runs with retries disabled |
| `pnpm audit --audit-level=high` | ✅ pass (same accepted dev-only exceptions) |

**Checkpoint** (exit criterion: J1 E2E up to `PLACED`): `e2e/ordering.spec.ts` searches, signs in from the menu, hits a required choice, adds two bacon double cheeseburgers ($20.98), checks out to the library with a $3 tip ($29.34), double-clicks "Place order" (one order), sees the confirmation and history, and cancels.

### 4. Tests by result

All 351 Vitest tests and 24 E2E runs pass; none skipped. During development:
- **Real bugs caught by tests:** item counts in order history were always 0 (SQL subquery bound to the wrong `id`); the E2E setup's single-statement reset failed on re-runs.
- **Tests strengthened:** the cancel-vs-confirm race test was timing-dependent; it now forces the interleaving with a row lock and fails every run if compare-and-set is removed. Five mutation checks in total (`TESTING.md` §4).
- **Test-authoring mistakes fixed:** an E2E selector that matched two status messages; an E2E step that navigated before the cart update finished; ordering tests that tripped the real order rate limit.

### 5. Engineering risks remaining

| Risk | Impact | Next step |
|---|---|---|
| Orders can't move past `PLACED` in the UI | The demo stops at "Order placed" until the Kitchen Console (Phase 6) and couriers (Phase 5) exist | Phase 5 next; consider pulling the Kitchen Console forward if the demo date is close (D5) |
| Phase 4 CI hasn't run on GitHub | New workflow steps unproven in CI (E2E setup now edits restaurant hours) | Push the branch and open the PR |
| Restaurant hours are sample data | Real venues may be open when the app says closed (and vice versa) | Labeled as sample; replace with real hours only with permission |
| No TanStack Query | Fine for Phase 4; the courier dashboard may want shared client caching | Decide in Phase 5 (`ARCHITECTURE.md` §16) |
| Orders visible only to their customer | Admins can't see orders yet | Admin projection in Phase 6 |

### 6. Ready for review?

**Yes.** Every Phase 4 exit criterion passes from a clean clone with fresh databases, including the J1 browser journey on phone and desktop. One task (demo auto-advance) is deferred to Phase 6 and recorded.

### 7. What should happen next

1. Review the branch, mainly `src/server/services/{checkout,orders,cart}.ts` and the four "recorded for review" decisions added to `ARCHITECTURE.md` §16.
2. Push `feature/customer-ordering` and open a PR to `main` so CI runs.
3. On approval and merge: Phase 5 (courier experience) on `feature/courier-delivery`.

---

## Phase 3 report

### 1. What was implemented

| Task | Status | Notes |
|---|---|---|
| Full database schema + migrations | `COMPLETE` | 30 tables, 9 enums, 34 `CHECK` constraints, composite same-restaurant foreign keys, partial unique indexes (one active delivery per order and per courier). Migration `0000` generated; `0001` hand-written grants make `audit_events` and `order_status_events` append-only for the app role |
| Better Auth (email + password) | `COMPLETE` | Sign-up limited to UH emails, email verification required, sign-in/out, password reset, fixed 7-day database sessions, unused endpoints disabled, origin checks pinned on |
| Password policy | `COMPLETE` | 10–128 chars, zxcvbn score ≥ 3, not built from the user's own name/email |
| Rate limiting | `COMPLETE` | Postgres-backed, atomic, hashed keys; per-IP and per-email on every auth endpoint that sends email; default 300/min per IP on `/api/v1` |
| Roles and authorization | `COMPLETE` | `Actor` read from the database on every request; pure `checkAccess` policy (public / user / courier / admin); `withRoute` requires an access level on every route; page guards (redirect or 404) |
| Profile management | `COMPLETE` | `GET`/`PATCH /api/v1/me` (display name, usual drop-off building), `GET /api/v1/locations`, profile page |
| Account pages | `COMPLETE` | Sign up, check email, sign in, forgot/reset password, profile, sign out; accessible forms validated with the same schemas as the server |
| Admin plumbing | `COMPLETE` | Append-only audit log, `GET /api/v1/admin/audit-events` (keyset pagination), `/admin` activity log page, `pnpm admin:create` CLI (audited) |
| Seed data | `COMPLETE` | Idempotent catalog seed (13 real UH buildings, 9 cuisines, 6 **fictional** restaurants, 21 items); demo accounts on `.test` addresses, refused in production |
| Mail | `COMPLETE` (local) | `Mailer` port + file outbox for development/tests. No real provider yet: deployed config refuses the file transport (Phase 8) |
| Admin suspend endpoint (AUTH-7, sessions revoked) | `DEFERRED` → Phase 6 | Suspension is already enforced at sign-in and on every request; the admin action that sets it moves to Phase 6 with the other user-management tools (ADM-3) |

### 2. Files changed

125 files (90 added, 34 modified, 1 deleted) since `main`. Line counts are inflated by drizzle-kit's migration snapshots.

- **Database:** `src/server/db/schema/*` (12 files), `db/migrations/0000_initial_schema.sql`, `0001_app_role_append_only.sql`, `meta/*`
- **Auth:** `src/server/auth/{auth,route-handler,session,page-guards,password-policy,rate-limits}.ts`, `src/app/api/auth/[...all]/route.ts`
- **HTTP and access:** `src/server/http/{with-route,route,request-guards,client-ip,errors}.ts`, `src/server/domain/{actor,policies,email,safe-redirect}.ts`, `src/server/rate-limit/rate-limiter.ts`, `src/proxy.ts`
- **Services and API:** `src/server/services/{profile,locations,audit}.ts`, `src/app/api/v1/{me,locations,admin/audit-events}/route.ts`, `src/shared/{enums,schemas/*}.ts`
- **Accounts, mail, seeds:** `src/server/accounts/accounts.ts`, `src/server/mail/{mailer,templates}.ts`, `src/server/seed/*`, `scripts/{cli,seed,seed-demo,admin-create}.ts`
- **UI:** `src/app/{sign-up,sign-in,check-email,forgot-password,reset-password,profile,admin}/page.tsx`, `src/app/{layout,page}.tsx`, `src/components/ui/*`, `src/components/layout/site-header.tsx`, `src/components/features/{auth,profile,landing}/*`, `src/client/api.ts`; `src/app/loading.tsx` deleted
- **Tests:** 7 integration files, 4 new + 3 updated unit files, 1 new + 1 updated component file, `tests/e2e/auth.spec.ts` + support, `tests/support/*`
- **Config/CI:** `package.json`, `pnpm-lock.yaml`, `.env.example`, `vitest.config.mts`, `playwright.config.ts`, `.github/workflows/e2e.yml`
- **Docs:** all of `docs/` and `README.md` brought in line with the code

### 3. Commands executed (clean clone of `feature/auth-persistence` at `1117e09`, fresh `coogcrave_dev` and `coogcrave_test` databases, 2026-10-11)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm verify` (tracked-env, format, lint, typecheck, drift, coverage, build) | ✅ exit 0 |
| ↳ `pnpm lint` (`--max-warnings=0`) | ✅ 0 problems |
| ↳ `pnpm db:drift` | ✅ "No migration drift: schema and committed migrations agree." |
| ↳ `pnpm test:coverage` | ✅ 21 files, **242/242 tests passed**. Coverage 97.8% statements, 92.7% branches, 97.6% functions, 99.2% lines. Folder gates met: domain 95.1% / 97.4% branches; services 92.9% / 90% branches |
| ↳ `pnpm build` | ✅ compiled; 15 routes |
| `pnpm db:migrate` (empty dev database) | ✅ both migrations applied |
| `pnpm db:seed && pnpm db:seed:demo` | ✅ 13 locations, 9 cuisines, 6 restaurants, 21 items; 4 demo accounts |
| `pnpm test:e2e` (Chromium 141 via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `CI=1` so the suite starts its own production server) | ✅ **20/20 passed** (10 tests × mobile + desktop), no retries |
| `pnpm audit --audit-level=high` | ✅ pass (same accepted dev-only exceptions as Phase 2) |

**Checkpoint items** ("verify authentication, protected routes, migrations, and role-access tests"):

| Item | Evidence |
|---|---|
| Authentication | `auth-flow`, `auth-security` integration suites (register, verify, sign-in, sign-out, reset, change password, enumeration, redirects, CSRF, rate limits); E2E journeys in a real browser |
| Protected routes | API: `role-access.test.ts`. Pages: `page-guards.test.ts`, `proxy.test.ts`, and E2E (signed-out → sign-in → returned; student → real 404 at `/admin`) |
| Migrations | Applied to two empty databases; drift check clean; constraints exercised by `schema-constraints.test.ts` as the app role |
| Role-access tests | 5 endpoints × 6 identities (anonymous, student, approved courier, admin, suspended, unverified), each cell asserting status and error code; escalation and forged-cookie cases |

### 4. Tests by result

All 242 Vitest tests and 20 E2E tests pass; none skipped. Failures during development and what they were:
- **Real bugs the tests caught:** Better Auth's origin checks are off under `NODE_ENV=test` (open-redirect tests); name-based passwords accepted; protected pages returning 200 because of the root `loading.tsx` (E2E); misleading config error text; inaccessible names on the password toggle and profile link.
- **Weak tests strengthened:** audit pagination (now microsecond-level), and a new change-password test after the coverage report showed the endpoint untested. Both were mutation-checked: breaking the code makes them fail.
- **Test-authoring mistakes fixed:** a double `/api/auth` prefix in a helper, a password example that genuinely meets the policy (`Spring2027!!`, replaced with `Spring2027!`), an E2E query colliding with Next's route announcer, an E2E request missing its `Origin`.

No test was weakened or skipped to pass. Details: `CODE_REVIEW_LOG.md` (Phase 3).

### 5. Engineering risks remaining

| Risk | Impact | Next step |
|---|---|---|
| Phase 3 CI hasn't run on GitHub | Workflow changes (seed step, new env vars) unproven in CI | Push the branch; both workflows run on the PR |
| ~~D2 changed without your sign-off~~ **Resolved:** you chose real UH names | — | Done in the follow-up below |
| No email provider | Can't deploy; local users read emails from `.data/mail` | Phase 8 decision (D6) |
| `Secure` cookie flag untested over https | A misconfigured deploy could send cookies over http | Check on the first https deployment |
| Suspension doesn't delete sessions yet | A suspended user's session row lingers (but every request is refused) | Phase 6 admin endpoint |
| Timing differences between existing/new emails unmeasured | Possible slow-path enumeration | Measure in Phase 7 |
| `X-Forwarded-For` trusted for per-IP limits | Spoofable if exposed without a proxy | Confirm proxy behavior at deployment |

### 6. Ready for review?

**Yes.** Every Phase 3 exit criterion passes from a clean clone with fresh databases, including the browser E2E suite. One requirement half (admin suspend action) is explicitly deferred to Phase 6, and one approved default (D2) was changed and needs your decision.

### 7. What should happen next

1. Review the branch and decide on **D2** (fictional vs real restaurant names).
2. Push `feature/auth-persistence` and open a PR to `main`, so CI runs.
3. On approval and merge: Phase 4 (customer experience) on `feature/customer-ordering`, starting with the pure pricing and opening-hours rules.

### Follow-up: D2 resolved (`chore/real-restaurant-names`)

You chose **real UH restaurant names** at the checkpoint.

- **Seed:** 11 venues listed by UH (RAD Center: The Burger Joint, The Taco Stand, Absurd Bird, Paper Lantern, Katz Coffee; Student Center South: Chick-fil-A, Panda Express, Starbucks, Asado, Houston Street Subs, Shasta's Cones & More). Menus, prices, options, and hours remain invented samples. RAD Center added as a building (14 total); cuisines updated (10).
- **Upgrade path:** the seed now soft-deletes sample restaurants that are no longer in the data file and removes unused cuisines, never touching admin-added restaurants. Running it on a database holding the Phase 3 fictional restaurants retired all six.
- **Tests:** a new integration test covers retirement (mutation-checked); 243/243 Vitest and 20/20 E2E pass.
- **Labels:** every restaurant must show "Sample menu — not affiliated"; that UI arrives with restaurant pages in Phase 4.

---

## Phase 2 report

### 1. What was implemented

| Task | Status | Notes |
|---|---|---|
| Initialize app, pin dependencies | `COMPLETE` | Next.js 16.4, React 19.3, TypeScript 6.0.3 strict, exact pins, Node ≥ 22.12, pnpm 10.28 |
| Folder structure | `COMPLETE` | Per `ARCHITECTURE.md` §4 (folders for later phases are created when first used) |
| Lint and format | `COMPLETE` | ESLint 10.12 with type-aware, full jsx-a11y, layering, and security rules; each rule verified with planted violations. Prettier + Tailwind plugin |
| Testing setup | `COMPLETE` | Vitest projects (unit, component, integration on real Postgres as app role), 80% coverage gate, Playwright config |
| Database connectivity | `COMPLETE` | Drizzle + `pg` pool; migrator/app roles via one bootstrap SQL used locally, in Docker, and in CI; empty migrations journal |
| Environment configuration | `COMPLETE` | Zod-validated config that names bad variables without printing values; `.env.example` |
| CI | `COMPLETE` (written) / `BLOCKED` (execution) | `ci.yml` (quality, test, build) + `e2e.yml`; YAML and action inputs validated. **Not yet run:** no GitHub remote exists |
| Application shell | `COMPLETE` | Root layout, landing page, loading/error/not-found, design tokens, self-hosted fonts, footer disclaimers |
| Request pipeline + security headers | `COMPLETE` | `withRoute`, nonce CSP proxy, static headers, `/api/health` |
| E2E smoke test | `IN REVIEW` | Written (4 tests × 2 viewports) and discovered by Playwright; **not executed here**, see Blockers |

### 2. Files changed

- **Config:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.nvmrc`, `.env.example`, `drizzle.config.ts`, `vitest.config.mts`, `playwright.config.ts`, `docker-compose.yml`
- **Server:** `src/proxy.ts`, `src/server/{config,logger,health}.ts`, `src/server/http/{errors,respond,with-route}.ts`, `src/server/security/headers.ts`, `src/server/db/client.ts`, `src/server/db/schema/index.ts`, `src/app/api/health/route.ts`
- **UI:** `src/app/{layout,page,loading,error,not-found}.tsx`, `src/app/{globals.css,fonts.ts,icon.svg}`, `src/components/layout/site-footer.tsx`, `src/components/features/landing/order-ticket.tsx`
- **Scripts:** `scripts/local-postgres.sh`, `scripts/sql/{bootstrap-roles,grant-app-privileges}.sql`, `scripts/docker/postgres-init.sh`, `scripts/check-{migration-drift,tracked-env}.mjs`, `db/migrations/meta/_journal.json`
- **Tests:** `tests/unit/*` (6 files), `tests/component/landing.test.tsx`, `tests/integration/{health,db-roles}.test.ts` + `global-setup.ts`, `tests/e2e/smoke.spec.ts`, `tests/support/*`
- **CI/GitHub:** `.github/workflows/{ci,e2e}.yml`, `.github/dependabot.yml`, `.github/pull_request_template.md`
- **Docs:** `README.md`, `docs/TESTING.md` (new); `ARCHITECTURE`, `DATABASE_DESIGN`, `THREAT_MODEL`, `DEVELOPMENT_PLAN` updated to match the implementation; this file; `CODE_REVIEW_LOG.md`

### 3. Commands executed (clean clone of `feature/foundation` at `f5e9396`, 2026-10-10)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm check:tracked-env` | ✅ no env files tracked |
| `pnpm format:check` | ✅ all files formatted |
| `pnpm lint` (`--max-warnings=0`) | ✅ 0 problems |
| `pnpm typecheck` | ✅ route types generated, `tsc` clean |
| `pnpm db:drift` | ✅ no drift |
| `pnpm db:migrate` (fresh test DB) | ✅ applied (no migrations yet) |
| `pnpm test:coverage` | ✅ 9 files, **52/52 tests passed**; coverage 98.3% statements, 92.5% branches, 95% functions, 99.4% lines (gate 80%) |
| `pnpm build` | ✅ all pages dynamic (per-request CSP nonce) |
| `pnpm audit --audit-level=high` | ✅ pass; production deps: 0 known vulnerabilities; dev: 1 high accepted with reason, 1 moderate |
| `pnpm exec playwright test --list` | ✅ 8 tests discovered |
| `pnpm test:e2e` | ⛔ **not run**: Chromium download blocked (see Blockers) |
| Manual runtime checks on `pnpm start` | ✅ 200 home, 404 page, unique nonce per request, all scripts nonce-tagged, health 200 → 503 with DB stopped (no error text leaked) → 200 after restart |

### 4. Tests by result

All 52 Vitest tests pass. Three failures occurred during development and were fixed: one real bug (the two-line `<h1>` read as "delivered.By" to screen readers: missing space, fixed in `page.tsx`) and two test-authoring mistakes (byte arithmetic, a header value `Request` itself rejects). No test was skipped or weakened to pass.

### 5. Engineering risks remaining

| Risk | Impact | Next step |
|---|---|---|
| E2E and CI have never executed | CSP behavior in a real browser (fonts, Next's injected styles, hydration) is unverified; workflow logic unproven | Push to GitHub; the first CI run executes both. Or run `pnpm test:e2e` locally |
| `docker-compose.yml` untested (no Docker daemon here) | Teammates' first `docker compose up` could fail | The SQL it runs is the same script verified locally; first teammate run confirms |
| Pre-1.0 Drizzle, experimental Next test helper (`unstable_doesMiddlewareMatch`) | API churn on upgrade | Exact pins; Dependabot PRs must pass CI |
| ESLint plugin peer overrides; one accepted audit exception | Hidden incompatibility; unpatched dev-only ReDoS | Both documented with removal/review dates in `pnpm-workspace.yaml` |
| No visual review of the landing page | Layout or animation issues invisible to tests | First browser run (CI artifact or locally); full visual pass is Phase 7 |

### 6. Ready for review?

**Yes.** Every Phase 2 exit criterion that can run here passes from a clean clone. The two unexecuted items (E2E, CI) are blocked by environment, not by known defects.

### 7. What should happen next

1. Review this phase and the decisions marked "recorded for review" in `ARCHITECTURE.md` §16.
2. Create the GitHub repository and push `main` + `feature/foundation` so CI and E2E run for the first time.
3. On approval, Phase 3 (auth and persistence) on `feature/auth-persistence`.

---

## Phase status

| Phase | Status |
|---|---|
| 1 — Discovery & architecture | `COMPLETE` (approved 2026-10-10) |
| 2 — Project foundation | `COMPLETE` (merged to `main` in PR #1, `7f43939`) |
| 3 — Authentication & persistence | `COMPLETE` (approved 2026-10-11) |
| 4 — Customer experience | `IN REVIEW` |
| 5–8 | `NOT STARTED` |

## Blockers

- **Pushing from this workspace:** no GitHub push access here; branches are pushed from your machine.
- **Build sandbox egress policy** denies `cdn.playwright.dev`, `binaries.prisma.sh`, and Google Fonts. Not worked around: E2E uses the Chromium already installed in the workspace (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`); Prisma and web fonts were designed out.
- **Hosting and email credentials** (Phase 8 only).

## Defects

None open.

## Major technical decisions

See `ARCHITECTURE.md` §16. Phase 2 changes: Prisma → Drizzle (approved), ESLint 10, Cache Components off for nonce CSP, self-hosted fonts, `MIGRATOR_DATABASE_URL` naming. Phase 3 changes: UUIDs for auth tables, our Postgres rate limiter instead of Better Auth's, fixed 7-day sessions, zxcvbn password policy, origin checks pinned on, root `loading.tsx` removed, `tsx --conditions=react-server` for scripts, file-only mail transport, and **fictional restaurant names (D2 change, needs your decision)**.
