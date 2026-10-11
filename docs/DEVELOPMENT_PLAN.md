# CoogCrave — Development Plan

> **Status:** Approved at Phase 1 (defaults applied to D3–D7; D2 decided at Phase 3); Phases 2 and 3 complete; Phase 4 in review · **Last updated:** 2026-10-11
> Requirement IDs (AUTH-, CAT-, CART-, ORD-, DLV-, TRK-, NTF-, REV-, ADM-, NFR-) refer to `PRODUCT_REQUIREMENTS.md`; threat IDs (T-xx) to `THREAT_MODEL.md`.

---

## 1. Approach

1. **Foundation first, then vertical slices.** Phase 2 makes `install → lint → typecheck → test → build` green on an empty shell, so every later feature lands into working CI.
2. **Demo path before breadth.** Within each phase, the "M" requirements on the 11-step demo path are built and tested before "S"/"C" items. If time runs out, the demo still works end to end.
3. **Domain logic is written test-first.** Pricing, the state machine, and policies are pure functions — the cheapest place in the codebase to be thorough.
4. **Every phase ends at a checkpoint** with a report (what changed, commands run, real test results, risks) and a pause for review where marked.

---

## 2. Decisions needed at this checkpoint

Defaults are what the plan assumes if there's no answer.

| # | Decision | Default | Impact if changed |
|---|---|---|---|
| D1 | Approve the stack (Next.js + Postgres + Better Auth) **or** switch to a Spring Boot API + Next.js frontend | **Approved: Next.js monolith.** ORM changed from Prisma to Drizzle during Phase 2, with approval (`ARCHITECTURE.md` §16) | — |
| D2 | Real UH venue names vs fictional (Q1) | **Decided at the Phase 3 checkpoint: real UH venue names** (Student Center South and RAD Center), sample menus/prices/hours, no logos, "Sample menu — not affiliated" labels | Data lives in `src/server/seed/catalog-data.ts`; re-check names before a demo |
| D3 | UH-only sign-up domains (Q2) | `uh.edu` and its subdomains (covers `cougarnet.uh.edu`) | — |
| D4 | Demo shows Kitchen Console live vs auto-advance (Q3) | Kitchen Console live; auto-advance available for rehearsal | — |
| D5 | Hackathon deadline, team size, who builds what (Q4) | Unknown | Drives the scope-cut ladder (§6) |
| D6 | Hosting + email accounts (Q5) | Local-only until provided | Phase 8 deployment blocked without them |
| D7 | Collaboration mode: should some modules be written by you first (e.g., pricing or the state machine) with Claude reviewing, rather than Claude implementing everything? | Claude implements, you review at checkpoints | Hand-written modules get a spec + failing tests from Claude first, then review |

---

## 3. Phase roadmap

Effort is a rough range of focused hours for one developer working with Claude; it will be recalibrated after Phase 2.

| Phase | Goal | Effort | Checkpoint (pause for review) |
|---|---|---|---|
| 1 | Discovery & architecture | done | **This review** |
| 2 | Project foundation | 3–5 h | Clean install, format, lint, typecheck, test, build all pass locally and in CI |
| 3 | Auth & persistence | 6–9 h | Migrations apply; auth flows, protected routes, role-access tests pass |
| 4 | Customer experience | 8–12 h | Customer journey J1 (up to `PLACED`) passes E2E |
| 5 | Courier experience | 6–9 h | Concurrency test + courier journey J2 pass |
| 6 | Admin, notifications, reviews | 6–9 h | Role isolation + admin journey J3 pass; full demo J4 runs |
| 7 | UI refinement & reliability | 4–7 h | Accessibility, performance, and usability review recorded |
| 8 | Final validation & deployment | 3–6 h | Release-readiness report |

### Phase 2 — Project foundation
**Tasks**
- Scaffold Next.js 16.4 (App Router, `src/`), TypeScript 6.0.3 strict, exact version pins, `engines` (Node ≥ 22.12), `packageManager` (pnpm 10).
- ESLint (typescript-eslint, Next rules, import-boundary rules from `ARCHITECTURE.md` §4, bans on `dangerouslySetInnerHTML` and `sql.raw()`), Prettier.
- Vitest (unit + integration projects, v8 coverage with thresholds on `server/domain` and `server/services`), React Testing Library, Playwright config.
- Drizzle ORM + drizzle-kit (`drizzle.config.ts`, empty migrations journal); `docker-compose.yml` for Postgres 16; scripts to create migrator/app roles locally and without Docker.
- `server/config.ts` (Zod env parsing), `logger.ts` (pino + redaction), `http/withRoute` (request ID, size limit, JSON + Origin checks, error envelope), security headers.
- Design tokens (`@theme`), base layout, landing page shell with disclaimer, `/api/health`.
- GitHub Actions: format, lint, typecheck, unit, integration (Postgres service), build, `pnpm audit`, migration drift check; separate E2E job.
- `.env.example`, `.gitignore`, `README.md` (setup), `docs/TESTING.md`, `.github/pull_request_template.md`.
- Tests: logger redaction (T-27), error mapper (T-31), Origin/415/413 checks (T-20, T-24), security headers (T-25), config validation.

**Exit criteria:** `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` all exit 0 from a clean clone; CI workflow file validated (runs once a GitHub remote exists).

### Phase 3 — Authentication & persistence
**Tasks:** full schema + raw-SQL constraints/partial indexes; DB roles & grants; Better Auth (email/password, verification, reset, domain allowlist, `input: false` fields, rate limits); `FileOutboxMailer`; `getActor()` + guards + policies; sign-in/up/verify/reset pages; profile (`/me`); seed + demo seed; `pnpm admin:create`.
**Requirements:** AUTH-1…8, ADM-9 (audit plumbing).
**Tests:** T-02, T-12, T-14 – T-19, T-28; migrations apply on empty DB; seed idempotency.
**Exit criteria:** auth E2E (register → verify via outbox → sign in → sign out); role-access matrix passes for existing endpoints.
**Status:** `COMPLETE` (approved at the checkpoint; merged from `feature/auth-persistence`). D2 follow-up on `chore/real-restaurant-names`. All tasks done except the admin suspend endpoint (AUTH-7's "sessions revoked" half), which moves to Phase 6 with the other admin user tools; suspension itself is enforced on every request and at sign-in. Report: `PROGRESS.md`.

### Phase 4 — Customer experience
**Tasks:** restaurant list/search/filter, detail + menu, open-hours logic; server cart; option validation; pricing module; quote; order placement (idempotent, snapshots, simulated payment); confirmation; order detail with projections; tracking timeline + polling; order history; customer cancel.
**Requirements:** CAT-1…6, CART-1…4, ORD-1…9, TRK-1…3.
**Tests:** pricing and hours (U, exhaustive edge cases incl. rounding, midnight-crossing hours); T-01, T-04, T-08, T-10, T-11; empty cart, unavailable item, closed restaurant, tampered total.
**Exit criteria:** J1 E2E up to `PLACED`; checkpoint review.
**Status:** `DONE` (PR #4, merged). Demo auto-advance (`DEMO_AUTO_ADVANCE`) moved to Phase 6.

### Phase 5 — Courier experience
**Tasks:** courier application; availability; offers query + projection; decline; transitions T5, T7, T8, T10, T11; active delivery screen; history; simulated earnings.
**Requirements:** DLV-1…11.
**Tests:** state machine exhaustive table (U); T-05, T-06, T-09 (concurrency: N parallel accepts), courier double-accept across two offers.
**Exit criteria:** J2 E2E; concurrency test green 20 consecutive runs (flakiness check).
**Scope change (approved at the start of Phase 5):** a basic Kitchen Console (admin acts as `RESTAURANT_SIM` for T1, T3, T4) moved here from Phase 6, because J2 needs something to make orders ready.
**Status:** `DONE` (PR #5, merged).

### Phase 6 — Administration, notifications, reviews
**Tasks:** admin dashboard/metrics; users (suspend); courier decisions; restaurant/menu/hours/options CRUD; admin order list + detail (admin projection); admin resolutions (T2, T4, T6, T7, T9, T11); audit log viewer; notifications (write in transitions, list, mark read, unread badge); reviews; demo reset + optional auto-advance.
**Requirements:** ADM-1…10, NTF-1…2, REV-1…2.
**Tests:** T-03, T-07, T-12, T-13, T-29; admin mutations write audit rows.
**Exit criteria:** J3 and the full J4 demo E2E pass; draft `DEMO_GUIDE.md`.
**Split (decided at the start of Phase 6):**
- **6a** — courier decisions, users and suspension, admin order list and record, problem fixes (T2, T4, T6, T7, T9, T11 as ADMIN), activity log, dashboard, demo reset. **Status:** `DONE` (PR #6, merged). Exit: J3 core E2E (approve, cancel from the record, suspend). Demo auto-advance moved to 6b with the rest of the demo tooling.
- **6b** — notifications inbox and unread badge, reviews, restaurant and menu editing (essentials: accepting orders, sold out, prices), demo auto-advance, full J4, `DEMO_GUIDE.md`. **Status:** `IN REVIEW` on `feature/notifications-reviews`. All tasks done.

### Phase 7 — UI refinement & reliability
**Tasks:** consistent visual pass; skeleton/empty/error states everywhere; responsive check at 360/768/1280 px; keyboard + screen-reader pass; axe checks in Playwright; reduced motion; CSP tightened with nonces; query review (`EXPLAIN` on offers, history, admin lists); bundle analysis; PWA manifest.
**Requirements:** NFR-1…3, T-21, T-32.
**Exit criteria:** zero serious/critical axe violations on key screens; Lighthouse mobile ≥ 85 on landing/list; findings logged.

### Phase 8 — Final validation & deployment
**Tasks:** full suite; security review against `THREAT_MODEL.md` (every row Verified or explicitly residual); migration rehearsal on a fresh staging-like DB; production build; environment config; **deploy only with approval and credentials**; smoke test (`/api/health`, sign-in, demo flow); `DEPLOYMENT.md`, final `DEMO_GUIDE.md`, `README.md` limitations.
**Exit criteria:** release-readiness report listing passed checks, failed checks, open defects, deployment status.

---

## 4. Testing strategy (summary — full detail in `TESTING.md`, Phase 2)

| Layer | Tool | What | Database |
|---|---|---|---|
| Unit | Vitest | `server/domain`: pricing, rounding, state machine (every from × to × actor), policies, opening hours, option validation | None (pure functions) |
| Integration | Vitest | Services and route handlers (invoked with real `Request` objects and real sessions): authz matrix, order placement, idempotency, concurrency, audit, rate limits, headers | **Real Postgres** test DB, migrated once per run, tables truncated between tests, connecting as the **app role** so grant restrictions are exercised |
| Component | React Testing Library | Forms (validation messages, disabled states), cart line math display, status timeline | — |
| E2E | Playwright | J1 customer, J2 courier, J3 admin, J4 full demo (multiple browser contexts in one test), plus XSS-rendering and axe checks | Seeded DB, production build (`next build && next start`) |

**Concurrency test design:** create one `READY_FOR_PICKUP` order and N approved, online couriers; fire N accept requests with `Promise.all`; assert exactly one `200`, N−1 `409 OFFER_UNAVAILABLE`, one active assignment row, one `ASSIGNED` status event.

**Quality gates:** ≥ 80% line and branch coverage on `server/domain` and `server/services` (CI-enforced); every transition, authorization boundary, and journey has an explicit test regardless of coverage numbers. A feature isn't done while any of its tests fail (`PRODUCT_REQUIREMENTS` IDs listed in each PR).

---

## 5. CI and Git workflow

**CI (`.github/workflows/ci.yml`, on pull requests and pushes to `main`):**
1. `pnpm install --frozen-lockfile`
2. `pnpm format:check` · `pnpm lint` · `pnpm typecheck`
3. `pnpm test:unit` (with coverage thresholds)
4. `pnpm test:integration` against a Postgres 16 service container
5. `pnpm db:drift` (schema vs. committed migrations) and `pnpm db:migrate` on a fresh database
6. `pnpm build`
7. `pnpm audit --audit-level=high`; fail if any `.env` file is tracked

`e2e.yml` (separate job): build, migrate, seed, run Playwright, upload traces on failure. No step uses `|| true` or `continue-on-error`.

**Git:** protected `main` (PR + green CI required); short-lived branches `feature/…`, `fix/…`, `refactor/…`, `docs/…`; one coherent change per commit; Conventional Commit messages (`feat(orders): …`); PR template (summary, requirement IDs, tests run, security notes, screenshots, limitations, reviewer checklist). No force-pushing shared branches; no merge or deploy at human checkpoints without approval.

---

## 6. Scope-cut ladder (if the deadline is tight)

Cut from the top first. The bottom block is never cut because it's what makes the demo honest and the code credible.

1. DLV-11 courier stats · PWA manifest · Lighthouse tuning
2. CAT-2 search (keep cuisine filter)
3. ADM-3 user list/suspension · ADM-1 metrics (keep order list)
4. ADM-4/5 restaurant & menu CRUD UI (seed data covers the demo; keep availability toggle)
5. NTF-2 notification list UI (keep persisted notifications + badge)
6. REV-1/2 reviews
7. AUTH-5 password reset UI (keep verification)

**Never cut:** server-side pricing, authorization checks and their tests, the state machine, concurrency control and its test, idempotent order placement, simulation labels, CI.

---

## 7. Project risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deadline unknown (D5) | — | High | Ladder in §6; demo path built first in every phase |
| Very recent library versions (Next 16.4, Drizzle 0.45, Better Auth 1.7, TS 6) have API changes vs. tutorials | Medium | Medium | Exact pins; read the docs bundled with installed versions (Next.js ships its own in `node_modules/next/dist/docs`); first Phase 3 task proves Better Auth + Drizzle + Next together |
| Build sandbox egress policy blocks some hosts (`binaries.prisma.sh`, `cdn.playwright.dev`, Google Fonts) | Certain | Medium | Resolved for Prisma (→ Drizzle) and fonts (self-hosted). E2E browser tests run only in CI; anything that needs a blocked host is reported, not worked around |
| No Docker daemon in this sandbox | Certain | Low | Native Postgres here, service container in CI, compose file for teammates |
| No hosting/email credentials (D6) | Medium | Medium | Local file outbox; deployment documented as blocked until credentials exist |
| Concurrency test flakiness | Low | Medium | Deterministic setup; 20× repeat run at Phase 5 checkpoint |
| Trademark/affiliation concerns with real venue names (D2) | Low | Medium | Real names chosen deliberately; mitigated with "Sample menu — not affiliated" labels, no logos or brand marks, generic item names, footer and landing disclaimers. Switch to fictional names if any venue or UH objects (one data file) |

---

## 8. Next action after approval

After the Phase 6b checkpoint is approved and `feature/notifications-reviews` is merged: Phase 7 (UI refinement and reliability) on `feature/polish`, starting with the mobile header and an accessibility pass with axe.
