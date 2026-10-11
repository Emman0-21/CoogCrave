-- Append-only history tables (docs/THREAT_MODEL.md T-12, T-28).
--
-- The app role (coogcrave_app) normally gets SELECT/INSERT/UPDATE/DELETE on every table through the
-- default privileges set in scripts/sql/grant-app-privileges.sql. For these two tables it keeps only
-- SELECT and INSERT, so even a bug or an injected query running as the app can't rewrite or erase them.
--
-- Requires the coogcrave_app role to exist (created by scripts/sql/bootstrap-roles.sql). Hosted
-- databases must create it before migrating; the migration fails loudly otherwise, by design.
--
-- order_status_events rows still disappear when their order is deleted (ON DELETE CASCADE): Postgres
-- runs referential actions as the table owner, so demo reset can delete demo orders as the app role.

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM coogcrave_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "order_status_events" FROM coogcrave_app;
