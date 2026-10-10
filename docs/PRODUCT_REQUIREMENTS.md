# CoogCrave — Product Requirements

> **Status:** Draft for Phase 1 architecture checkpoint · **Last updated:** 2026-10-10
> **Tagline:** "Cravings Delivered. By Coogs, For Coogs."

CoogCrave is an independent student project built for a University of Houston hackathon. It is **not affiliated with, endorsed by, or operated by the University of Houston** or any restaurant shown in the app. The UI must say so on the landing page and in the footer.

---

## 1. Problem and goals

**Problem.** Students on the UH main campus often can't leave class, lab, or the library long enough to get food, while other students would welcome short, flexible earning opportunities between classes. Commercial delivery apps are built for street addresses and cars, not for "3rd floor of MD Anderson Library, by the east stairs."

**Goals for the MVP**

| # | Goal | How we'll know |
|---|------|----------------|
| G1 | A student can order food from a campus restaurant and follow it to their building | Customer E2E journey passes against real persistence |
| G2 | Another student can find, accept, and complete that delivery | Courier E2E journey passes; concurrency test proves one courier per order |
| G3 | An admin can approve couriers, manage restaurants/menus, and inspect any order | Admin E2E journey passes; role-isolation tests pass |
| G4 | The full 11-step demo runs repeatably with no DB edits or code changes | Demo reset + seeded fixtures; demo script rehearsed |
| G5 | The codebase is a credible base for a real product | CI green; docs match implementation; threat model controls verified by tests |

**Non-goals for the MVP** are listed in §9.

---

## 2. Users and roles

Every account is a **student account**. Extra capabilities are layered on top rather than being separate account types, because the same student will often order lunch and deliver dinner.

| Role / capability | Who | How it's granted |
|---|---|---|
| **Customer** | Any signed-in user with a verified email | Default for every account |
| **Courier** | A customer whose courier application is `APPROVED` and not suspended | Admin approves an application |
| **Administrator** | Platform staff accounts | Seed script / CLI only — **there is no API to grant admin** |
| **Restaurant (simulated)** | No real restaurant accounts in the MVP | Restaurant actions (confirm, mark ready, reject) are performed in the admin **Kitchen Console** and labeled "Simulated restaurant action" |

Admins are separate accounts and do not place orders or deliver. A courier can never accept their own order.

---

## 3. Glossary

- **Order status** — one of `PLACED`, `CONFIRMED`, `READY_FOR_PICKUP`, `ASSIGNED`, `PICKED_UP`, `DELIVERED`, `CANCELLED`, `DELIVERY_FAILED`. Full state machine in `ARCHITECTURE.md` §6.
- **Offer** — a `READY_FOR_PICKUP` order shown to eligible online couriers.
- **Drop point** — a predefined campus delivery location (building + optional landmark). Customers add free-text instructions.
- **Demo mode** — any simulated behavior (payments, restaurant actions, earnings). Always labeled in the UI.
- **Verified UH email** — the user clicked a verification link sent to an allowed UH email domain. This proves control of the inbox, **not** current enrollment; the UI never says "verified student."

---

## 4. Functional requirements

Each requirement has an ID used in the development plan, tests, and PR template. **Priority:** M = must for demo, S = should for MVP, C = could if time allows.

### 4.1 Authentication and accounts (AUTH)

| ID | Requirement | Pri |
|---|---|---|
| AUTH-1 | Register with name, email, password. Password ≥ 10 chars, checked against a common-password list. | M |
| AUTH-2 | Email domain must be in `ALLOWED_EMAIL_DOMAINS` (default `uh.edu,cougarnet.uh.edu`, subdomains matched) — configurable so demo/judge accounts can be seeded. | M |
| AUTH-3 | Email verification by single-use, expiring link. Unverified users can browse but cannot order or apply as courier. | M |
| AUTH-4 | Sign in, sign out, persistent session (httpOnly cookie, server-side session record, revocable). | M |
| AUTH-5 | Password reset by single-use, expiring emailed link. Responses never reveal whether an email is registered. | S |
| AUTH-6 | Role and courier status are never accepted from client input at signup or profile update. | M |
| AUTH-7 | Suspended users are signed out (sessions revoked) and cannot sign in. | S |
| AUTH-8 | Users can view and edit their display name and default drop point. | S |

### 4.2 Restaurant discovery (CAT)

| ID | Requirement | Pri |
|---|---|---|
| CAT-1 | Browse restaurants as cards (image, name, cuisines, open/closed, "Sample data" badge). Browsing does not require sign-in. | M |
| CAT-2 | Search restaurants and menu items by text. | S |
| CAT-3 | Filter by cuisine and by "open now". | S |
| CAT-4 | Restaurant detail: hours, location on campus, menu grouped by category, prices, unavailable items shown disabled. | M |
| CAT-5 | Open/closed is computed server-side from weekly hours in the campus time zone (America/Chicago) plus an admin "accepting orders" switch. | M |
| CAT-6 | Every seeded restaurant, menu, price, image, and hours entry is marked as sample data in the UI. No real restaurant logos. | M |

### 4.3 Cart and checkout (CART / ORD)

| ID | Requirement | Pri |
|---|---|---|
| CART-1 | Server-side cart, one per user, items from a single restaurant. Adding from a different restaurant prompts to replace the cart. | M |
| CART-2 | Add item with required/optional option selections (e.g., size, add-ons) and a short special-instructions note. Option rules (min/max selections) enforced server-side. | M |
| CART-3 | Change quantity (1–20), remove items, clear cart. | M |
| CART-4 | Cart always displays server-computed prices; items that became unavailable are flagged and block checkout. | M |
| ORD-1 | Checkout: choose drop point, add delivery instructions (≤ 280 chars), choose tip, see itemized subtotal, delivery fee, service fee, sample tax, tip, total. | M |
| ORD-2 | Checkout is clearly labeled **"Demo checkout — no real payment is taken."** No card fields are shown. | M |
| ORD-3 | The server recomputes every price and total. The client sends the total it displayed only as a consistency check; a mismatch returns `PRICE_CHANGED` with a fresh quote instead of placing the order. | M |
| ORD-4 | Placing an order is idempotent per checkout attempt (Idempotency-Key). A double-click or retry never creates two orders. | M |
| ORD-5 | Orders snapshot item names, unit prices, option names/prices, and the drop point so history stays accurate after menu edits. | M |
| ORD-6 | Restaurant must be open and accepting orders at placement time; otherwise a clear error. | M |
| ORD-7 | Order confirmation screen with order number and link to tracking. | M |
| ORD-8 | Order history: active and past orders, newest first. | M |
| ORD-9 | Customer may cancel only while the order is `PLACED` (before the restaurant confirms). Later problems go through admin. | S |

### 4.4 Delivery (DLV)

| ID | Requirement | Pri |
|---|---|---|
| DLV-1 | Courier application: transport mode (walk / bike / scooter), agreement to courier guidelines. Requires verified email. | M |
| DLV-2 | Approved couriers toggle online/offline. Only online, approved, non-suspended couriers see offers. | M |
| DLV-3 | Offers list shows restaurant, pickup building, destination building, item count, and simulated payout — **no customer name or instructions**. | M |
| DLV-4 | Courier can accept or decline an offer. Declined offers are hidden for that courier. | M |
| DLV-5 | Exactly one courier can win an offer, even under simultaneous accepts (others receive "Offer no longer available"). | M |
| DLV-6 | A courier may hold at most one active delivery at a time. | M |
| DLV-7 | After accepting, the courier sees pickup details, customer first name + last initial, drop point, and instructions. | M |
| DLV-8 | Courier marks picked up, then delivered. Invalid jumps (e.g., delivered before pickup) are rejected. | M |
| DLV-9 | Before pickup, a courier can release a delivery (returns to offers). After pickup, a courier can report delivery failed with a reason. | S |
| DLV-10 | Delivery history and simulated earnings (delivery fee + 100% of tip, labeled "Simulated earnings — no payouts"). | S |
| DLV-11 | Courier stats: completed deliveries, average rating. | C |

### 4.5 Tracking, notifications, reviews (TRK / NTF / REV)

| ID | Requirement | Pri |
|---|---|---|
| TRK-1 | Tracking page shows status timeline, restaurant, items, courier first name (when assigned), drop point, and timestamps of each step. | M |
| TRK-2 | Status updates appear without reload (polling every ~5 s while active, paused when tab hidden, stopped at terminal state). | M |
| TRK-3 | No fabricated GPS positions or ETAs. If an estimate is ever shown it must be labeled as an estimate and its basis documented. | M |
| NTF-1 | Persisted in-app notifications for: placed, confirmed, ready for pickup, courier assigned, courier released, picked up, delivered, cancelled, delivery failed, courier application decided. | S |
| NTF-2 | Unread badge, notification list, mark read / mark all read. | S |
| REV-1 | After `DELIVERED`, the customer can rate the delivery 1–5 with an optional comment (≤ 500 chars). One review per order. | S |
| REV-2 | Only the order's customer can review it. | S |

### 4.6 Administration (ADM)

| ID | Requirement | Pri |
|---|---|---|
| ADM-1 | Dashboard metrics: orders today by status, online couriers, pending courier applications, simulated GMV. | S |
| ADM-2 | Review courier applications; approve or reject with a note; suspend an approved courier. | M |
| ADM-3 | User list with search; suspend / unsuspend users. | S |
| ADM-4 | Create, edit, and soft-delete restaurants (name, description, campus location, cuisines, hours, image, accepting-orders switch). | S |
| ADM-5 | Manage menu categories, items (price, availability), and option groups/options. | S |
| ADM-6 | Order list with filters; order detail with status history, assignment, simulated payment record, and review. | M |
| ADM-7 | **Kitchen Console:** perform simulated restaurant actions (confirm, mark ready, reject) on orders. Each action is labeled simulated and recorded with actor type `RESTAURANT_SIM`. | M |
| ADM-8 | Resolve problems: cancel any non-terminal order with a reason; unassign a courier before pickup. | S |
| ADM-9 | Every admin mutation writes an append-only audit event; admins can browse the audit log. | M |
| ADM-10 | Demo reset (re-seed fixtures) — available only when `APP_ENV` is not `production` **and** `DEMO_RESET_ENABLED=true`, admin-only, audited. | M |

---

## 5. Primary user journeys

These become the Playwright E2E tests (`TESTING.md`).

**J1 — Customer orders lunch.** Sign in → browse restaurants → open a restaurant → pick an item and options → add to cart → checkout (drop point, instructions, tip) → place demo order → confirmation → tracking page updates through `DELIVERED` → leave a review.

**J2 — Courier delivers.** Sign in → courier dashboard → go online → see offer (no customer PII) → accept → see full delivery details → mark picked up → mark delivered → see it in history and simulated earnings.

**J3 — Admin operates the platform.** Sign in → approve a pending courier → in Kitchen Console confirm and mark ready a new order → open the order record and see full history → edit a menu item's availability.

**J4 — Hackathon demo (11 steps).** Customer places order → (Kitchen Console marks it ready, or demo auto-advance — see open question Q3) → courier accepts → courier picks up → customer sees "Picked up" → courier delivers → customer sees "Delivered" → admin reviews the order record.

---

## 6. Key business rules

1. **Pricing (all integer cents, USD).**
   `subtotal = Σ (unit price + Σ selected option deltas) × quantity`
   `delivery fee` = campus flat fee (sample: $2.49)
   `service fee` = round-half-up(subtotal × service fee bps / 10 000), min $0.50, max $3.00 (sample values)
   `tax` = round-half-up((subtotal + service fee) × tax bps / 10 000) — a **sample** rate, labeled as such
   `tip` = customer-chosen, 0–$50
   `total = subtotal + delivery fee + service fee + tax + tip` (also enforced by a DB check constraint)
   Minimum subtotal: $5.00 (sample).
2. **Courier payout (simulated)** = delivery fee + 100% of tip, fixed at the moment of delivery.
3. **Cancellation:** customer while `PLACED`; restaurant (simulated) reject while `PLACED`; admin any non-terminal state with a reason.
4. **Courier eligibility to accept:** approved, not suspended, online, email verified, no active delivery, not the order's customer, order currently `READY_FOR_PICKUP`.
5. **Visibility:** customers see only their own orders; couriers see offer projections (no PII) and full details only for orders assigned to them; admins see everything.

All sample values live in configuration and are listed in `DATABASE_DESIGN.md` (`campuses` table).

---

## 7. Non-functional requirements (NFR)

| ID | Requirement |
|---|---|
| NFR-1 | Mobile-first: fully usable at 360 px width; responsive to desktop. |
| NFR-2 | Accessibility target WCAG 2.2 AA: semantic HTML, keyboard navigation, visible focus, labeled form controls, 4.5:1 text contrast, `prefers-reduced-motion` respected. |
| NFR-3 | Performance (local, seeded data): p95 API latency < 300 ms for reads; Lighthouse performance ≥ 85 on mobile for landing and restaurant list. |
| NFR-4 | Security controls in `THREAT_MODEL.md` implemented and covered by tests where testable. |
| NFR-5 | Reproducible setup: clone → `.env` from `.env.example` → documented commands → running app with seed data. |
| NFR-6 | Structured JSON logs with request IDs; secrets, passwords, tokens, cookies, and delivery instructions never logged. |
| NFR-7 | ≥ 80% line and branch coverage on `src/server/domain` and `src/server/services`; every state transition and authorization boundary has an explicit test. |

---

## 8. Data and privacy

- Collected: name, email, password hash (managed by the auth library), default drop point, order contents, delivery instructions, reviews. **Not collected:** phone numbers, student IDs, real payment data, live location.
- Delivery instructions are visible only to the customer, the assigned courier (while the delivery is active and for 24 h after), and admins.
- Retention (documented now, enforced by a scheduled job post-MVP): delivery instructions redacted 30 days after an order reaches a terminal state; audit events kept 1 year; account deletion anonymizes orders rather than deleting them.

---

## 9. Out of scope for the MVP (future)

Real payments and payouts · real restaurant partner accounts / merchant portal · GPS tracking and ETAs · push/email order notifications · promotions and referrals · multi-campus UI (the schema has a `campuses` table so this is cheap later) · scheduled orders · in-app chat between courier and customer · native mobile apps (the API is versioned REST so a mobile client can reuse it).

---

## 10. Assumptions and open questions

Assumptions are the defaults the plan proceeds with if not answered. Open questions are also tracked in `DEVELOPMENT_PLAN.md` §2.

| # | Question | Default assumption |
|---|---|---|
| Q1 | Real UH venue names (with "sample menu — not affiliated" labels) or fictional names? | Real on-campus venue names, generic imagery, sample menus/prices, disclaimer on every card |
| Q2 | Restrict sign-up to UH email domains? | Yes in production; demo/judge accounts are seeded |
| Q3 | Demo: show the Kitchen Console step live, or auto-advance restaurant steps? | Kitchen Console live; an auto-advance toggle exists for rehearsal in non-production only |
| Q4 | Hackathon date, team size, and who builds what? | Unknown — affects scope cuts in `DEVELOPMENT_PLAN.md` |
| Q5 | Hosting accounts (Vercel + Neon) and an email provider (Resend) available? | Local-only until credentials exist; documented as a Phase 8 blocker |
