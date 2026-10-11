# CoogCrave

**Cravings Delivered. By Coogs, For Coogs.**

CoogCrave is a student-powered food delivery platform for the University of Houston main campus: students order from campus dining spots, and other students deliver to campus buildings between classes. It is being built for a UH hackathon to the standards of a maintainable commercial app.

> CoogCrave is an independent student project. It is not affiliated with or endorsed by the University of Houston or any restaurant shown. Payments are simulated; no real money moves.

## Status

| Phase | State |
|---|---|
| 1. Architecture and planning | Complete ([docs](docs/)) |
| 2. Project foundation | Complete (merged in PR #1) |
| 3. Database, accounts, and access control | **In review**: full schema and migrations, UH-email sign-up with verification, sign-in/out, password reset, profile, role-based access, admin activity log, seed data |
| 4–8. Ordering, delivery, admin tools, polish, release | Not started |

Students can create an account, confirm their email, sign in, reset a forgotten password, and set their name and usual drop-off building. Restaurants, ordering, and courier features don't exist yet; the landing page says so. Progress is tracked in [docs/PROGRESS.md](docs/PROGRESS.md).

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
pnpm db:seed                         # UH campus, drop-off buildings, sample restaurants and menus
pnpm db:seed:demo                    # optional: demo accounts (see below)
pnpm dev                             # http://localhost:3000
```

**Emails stay on your machine.** Locally, verification and password-reset emails are written as JSON files to `.data/mail/` instead of being sent. Open the newest file and copy the link from its `text` field. Sign-up only accepts `uh.edu` addresses (and subdomains such as `cougarnet.uh.edu`) by default; set `ALLOWED_EMAIL_DOMAINS` in `.env` to test with other domains.

### Demo accounts

`pnpm db:seed:demo` creates four confirmed accounts, all using the password in `SEED_DEMO_PASSWORD` from your `.env`:

| Email | What it is |
|---|---|
| `customer@demo.coogcrave.test` | Student |
| `courier@demo.coogcrave.test` | Student with an approved courier profile |
| `applicant@demo.coogcrave.test` | Student whose courier application is pending |
| `admin@demo.coogcrave.test` | Admin (sees the activity log at `/admin`) |

`.test` is a reserved domain, so these addresses can never receive real email. The demo seed refuses to run when `APP_ENV=production`. Re-running it resets their passwords.

### Creating a real admin

```bash
pnpm admin:create --email someone@uh.edu --name "Their Name"
```

It prompts for a password with hidden input (or reads `ADMIN_PASSWORD`), creates a confirmed admin account or promotes an existing one, and records the action in the activity log. This is the only way to make an admin; no web page or API can.

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
| `pnpm test:e2e` | Playwright against a production build. Needs `pnpm build`, `pnpm db:seed && pnpm db:seed:demo` on the dev database, and Chromium (`pnpm exec playwright install chromium` once, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed one) |
| `pnpm db:generate` | Generate a SQL migration from schema changes in `src/server/db/schema` |
| `pnpm db:migrate` | Apply migrations (uses `MIGRATOR_DATABASE_URL`) |
| `pnpm db:drift` | Fail if the schema has changes with no committed migration |
| `pnpm db:seed` | Load the campus, drop-off buildings, and sample restaurants (safe to re-run) |
| `pnpm db:seed:demo` | Create or reset the demo accounts (refuses in production) |
| `pnpm admin:create --email … --name …` | Create or promote an admin (audited) |
| `pnpm db:local:up` / `db:local:down` | Start/stop a project-local Postgres without Docker |
| `pnpm verify` | Everything CI's quality and test jobs run, in order |

## Project layout

```
src/app/            routes only: pages, layouts, API route handlers
src/components/     UI components (no server imports, enforced by lint)
src/server/         server-only code: config, auth, HTTP pipeline, domain rules, services, database, mail, seeds
src/shared/         validation schemas and types used by both browser and server
src/proxy.ts        per-request CSP nonce; sends signed-out visitors to sign-in
db/migrations/      SQL migrations (committed)
scripts/            local Postgres, seed and admin CLIs, CI checks
tests/              unit/, component/, integration/, e2e/
docs/               requirements, architecture, API, database, threat model, plans, progress
```

## Documentation

[Product requirements](docs/PRODUCT_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Database design](docs/DATABASE_DESIGN.md) · [API spec](docs/API_SPEC.md) · [Threat model](docs/THREAT_MODEL.md) · [Development plan](docs/DEVELOPMENT_PLAN.md) · [Testing](docs/TESTING.md) · [Progress](docs/PROGRESS.md) · [Code review log](docs/CODE_REVIEW_LOG.md)

## Known limitations (current)

- Accounts only: restaurants, ordering, and delivery start in Phase 4. Restaurant names and menus in the seed data are fictional samples.
- Emails go to a local folder; no email provider is connected, and deployed environments refuse to start until one is (Phase 8).
- No admin screens beyond the activity log yet (suspending users, approving couriers, and editing menus arrive in Phase 6).
- No deployment target configured; the app runs locally and in CI only.
- All payments, restaurant actions, and courier earnings will be simulations, labeled as such in the UI.
