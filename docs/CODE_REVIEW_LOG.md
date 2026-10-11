# CoogCrave — Code Review Log

Each entry states whether it is an **automated self-review** (performed by Claude) or an **independent human review**. No human review has occurred yet.

---

## 2026-10-10 · Phase 1 (design documents) · Automated self-review

**Scope:** `docs/PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_SPEC.md`, `THREAT_MODEL.md`, `DEVELOPMENT_PLAN.md`. No application code exists.

| # | Finding | Severity | Correction | Verification |
|---|---|---|---|---|
| 1 | Notification enum included `ORDER_READY` and `COURIER_RELEASED`, but the PRD and transition T3 didn't produce them | Low | Added to NTF-1 and to T3 side effects | Re-read sections |
| 2 | Threat T-04 abbreviated a status as `READY` | Low | Changed to `READY_FOR_PICKUP` | Script check: no non-enum statuses remain |
| 3 | `SEED_DEMO_PASSWORD` referenced in DB design but missing from the architecture's config table | Low | Added | Re-read |
| 4 | Ambiguous cross-reference "PRD §6.4" | Low | Rewritten as "§6, rule 4" | Re-read |
| 5 | Error codes cross-checked | — | All codes used in any doc are defined in the API error table | Script check |
| 6 | Worked pricing example (subtotal 2098 → total 2934, payout 549) | — | Recomputed from the documented rounding rules | Script check |

**Remaining concerns**
- Better Auth endpoint paths and exact auth table columns are deferred to Phase 3 (depend on the installed version).
- Whether Prisma 7.10 can express partial unique indexes natively is unverified; the plan assumes raw SQL in migrations either way.
- Effort estimates are uncalibrated until Phase 2 completes.

---

## 2026-10-10 · Phase 2 (project foundation) · Automated self-review

**Scope:** all code on `feature/foundation` (`9baa5f7`, `f5e9396`): config, logger, HTTP pipeline, security headers, proxy, DB client, health, app shell, tests, CI, scripts. **No human review has occurred yet.**

| # | Area | Finding | Severity | Correction | Verification |
|---|---|---|---|---|---|
| 1 | Accessibility | Two-line `<h1>` had no whitespace between spans; screen readers and copy/paste got "delivered.By" | Medium | Added a space between the spans | Component test (it caught the bug) |
| 2 | Security / UX | CSP always included `upgrade-insecure-requests`, which breaks subresources on `http://localhost` production runs and E2E | Medium | Directive now depends on `APP_URL` being https | Unit test + curl on `pnpm start` |
| 3 | Correctness | Logger redaction built an invalid path for keys containing `-` | Medium | Removed bracket-path branch; only identifier keys are redacted | Logger test |
| 4 | Architecture | Health route imported the DB client directly, violating "routes go through services" | Low | Moved wiring into `server/health.ts`; lint rule now forbids it | Lint (planted violation caught) |
| 5 | Lint coverage | Next's preset enables only 6 jsx-a11y rules | Medium | Enabled the full recommended set | Planted a11y violations caught |
| 6 | Lint validity | A clean lint run proves nothing unless rules fire | — | Planted 11 violations (layering, `sql.raw`, `dangerouslySetInnerHTML`, raw hex, floating promise, non-exhaustive switch, console, a11y); all reported | Probe files deleted after |
| 7 | Dependencies | `pnpm audit`: high (braces, dev-only, no patch), moderate (esbuild dev server, dev-only) | Low | Accepted with written reason and review date; CI still fails on new highs | `pnpm audit --prod`: 0 findings |
| 8 | Dependencies | Removing Prisma left it in the tree as a stale optional peer of drizzle-orm | Low | Regenerated the lockfile | `pnpm why prisma` empty |
| 9 | Dead code | Unused `noContent()` and two unused error codes | Low | Removed | Typecheck, coverage |
| 10 | Docs drift | Phase 1 docs referenced Prisma, ESLint 10 assumptions, `DIRECT_DATABASE_URL` | Low | Docs updated; decision log added (`ARCHITECTURE.md` §16) | grep for stale terms |

**Design points checked and kept**
- CSRF check allows requests carrying neither `Origin` nor `Sec-Fetch-Site`: these come from non-browser clients, which can't ride a victim's cookies. Documented in `ARCHITECTURE.md` §5.
- `style-src-attr 'unsafe-inline'` is allowed for UI primitives' positioning; attribute styles can't execute script. `<style>` elements still need the nonce.
- `getConfig()` is lazy so builds don't need runtime secrets; `APP_ENV` is still read at build time for HSTS (documented).
- Integration harness refuses databases not ending in `_test`.

**Remaining concerns**
- E2E (real-browser CSP behavior) and both CI workflows have not executed anywhere yet.
- `docker-compose.yml` is untested in this environment.
- `unstable_doesMiddlewareMatch` is an experimental Next.js API; the docs call it `unstable_doesProxyMatch`, which doesn't exist in 16.4.0.

---

## 2026-10-11 · Phase 3 (database, authentication, access control) · Automated self-review

**Scope:** all code on `feature/auth-persistence` (`0c1008e` schema and migrations, `1acb9ac` auth, `20d2801` profile/locations/audit API, `cd715b6` account UI, seeds, admin CLI, `a13b6b0` sign-up flood fix) plus the docs commit. Reviewed by re-reading every changed file against `THREAT_MODEL.md`, by mutation checks (§ below), and by the E2E suite in a real browser. **No human review has occurred yet.**

| # | Area | Finding | Severity | Correction | Verification |
|---|---|---|---|---|---|
| 1 | Security / test validity | Better Auth switches its origin and CSRF checks **off** when `NODE_ENV=test`, so the suite was testing weaker behavior than production; off-site `callbackURL`s were accepted (302/200 instead of 403) | High | `disableOriginCheck: false` and `disableCSRFCheck: false` pinned explicitly | Open-redirect and login-CSRF integration tests now pass and fail correctly |
| 2 | Security | Password policy accepted passwords made of the user's own name (`alex-rivera-2026`, `Alex.Rivera.07`): zxcvbn scored them ≥ 3 because it didn't know the name | Medium | Name/email words passed to zxcvbn as user inputs, plus a word-break check that refuses passwords made only of personal words and digits/symbols | Unit tests for both shapes; integration sign-up test |
| 3 | Test validity | Audit pagination test used millisecond-spaced timestamps, so it couldn't catch a cursor that dropped microseconds (rows sharing a millisecond skipped) | Medium | Test inserts rows sharing a millisecond; cursor carries Postgres's microsecond timestamp | Mutation: millisecond cursor → test fails; restored → passes |
| 4 | HTTP semantics | Root `loading.tsx` made every page stream, so `/admin` answered **200** to students (instead of 404) and protected pages couldn't send a real 307 | Medium | Removed root `loading.tsx`; loading states go inside pages | E2E asserts the 404 status; documented in `ARCHITECTURE.md` §11, §16 |
| 5 | Own lint rule | A seed used `sql.raw()`, which our own lint rule bans | Medium | Replaced with plain values and `eq()`; no raw SQL anywhere in Phase 3 code | `pnpm lint`; grep |
| 6 | Correctness | Config errors said "is required" for variables that were set but invalid when the field had a default | Low | Message chosen from the issue type and whether the variable was present | Unit test |
| 7 | Accessibility | Password reveal button had an empty accessible name in jsdom (text split across a child span); Chromium computed the header profile link as "Alex : your account" | Low | Explicit `aria-label`s ("Show password"/"Hide password", "Alex: your account") | Component test and E2E query by role and name |
| 8 | Test hygiene | A test helper swallowed an error with `.catch(() => undefined)` (silent suppression, which the master prompt forbids) | Low | Removed; the operation's failure now fails the test | Suite passes without it |
| 9 | Security | **Email flooding:** sign-up for an existing address emails its owner a notice, and sign-up had only a per-IP limit, so a distributed attacker could flood one inbox | Medium | Per-email sign-up limit (5/hour) alongside the per-IP one (`THREAT_MODEL.md` T-33) | Integration test: cap holds across rotating IPs; unit test of the rule table |
| 10 | Layout | Mobile header wrapped onto two lines at 360 px; "(confirmed)" broke mid-word on the profile page | Low | "Create account" hidden below `sm` (sign-in stays); `whitespace-nowrap` on the badge | Screenshots at mobile and desktop widths |
| 11 | Test correctness | `"Spring2027!!"` was listed as a password the policy must refuse, but zxcvbn genuinely scores it 3 | Low | Replaced with `"Spring2027!"`, which scores below 3. The policy wasn't weakened; the example was wrong | Unit test |
| 12 | Test support | Email-link helper prefixed `/api/auth` twice; Vitest component project loaded the React plugin twice | Low | Helper accepts full paths; duplicate plugin removed | Suite output clean |
| 13 | Test coverage | `/change-password` is enabled (Better Auth) but nothing tested that it needs a session and the current password, applies our password policy, or is rate-limited; found from the uncovered-lines report during clean-clone verification | Medium | Integration test for the endpoint; unit test for its rate rule | Mutation: policy hook removed for `/change-password` → test fails; restored → passes |
| 14 | Docs | Phase 1 docs claimed single-use verification links (they're signed JWTs, reusable within 24 h) and sliding sessions (now fixed 7-day); several docs cited the wrong requirement for user suspension | Low | `THREAT_MODEL.md` T-17, PRD AUTH-3, `ARCHITECTURE.md` §8 corrected; ADM-3 cited | Re-read against code |

**Design points checked and kept**
- Verification links can be reopened within 24 h: they only re-confirm the same address and never create a session (T-17, T-34). Making them single-use would need a custom token store for no security gain.
- Per-IP limits trust the first `X-Forwarded-For` entry. Correct behind Vercel, which overwrites it; per-email limits don't depend on it. Documented in `client-ip.ts` and T-14; confirm at deployment.
- The admin **API** answers `403` to non-admins while admin **pages** answer `404`. The API's callers already know the endpoint exists; the pages shouldn't advertise it.
- Better Auth's `/update-user` is disabled, so every profile change goes through `PATCH /api/v1/me` with our strict schema.
- `order_status_events` cascades on order delete even though the app role can't delete events directly: Postgres runs referential actions as the table owner. Needed for demo reset (Phase 6); tested.

**Remaining concerns**
- The `Secure` cookie flag is only set over https, which no test environment uses; confirm on the first deployment.
- Response-time differences between existing and new emails aren't measured (T-15, residual risk in `THREAT_MODEL.md` §6).
- Phase 3 CI hasn't run on GitHub yet; it runs when `feature/auth-persistence` is pushed.
- Suspension doesn't delete sessions until the Phase 6 admin endpoint exists (it's enforced on every request meanwhile).
- Better Auth 1.7.7 is recent; behavior we rely on (origin checks, `disabledPaths`, enumeration-safe answers, cookie attributes) is pinned by integration tests, so an upgrade that changes it will fail CI rather than slip through.

---

## 2026-10-11 · D2 follow-up (real restaurant names) · Automated self-review

**Scope:** `chore/real-restaurant-names`: seed data, seed retirement logic, tests, docs. **No human review has occurred yet.**

| # | Area | Finding | Severity | Correction | Verification |
|---|---|---|---|---|---|
| 1 | Data migration | Changing the data file alone would leave the old fictional restaurants live in any database already seeded (the seed only upserted) | Medium | Seed soft-deletes sample restaurants missing from the data file and removes unused cuisines; admin-added restaurants untouched | Integration test (mutation-checked); real run on the dev database retired all six old restaurants |
| 2 | Accuracy | Venue names come from UH pages that change; a 2024 article listed "The Nook Café", which UH now lists as Katz Coffee | Low | Only venues on UH's current listings were used; header comment and docs say to re-check before a demo | Sources noted in `catalog-data.ts` |
| 3 | Affiliation | Real brand names next to invented menus | Low | Generic item names, no logos, `is_sample_data` on every row; "Sample menu — not affiliated" label required in Phase 4 restaurant UI (T-32) | Phase 4 component tests will assert the label |

---

## 2026-10-11 · Phase 4 (customer ordering) · Automated self-review

**Scope:** all code on `feature/customer-ordering`: domain rules, catalog/cart/checkout/order services and routes, payment port, customer pages and components, tests, docs. Reviewed against `THREAT_MODEL.md`, with mutation checks (`TESTING.md` §4) and the E2E journey in a real browser at phone and desktop widths. **No human review has occurred yet.**

| # | Area | Finding | Severity | Correction | Verification |
|---|---|---|---|---|---|
| 1 | Correctness | Order history showed `itemCount: 0` for every order: a correlated subquery's unqualified `id` bound to `order_items.id` instead of `orders.id` | Medium | Counts now come from one grouped query by order ID | Integration test caught it; passes now |
| 2 | Test validity | The cancel-vs-confirm race test relied on timing: with compare-and-set removed it failed only some runs | Medium | Test holds a row lock so both writers read `PLACED` before either writes; deterministic | Mutation: CAS removed → fails 3/3 runs; restored → passes 3/3 |
| 3 | Layout (Phase 3 regression) | The header's "Create account" button still showed on phones: the button's `inline-flex` class overrode `hidden`. Phase 3's log said this was fixed; it wasn't | Low | A wrapper element does the hiding | Phone screenshot; `isVisible()` false at 390 px |
| 4 | Process | This branch began with uncommitted work from an earlier turn (shared ordering types, cart service, helpers). A new catalog service was first written without noticing it, overwriting the earlier draft and duplicating the shared types | Medium | Reconciled onto the earlier `ordering.ts` types; duplicate file deleted; catalog service rewritten to match; everything re-tested | Typecheck, full suite |
| 5 | E2E | Global setup's single-statement delete-then-insert (data-modifying CTE) failed on re-runs: both parts see the same snapshot | Low | Two statements in a transaction | E2E re-run twice, 24/24, no retries |
| 6 | E2E | The T-01 browser test navigated to checkout before the add-to-cart request finished (flaky on mobile) | Low | Waits for the "Added" status first | 2 consecutive runs without retries |
| 7 | Error handling | Orders page fell back to page one on **any** error from a bad cursor (`.catch(() => …)`), which would hide database failures | Medium | Falls back only on `VALIDATION_ERROR` for a supplied cursor; everything else throws | Code review |
| 8 | Consistency | Voiding the simulated payment happened inside the transaction; a rollback after it would have left a voided payment for a live order with a real processor | Low | The gateway is called after commit | Code review; cancel tests |
| 9 | React | The checkout quote effect set state synchronously (lint error) and could let a slow, older quote overwrite a newer one | Low | Effect only fetches; responses from superseded requests are ignored | Lint; component tests |
| 10 | Accessibility | The note field's character counter was `aria-live`, which would announce on every keystroke | Low | Counter referenced by `aria-describedby` instead | Code review |
| 12 | Dead code | `isActive()` in the state-machine module was never used (history filters by terminal statuses in SQL); the domain folder's 100% function-coverage gate failed in clean-clone verification | Low | Removed | `pnpm verify` on a fresh clone |
| 11 | Test coupling | Ordering tests hit the real 10/minute order limit and failed for that reason only | Low | Ordering tests reset rate-limit counters between tests (limits have their own tests) | Suite passes; the 429s confirmed the limit works |

**Design points checked and kept**
- Adding to a closed restaurant's cart is allowed by the API (the cart then reports `RESTAURANT_CLOSED`); the UI doesn't offer it. Planning an order before opening is legitimate.
- An Idempotency-Key from a failed attempt can be reused with a different body, because failed attempts store nothing. Only a key that produced an order is bound to its body.
- `transitionOrder` refuses courier moves with an explicit error until assignments exist, instead of applying the status change without its side effects.

**Remaining concerns**
- Orders can't progress past `PLACED` through the UI until the Kitchen Console (Phase 6) and couriers (Phase 5) exist.
- Restaurant hours are sample data; open/closed is only as right as the data.
- Phase 4 CI hasn't run on GitHub yet.
