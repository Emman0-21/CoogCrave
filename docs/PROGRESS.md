# CoogCrave — Progress

**Current phase:** 3 — Authentication & persistence · **Status:** `COMPLETE` (approved at the checkpoint; CI green). D2 follow-up in review on `chore/real-restaurant-names`
**Branch:** `feature/auth-persistence` (9 commits on top of `main` at `7f43939`, including a small Phase 2 follow-up fix) · **Last updated:** 2026-10-11

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
| 4–8 | `NOT STARTED` |

## Blockers

- **Pushing from this workspace:** no GitHub push access here; branches are pushed from your machine.
- **Build sandbox egress policy** denies `cdn.playwright.dev`, `binaries.prisma.sh`, and Google Fonts. Not worked around: E2E uses the Chromium already installed in the workspace (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`); Prisma and web fonts were designed out.
- **Hosting and email credentials** (Phase 8 only).

## Defects

None open.

## Major technical decisions

See `ARCHITECTURE.md` §16. Phase 2 changes: Prisma → Drizzle (approved), ESLint 10, Cache Components off for nonce CSP, self-hosted fonts, `MIGRATOR_DATABASE_URL` naming. Phase 3 changes: UUIDs for auth tables, our Postgres rate limiter instead of Better Auth's, fixed 7-day sessions, zxcvbn password policy, origin checks pinned on, root `loading.tsx` removed, `tsx --conditions=react-server` for scripts, file-only mail transport, and **fictional restaurant names (D2 change, needs your decision)**.
