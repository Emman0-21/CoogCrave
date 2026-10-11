# CoogCrave — Demo Guide

> **For:** whoever presents CoogCrave (hackathon judges, a class, a recording). **Time:** about 5 minutes for the main story, 2 more for the admin tour.
> **Last updated:** 2026-10-11 (Phase 6b). Everything here runs locally; deployment is Phase 8.

The demo tells one story from three sides: a student orders food, an admin plays the restaurant, and another student delivers it. Everything that would involve money or a real restaurant is simulated and labeled that way on screen.

---

## 1. Before the demo (10 minutes, once)

1. **Start fresh data.**
   ```bash
   pnpm db:local:up            # if you use the project-local Postgres
   pnpm db:migrate
   pnpm db:seed                # campus buildings, 11 sample restaurants
   pnpm db:seed:demo           # the four demo accounts (password: SEED_DEMO_PASSWORD in .env)
   pnpm build && pnpm start    # production build on http://localhost:3000
   ```
2. **Set the demo switches in `.env`** (then restart `pnpm start`):
   - `DEMO_RESET_ENABLED=true` adds a "Reset the demo" card to the admin dashboard, so you can wipe the demo accounts' orders between runs.
   - `DEMO_AUTO_ADVANCE=false` for the live demo. Turn it on only to rehearse alone: it confirms new orders and marks them ready, 15 seconds apart, so you can practice the courier side without the Kitchen Console.
   - Both are refused when `APP_ENV=production`.
3. **Check the time.** Restaurants follow their sample hours in campus time. The Burger Joint (used below) takes orders Monday–Friday 10:30 AM–9 PM and weekends 11 AM–7 PM. Outside those hours, pick another restaurant that shows "Open until…" on the Restaurants page. Opening hours can't be edited in the app yet (see §6).
4. **Re-check the restaurant names** against UH's current dining listings: they're real venues with invented sample menus, and UH changes them from time to time (`src/server/seed/catalog-data.ts`).
5. **Open three browser windows**, each signed in as a different account. Use one normal window and two private windows (or two other browsers) so the sign-ins don't overwrite each other:

| Window | Account | Start on |
|---|---|---|
| Customer (phone-sized if you can: devtools device mode, 390 px wide) | `customer@demo.coogcrave.test` | `/restaurants` |
| Admin | `admin@demo.coogcrave.test` | `/admin` |
| Courier | `courier@demo.coogcrave.test` | `/courier` |

`applicant@demo.coogcrave.test` (Jamie) is a student whose courier application is waiting, for the admin tour.

---

## 2. The main story (J4, about 5 minutes)

| # | Window | Do | Say (one line) |
|---|---|---|---|
| 1 | Customer | Search "fries", open **The Burger Joint**, add **Fries** (×2) and a **Cheeseburger** | "Real UH spots, sample menus. Search covers dishes, not just names." |
| 2 | Customer | **Cart → Checkout**: choose a building, add a note ("Blue backpack, by the stairs"), keep the tip | "Delivery goes to a campus building. Totals come only from the server." |
| 3 | Customer | **Place order** (double-clicking is fine) | "One order, however many clicks: the request carries an idempotency key." |
| 4 | Admin | **Kitchen** → **Confirm**, then **Mark ready** | "There's no real restaurant, so an admin plays the kitchen. Every press is in the activity log." |
| 5 | Courier | **Go online**. The offer shows buildings and a simulated payout, **no name or note** | "Couriers don't see who you are until they've accepted." |
| 6 | Courier | **Accept**. Now the customer's name ("Casey C.") and the note appear | "Exactly one courier can win an order, even if many tap Accept at once. That's tested." |
| 7 | Customer | (no refresh needed) the page shows **Courier on the way** and the courier's first name (Riley) | "This page checks for updates by itself." |
| 8 | Courier | **I picked it up**, then **Delivered** | |
| 9 | Customer | **On its way**, then **Delivered**. Rate it 5 stars | "Ratings go to the courier who delivered it." |
| 10 | Customer | **Inbox** (badge in the header): every step is there | |
| 11 | Admin | **Orders** → the order: every step, who did it and when, the courier, the simulated payment, the rating | "Admins see everything; everyone else sees only what they need." |

---

## 3. The admin tour (optional, about 2 minutes)

- **Today:** orders by stage, applications waiting, couriers online, simulated sales.
- **Couriers:** approve `applicant@demo…` with a note. (In their window, **Deliver** now offers "Go online".)
- **Restaurants:** "Stop taking orders" at a restaurant, or mark an item sold out; the customer's menu shows it immediately. Put it back.
- **Orders → an open order → Fix a problem:** cancel with a reason. The customer is told and the demo payment is released.
- **Users:** suspend an account with a reason: they're signed out everywhere and can't sign back in. Lift it.
- **Activity:** every admin action above, with reasons.

---

## 4. Between runs

- **Admin → Today → Reset the demo** (type `RESET DEMO DATA`). This deletes the demo accounts' orders, carts, and notifications, puts the demo accounts back as they started (the applicant is pending again), and restores the sample menus. It refuses while the demo courier is in the middle of someone else's delivery.
- Or from the command line: `pnpm db:seed && pnpm db:seed:demo` restores the menus and accounts (orders stay).

---

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| "Restaurant isn't taking orders right now" | Outside sample hours, or someone pressed "Stop taking orders". Check **Admin → Restaurants**, or pick an open restaurant. |
| No offer in the courier window | The courier is offline (press **Go online**), or the order isn't ready yet (check **Kitchen**). The offer list refreshes every 10 seconds. |
| The admin "Approve" button is missing | The applicant was already approved: reset the demo. |
| "Too many requests" | Rate limits protect sign-in and ordering. Wait a minute and try again. |
| Signed in as the wrong person | Each window keeps its own sign-in only if it's a separate private window or browser. |

---

## 6. What to say honestly

- **Simulated:** payments (nothing is charged), the restaurant (an admin plays it), courier earnings (nobody is paid). The UI says so each time.
- **Not affiliated:** CoogCrave is a student project; the venues are real names with invented menus, prices, and hours.
- **Not built yet:** editing opening hours, menus beyond price and sold out, push or email notifications (the inbox is in-app), and deployment (Phase 8).
