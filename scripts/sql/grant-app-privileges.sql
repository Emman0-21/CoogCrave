-- Per-database grants for the app role. Included by bootstrap-roles.sql.
-- Tables created later by coogcrave_migrator automatically grant DML (not DDL) to coogcrave_app.
-- Table-specific restrictions (e.g. append-only audit_events) are applied in migrations.

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO coogcrave_migrator;
GRANT USAGE ON SCHEMA public TO coogcrave_app;
GRANT CONNECT ON DATABASE :"DBNAME" TO coogcrave_app;

ALTER DEFAULT PRIVILEGES FOR ROLE coogcrave_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coogcrave_app;
ALTER DEFAULT PRIVILEGES FOR ROLE coogcrave_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO coogcrave_app;
