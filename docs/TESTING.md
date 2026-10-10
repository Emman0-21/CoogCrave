# CoogCrave — Testing

> **Last updated:** 2026-10-10 (Phase 2). Describes what exists now; each phase adds to it.

## 1. Test layers

| Project | Location | Environment | Database | Command |
|---|---|---|---|---|
| Unit | `tests/unit/**/*.test.ts` | Node | None: pure logic, dependencies injected | `pnpm test:unit` |
| Component | `tests/component/**/*.test.tsx` | jsdom + React Testing Library | None | `pnpm test:component` |
| Integration | `tests/integration/**/*.test.ts` | Node | **Real Postgres** (`coogcrave_test`), connected as the app role | `pnpm test:integration` |
| E2E | `tests/e2e/**/*.spec.ts` | Playwright: Pixel 7 + Desktop Chrome profiles | `coogcrave_dev` behind a production build | `pnpm test:e2e` |

`pnpm test` runs the first three; `pnpm test:coverage` runs them with the coverage gate.

### Why integration tests use a real database

Most of CoogCrave's correctness guarantees live in Postgres: CHECK constraints on totals, partial unique indexes that stop two couriers winning one order, and role grants that keep the app from changing the schema. Mocked databases can't fail in those ways, so they can't prove those guarantees. Mocks are used only at true external boundaries (email, payments).

## 2. Integration test harness

- `tests/integration/global-setup.ts` applies committed migrations once per run, as the migrator role.
- `tests/support/integration-env.ts` points the app's `DATABASE_URL` at the test database **as the app role**, so every test exercises production grants.
- `tests/support/db.ts` provides `openPool(role)` for direct assertions and `resetDatabase()` (truncates all tables as the migrator).
- Files run one at a time (`fileParallelism: false`) because they share one database. Tests inside a file may run concurrent requests (the courier race test in Phase 5 depends on this).
- **Guardrail:** the harness refuses any database whose name doesn't end in `_test`, so a misconfigured `.env` can't wipe development data.

## 3. Coverage

- Provider: V8. Scope: `src/server/**` and `src/proxy.ts`.
- Gate: 80% lines, branches, functions, and statements (CI fails below). Per-folder gates for `src/server/domain` and `src/server/services` are added when those folders exist (Phase 3+).
- Coverage is a floor, not proof. Every state transition, authorization boundary, and user journey also gets an explicit test, whatever the percentage says.

## 4. What the Phase 2 tests cover

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

## 5. Running locally

```bash
docker compose up -d db        # or: pnpm db:local:up
cp .env.example .env           # once
pnpm test                      # unit + component + integration
pnpm build && pnpm exec playwright install chromium && pnpm test:e2e
```

## 6. CI

`.github/workflows/ci.yml` runs on every pull request and push to `main`: locked install, tracked-env check, format, lint, typecheck, audit, migration drift check, migrations against a fresh Postgres 16, unit + component, integration, coverage gate, and a production build. `.github/workflows/e2e.yml` builds the app and runs Playwright. No step suppresses failures (`|| true` and `continue-on-error` aren't used).

## 7. Writing new tests

- Business rules go in `src/server/domain` as pure functions, unit-tested exhaustively (e.g. every from × to × actor combination for the order state machine).
- Services and routes are integration-tested through the real route handler (`GET(new Request(...))`), against the real database.
- Name tests after the behavior or rule they protect, and reference the requirement or threat ID when there is one.
- Never mark a feature complete while any of its tests fail (Definition of Done).
