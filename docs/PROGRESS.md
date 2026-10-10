# CoogCrave — Progress

**Current phase:** 2 — Project Foundation · **Status:** `IN REVIEW` (awaiting Phase 2 checkpoint approval)
**Branch:** `feature/foundation` · **Last updated:** 2026-10-10

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
| 2 — Project foundation | `IN REVIEW` |
| 3–8 | `NOT STARTED` |

## Blockers

- **No GitHub remote** (no account linked to this workspace). CI can't run until one exists.
- **Build sandbox egress policy** denies `cdn.playwright.dev` (Playwright browsers), `binaries.prisma.sh`, and Google Fonts. Not worked around. Prisma and fonts were designed out; E2E runs in CI only.
- **Hosting and email credentials** (Phase 8 only).

## Defects

None open.

## Major technical decisions

See `ARCHITECTURE.md` §16. Phase 2 changes: Prisma → Drizzle (approved), ESLint 10, Cache Components off for nonce CSP, self-hosted fonts, `MIGRATOR_DATABASE_URL` naming.
