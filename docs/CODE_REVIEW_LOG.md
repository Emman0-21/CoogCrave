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
