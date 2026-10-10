# CoogCrave

**Cravings Delivered. By Coogs, For Coogs.**

CoogCrave is a student-powered food delivery platform for the University of Houston main campus: students order from campus dining spots, and other students deliver to campus buildings between classes. It is being built for a UH hackathon to the standards of a maintainable commercial app.

> CoogCrave is an independent student project. It is not affiliated with or endorsed by the University of Houston or any restaurant shown. Payments are simulated; no real money moves.

## Status

| Phase | State |
|---|---|
| 1. Architecture and planning | Complete ([docs](docs/)) |
| 2. Project foundation | **In review**: app shell, tooling, CI, request pipeline, security headers |
| 3–8. Auth, ordering, delivery, admin, polish, release | Not started |

Ordering, accounts, and courier features do not exist yet; the landing page says so. Progress is tracked in [docs/PROGRESS.md](docs/PROGRESS.md).

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 6 (strict) · PostgreSQL 16 · Drizzle ORM · Zod 4 · Tailwind CSS 4 · pino · Vitest 5 · Playwright · GitHub Actions. Reasons and tradeoffs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Prerequisites

- **Node.js 22.12+** (`.nvmrc` pins 22.22.0)
- **pnpm 10**: `corepack enable` picks up the version pinned in `package.json`
- **PostgreSQL 16**, either:
  - Docker: `docker compose up -d db`, or
  - a local install, started with `pnpm db:local:up` (uses the Postgres binaries on your machine; data goes in `.data/`)

## Setup

```bash
git clone <repo-url> coogcrave && cd coogcrave
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env                 # local-only placeholder values; edit if your Postgres differs
docker compose up -d db              # or: pnpm db:local:up
pnpm db:migrate                      # applies db/migrations as the migrator role
pnpm dev                             # http://localhost:3000
```

Both Postgres options create two databases (`coogcrave_dev`, `coogcrave_test`) and two roles:

| Role | Used by | Can |
|---|---|---|
| `coogcrave_migrator` | `pnpm db:migrate` | Own and change the schema |
| `coogcrave_app` | The running app and tests | Read/write rows only, never change the schema |

### Environment variables

All variables are documented in [`.env.example`](.env.example). The app validates them at startup and lists any that are missing or malformed (without printing their values). `.env` files are git-ignored, and CI fails if one is committed.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` | ESLint, including accessibility, security, and layering rules |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm typecheck` | Generate Next.js route types, then `tsc --noEmit` |
| `pnpm test` | Unit, component, and integration tests (integration needs Postgres) |
| `pnpm test:unit` · `test:component` · `test:integration` | One test project at a time |
| `pnpm test:coverage` | All tests with the 80% coverage gate |
| `pnpm test:e2e` | Playwright against a running production build (`pnpm build` first; `pnpm exec playwright install chromium` once) |
| `pnpm db:generate` | Generate a SQL migration from schema changes in `src/server/db/schema` |
| `pnpm db:migrate` | Apply migrations (uses `MIGRATOR_DATABASE_URL`) |
| `pnpm db:drift` | Fail if the schema has changes with no committed migration |
| `pnpm db:local:up` / `db:local:down` | Start/stop a project-local Postgres without Docker |
| `pnpm verify` | Everything CI's quality and test jobs run, in order |

Seed data and demo accounts arrive in Phase 3 (`pnpm db:seed`, `pnpm db:seed:demo`).

## Project layout

```
src/app/            routes only: pages, layouts, API route handlers
src/components/     UI components (no server imports, enforced by lint)
src/server/         server-only code: config, logger, HTTP pipeline, database, security headers
src/proxy.ts        per-request CSP nonce
db/migrations/      generated SQL migrations (committed)
tests/              unit/, component/, integration/, e2e/
docs/               requirements, architecture, API, database, threat model, plans, progress
```

## Documentation

[Product requirements](docs/PRODUCT_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Database design](docs/DATABASE_DESIGN.md) · [API spec](docs/API_SPEC.md) · [Threat model](docs/THREAT_MODEL.md) · [Development plan](docs/DEVELOPMENT_PLAN.md) · [Testing](docs/TESTING.md) · [Progress](docs/PROGRESS.md) · [Code review log](docs/CODE_REVIEW_LOG.md)

## Known limitations (current)

- No user-facing features yet: accounts, restaurants, ordering, and delivery start in Phase 3.
- No deployment target configured; the app runs locally and in CI only.
- All payments, restaurant actions, and courier earnings will be simulations, labeled as such in the UI.
