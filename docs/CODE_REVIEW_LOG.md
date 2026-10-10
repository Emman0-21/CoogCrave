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
