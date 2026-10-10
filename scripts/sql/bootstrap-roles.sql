-- Local/CI bootstrap: least-privilege roles and databases for CoogCrave.
-- Run as a Postgres superuser. Safe to re-run (idempotent).
--
--   coogcrave_migrator : owns the databases and schema; runs migrations (DDL).
--   coogcrave_app      : what the running app and tests use; DML only.
--
-- The passwords below are LOCAL DEVELOPMENT ONLY placeholders, matching .env.example.
-- Hosted environments create these roles with generated secrets (see docs/DEPLOYMENT.md).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coogcrave_migrator') THEN
    CREATE ROLE coogcrave_migrator LOGIN PASSWORD 'local_migrator_pw';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coogcrave_app') THEN
    CREATE ROLE coogcrave_app LOGIN PASSWORD 'local_app_pw';
  END IF;
END
$$;

SELECT 'CREATE DATABASE coogcrave_dev OWNER coogcrave_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'coogcrave_dev')\gexec

SELECT 'CREATE DATABASE coogcrave_test OWNER coogcrave_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'coogcrave_test')\gexec

\connect coogcrave_dev
\ir grant-app-privileges.sql

\connect coogcrave_test
\ir grant-app-privileges.sql
