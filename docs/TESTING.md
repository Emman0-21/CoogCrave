# CoogCrave — Testing

> **Last updated:** 2026-10-11 (Phase 5). Describes what exists now; each phase adds to it.

## 1. Test layers

| Project | Location | Environment | Database | Command |
|---|---|---|---|---|
| Unit | `tests/unit/**/*.test.ts` | Node | None: pure logic, dependencies injected | `pnpm test:unit` |
| Component | `tests/component/**/*.test.tsx` | jsdom + React Testing Library | None | `pnpm test:component` |
| Integration | `tests/integration/**/*.test.ts` | Node | **Real Postgres** (`coogcrave_test`), connected as the app role | `pnpm test:integration` |
| E2E | `tests/e2e/**/*.spec.ts` | Playwright: Pixel 7 + Desktop Chrome profiles | `coogcrave_dev` (seeded) behind a production build | `pnpm test:e2e` |

`pnpm test` runs the first three; `pnpm test:coverage` runs them with the coverage gate.

### Why integration tests use a real database

Most of CoogCrave's correctness guarantees live in Postgres: CHECK constraints on totals, partial unique indexes that stop two couriers winning one order, and role grants that keep the app from changing the schema. Mocked databases can't fail in those ways, so they can't prove those guarantees. Mocks are used only at true external boundaries (email, payments). Email in tests isn't mocked either: the real `FileOutboxMailer` writes to `.data/test-mail`, and tests follow the links in it exactly as a user would.

## 2. Integration test harness

- `tests/integration/global-setup.ts` applies committed migrations once per run, as the migrator role.
- `tests/support/integration-env.ts` points the app's `DATABASE_URL` at the test database **as the app role**, so every test exercises production grants.
- `tests/support/db.ts` provides `openPool(role)` for direct assertions and `resetDatabase()` (truncates all tables as the migrator).
- `tests/support/delivery.ts` has delivery helpers: `courierAccount()` (a signed-in student with a courier profile in any state and a distinct name), `readyOrder()` (placed and moved to ready by the simulated restaurant), `transition()`, `viewOrder()`.
- `tests/support/ordering.ts` has ordering helpers: seeded IDs, `openAllWeek`/`closeAllWeek` (tests never depend on the clock), `clearOrdering` (empties carts, orders, and rate-limit counters between tests), `checkout()`.
- `tests/support/http.ts` drives the real route handlers: `appRequest()` builds same-origin requests, `CookieJar` carries the session cookie between calls, and `mailTo()`/`linkIn()` read the outbox. `tests/support/auth.ts` builds on them (`signUp`, `signIn`, `registerVerified`, `signedInUser`). `tests/support/fixtures.ts` inserts campus, location, restaurant, and courier rows directly.
- Better Auth runs for real (not mocked) with its origin checks pinned on, so tests see production behavior.
- Files run one at a time (`fileParallelism: false`) because they share one database. Tests inside a file may run concurrent requests (the courier race tests depend on this).
- **Guardrail:** the harness refuses any database whose name doesn't end in `_test`, so a misconfigured `.env` can't wipe development data.

## 3. Coverage

- Provider: V8. Scope: `src/server/**` and `src/proxy.ts`.
- Gates (CI fails below any of them):

| Scope | Lines | Branches | Functions | Statements |
|---|---|---|---|---|
| Overall | 80% | 80% | 80% | 80% |
| `src/server/domain/**` (pure rules) | 95% | 90% | 100% | 95% |
| `src/server/services/**` | 90% | 80% | 90% | 90% |
- Coverage is a floor, not proof. Every state transition, authorization boundary, and user journey also gets an explicit test, whatever the percentage says.

## 4. What the Phase 5 tests cover

| Control | Test file | Requirement / threat |
|---|---|---|
| Payout = delivery fee + whole tip; accept policy and the order its refusals are reported in; "Alex R." / display name, never a full name; instructions only while active, order visible 24 h after the end | `unit/domain-delivery.test.ts` | PRD §6 · T-05, T-06 |
| Application is always `PENDING`, can't self-approve, duplicate → 409, rejected may reapply; pending applicants can't go online, see offers, or accept (403), and get 404 for any other move | `integration/delivery.test.ts` | DLV-1, DLV-2 · T-03 |
| Availability toggle keeps "online since"; offers have exactly 8 fields (no name, note, email, prices); own and not-ready orders never offered; decline is per-courier and idempotent | `integration/delivery.test.ts` | DLV-2…4 · T-05, T-06 |
| Accept: assignment, courier projection, customer notified and sees the courier's first name; display name honored; offline, own order (422) and second delivery (409) refused | `integration/delivery.test.ts` | DLV-5…7, TRK-1 · T-06 |
| **Race:** 6 couriers accept one order at once, 20 rounds: exactly one winner and one active assignment. **Double tap:** one courier accepts two offers at once, 20 rounds: exactly one succeeds | `integration/delivery.test.ts` | DLV-5, DLV-6 · T-09 |
| Pickup → delivered: payout recorded, demo payment captured, note hidden afterwards; release before pickup needs a reason and returns the order to others (not the releaser); failed delivery voids the payment and pays nothing | `integration/delivery.test.ts` | DLV-8…10 · T-04 |
| Other couriers get 404; the courier gets 404 24 h after the end | `integration/delivery.test.ts` | T-01, T-05 |
| Kitchen Console: confirm and mark ready as `RESTAURANT_SIM` with an audit row naming the admin; reject needs a reason; non-admins get 403; restaurant can't mark delivered (409) | `integration/delivery.test.ts` | ADM-7 · T-04, T-12 |
| Role matrix extended to all 9 new endpoints (`courierOnly` helper: user, pending courier, rejected courier → 403; approved → allowed) | `integration/role-access.test.ts` | T-03 |
| Offers (simulated payout, accept, "someone was faster" → reload, skip, skip failure keeps the offer and explains, going offline elsewhere reloads the page), current delivery (only allowed moves, reason before giving it back), go online, application form, Kitchen Console (confirm sends the shown version, reject needs a reason) | `component/delivery-ui.test.tsx` | DLV-2…9, ADM-7 |
| **Journey J2/J4** (desktop): customer orders, admin confirms and marks ready in the Kitchen Console, courier goes online, sees the offer without the customer's name or note, accepts, sees the note, picks up, delivers; customer sees the courier's first name and "Delivered"; earnings show the payout. Second test: a student applies and can't open courier-only pages | `e2e/delivery.spec.ts` | Phase 5 exit criterion · T-05 |

Mutation checks in Phase 5 (each broken on purpose, test failed, code restored): "only the assigned courier" check removed; instruction gating removed; both compare-and-set guards **and** the unique-index translation removed (losers get 500s; with only the guards removed the index still holds and the test passes, which is the designed defense in depth); 404 for an unapproved courier's non-accept moves removed; skip-failure and offline-elsewhere handling removed from the offer list.

**Flakiness check (exit criterion):** the two concurrency tests were run 20 times in a row (each run is itself 20 rounds): 20/20 green.

## 4a. What the Phase 4 tests cover

| Control | Test file | Requirement / threat |
|---|---|---|
| Pricing (round-half-up, worked example, 2 000 generated carts add up), opening hours (midnight-crossing, DST, next opening), option rules, the full state-machine table | `unit/domain-ordering-rules.test.ts` | PRD §6, CAT-5, CART-2 · T-04 |
| Display formatting: cents, minutes, "Opens tomorrow at…" in campus time | `unit/format.test.ts` | CAT-5 |
| Restaurant list: sample flag, orderable first, search over names and menu items with literal wildcards, cuisine and open-now filters, strict query; detail with hours and menu; deleted rows hidden; 404s | `integration/catalog-and-cart.test.ts` | CAT-1…6 |
| Cart: server pricing, merging, option rules, availability, one restaurant per cart, own cart only, live re-pricing and blocking problems, minimum subtotal, simultaneous first adds | `integration/catalog-and-cart.test.ts` | CART-1…4 · T-08 |
| Quote and order placement: worked example ($29.34), snapshots, history, simulated payment, notification, empty cart after; tampered/stale totals; closed restaurant, unavailable item, empty cart; idempotency including 5 simultaneous submits | `integration/checkout-and-orders.test.ts` | ORD-1…7 · T-08, T-10 |
| Visibility, cancel, refusal after confirm, customers can't advance orders, `STALE_STATE`, deterministic cancel-vs-confirm race, restaurant steps on the timeline, history with scopes and cursor | `integration/checkout-and-orders.test.ts` | ORD-8, ORD-9, TRK-1 · T-01, T-04, T-11 |
| Role matrix extended to all 13 new endpoints | `integration/role-access.test.ts` | T-03 |
| Add-to-cart dialog (required choices, max choices, unavailable options, price, conflict → new cart), checkout (sample tax and demo labels, building required, one Idempotency-Key across retries, `PRICE_CHANGED`), tracking (steps with times, no ETA, cancel confirmation with `expectedVersion`, polling every 5 s that stops at a final status) | `component/ordering-ui.test.tsx` | CART-1, ORD-1…4, TRK-1…3 |
| **Journey J1 to `PLACED`** (mobile + desktop): search, sign in from the menu, required choice, add, cart, checkout, double-click place (one order), confirmation, history, cancel; another account gets a real 404 for the order page | `e2e/ordering.spec.ts` | Phase 4 exit criterion · T-01, T-10 |

Mutation checks in Phase 4 (each broken on purpose, test failed, code restored): order ownership filter removed; `PRICE_CHANGED` check removed; in-lock idempotency replay removed; option validation removed; both compare-and-set guards removed (the race test fails every run; with only one removed the other still protects, so it passes, which is correct).

## 5. What the Phase 3 tests cover

| Control | Test file | Requirement / threat |
|---|---|---|
| Register → email verification → sign-in (cookie attributes) → server-side sign-out; passwords stored only as hashes; emails lowercased | `integration/auth-flow.test.ts` | AUTH-1, 3, 4 · T-16 |
| Client-supplied `role`/`suspendedAt`/`emailVerified` ignored or refused at sign-up | `integration/auth-security.test.ts` | AUTH-6 · T-02 |
| Domain allowlist incl. subdomains and look-alikes; password policy; name rules | `integration/auth-security.test.ts`, `unit/domain-auth-rules.test.ts`, `unit/auth-support.test.ts` | AUTH-1, 2 · T-19 |
| Identical answers for existing/new emails at sign-up, sign-in, and reset | `integration/auth-security.test.ts` | T-15 |
| Reset: single use, signs out other sessions, made-up tokens refused. Change password: needs a session and the current password, applies the policy | `integration/auth-security.test.ts` | AUTH-5 · T-17 |
| Suspended accounts can't sign in | `integration/auth-security.test.ts` | AUTH-7 · T-07 |
| Off-site redirects refused (verify, reset); `safeNextPath` | `integration/auth-security.test.ts`, `unit/domain-auth-rules.test.ts` | T-18 |
| `/api/auth` request hygiene: cross-origin, form bodies, oversize, disabled endpoints, request IDs, no tokens in logs | `integration/auth-security.test.ts`, `unit/auth-route-handler.test.ts` | T-20, T-24, T-27 |
| Rate limits per IP and per email, across rotating IPs; limiter atomic under concurrency; hashed keys; pruning | `integration/auth-security.test.ts`, `integration/rate-limiter.test.ts`, `unit/auth-support.test.ts` | T-14, T-33 |
| **Role-access matrix:** every Phase 3 endpoint × anonymous, student, approved courier, admin, suspended, unverified; documented code per denial; role can't be escalated; forged cookie rejected | `integration/role-access.test.ts` | T-03 |
| Access policy, every level × role × courier status | `unit/domain-auth-rules.test.ts` | T-03 |
| Page guards: redirect with safe `next`, suspended notice, 404 for missing capability | `unit/page-guards.test.ts` | T-03 |
| Proxy sends cookie-less visitors to sign-in for protected paths | `unit/proxy.test.ts` | UX only (not a boundary) |
| Profile read/update, own account only, active drop points only, no sensitive fields | `integration/profile-and-audit.test.ts` | AUTH-8 · T-23 |
| Audit log: newest first, keyset pages don't skip rows sharing a millisecond, admin actor and request ID recorded, bad cursors refused | `integration/profile-and-audit.test.ts` | ADM-9 · T-12 |
| Schema constraints: totals, line totals, same-restaurant composite FKs, one active assignment per order/courier, review uniqueness, hours, append-only grants on `audit_events` and `order_status_events` | `integration/schema-constraints.test.ts` | T-08, T-10, T-12, T-13, T-28 |
| Seeds idempotent; demo seed refuses production; demo accounts sign in through the real flow; `admin:create` creates/promotes and audits, applies the password policy | `integration/seed-and-admin.test.ts` | T-35 |
| Forms: labels/hints/errors associated, password reveal, browser validation, server errors on the right field, rate-limit and network messages, profile saves only changes | `component/auth-forms.test.tsx` | Accessibility · AUTH-1, 5, 8 |
| **Browser journeys** (mobile + desktop): register → confirm email → sign in → edit profile → sign out; return to the requested page after sign-in; wrong password; reset through emailed link; students get a real 404 at `/admin`; admins see the activity log | `e2e/auth.spec.ts` | AUTH-1 … 8, T-03 |

### Mutation checks

A passing test only matters if it can fail. During Phase 3 these were broken on purpose, the named test failed, and the code was restored:
- a `CHECK` constraint dropped from the test database → `schema-constraints.test.ts`
- the audit cursor switched back to millisecond precision → the pagination test in `profile-and-audit.test.ts`
- the password policy removed from `/change-password` → the change-password test in `auth-security.test.ts`

And one real bug the tests caught on their own: Better Auth switches its origin checks off under `NODE_ENV=test`, so the open-redirect tests failed until the checks were pinned on.

## 6. What the Phase 2 tests cover

| Control | Test file | Threat ID |
|---|---|---|
| Config validation fails fast, never echoes values | `unit/config.test.ts` | T-27 |
| Log redaction of passwords, tokens, cookies, emails, delivery instructions | `unit/logger.test.ts` | T-27 |
| Page CSP (nonce, no unsafe-inline scripts), API deny-all CSP, static headers, HSTS gating | `unit/security-headers.test.ts` | T-21, T-25 |
| Proxy issues a fresh nonce per request; runs on pages only | `unit/proxy.test.ts` | T-21 |
| CSRF: cross-origin and cross-site mutations rejected; form bodies rejected | `unit/with-route.test.ts` | T-20 |
| Strict schemas reject unknown fields (mass assignment) | `unit/with-route.test.ts` | T-02 groundwork |
| 16 KB body limit, enforced even without Content-Length | `unit/with-route.test.ts` | T-24 |
| Unexpected errors return a code and request ID only; details go to logs | `unit/with-route.test.ts` | T-31 |
| Health check hides internal error text | `unit/health.test.ts` | T-31 |
| Landing copy, non-affiliation disclaimer, accessible progress list | `component/landing.test.tsx` | T-32 |
| Health route round-trips to Postgres as the app role | `integration/health.test.ts` | — |
| App role can't create, alter, drop, or truncate tables | `integration/db-roles.test.ts` | T-28 |
| CSP produces no violations in a real browser; skip link; 404 page | `e2e/smoke.spec.ts` | T-21 |

## 7. Running locally

```bash
docker compose up -d db        # or: pnpm db:local:up
cp .env.example .env           # once
pnpm db:migrate                # once per new migration
pnpm test                      # unit + component + integration
pnpm db:seed && pnpm db:seed:demo   # E2E signs in as the demo accounts
pnpm build && pnpm exec playwright install chromium && pnpm test:e2e
```

E2E global setup (`tests/e2e/support/global-setup.ts`) clears rate-limit counters on the dev database before each run, so repeated local runs don't trip sign-in limits, stops with a clear message if the demo accounts are missing, and opens The Burger Joint around the clock so the ordering journey works at any hour (`pnpm db:seed` restores its sample hours). Ordering tests create their own new accounts, so the mobile and desktop runs never share a cart. If Playwright's browser download is blocked, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at an installed Chromium.

## 8. CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`: locked install, tracked-env check, format, lint, typecheck, audit, migration drift check, migrations against a fresh Postgres 16, unit + component, integration, coverage gate, and a production build. `.github/workflows/e2e.yml` migrates and seeds a fresh database (throwaway CI-only secrets), builds the app, and runs Playwright. No step suppresses failures (`|| true` and `continue-on-error` aren't used).

## 9. Writing new tests

- Business rules go in `src/server/domain` as pure functions, unit-tested exhaustively (e.g. every from × to × actor combination for the order state machine).
- Services and routes are integration-tested through the real route handler (`GET(new Request(...))`), against the real database.
- Name tests after the behavior or rule they protect, and reference the requirement or threat ID when there is one.
- Every new endpoint joins the role-access matrix in `integration/role-access.test.ts` with its expected status for each identity.
- Never mark a feature complete while any of its tests fail (Definition of Done).
