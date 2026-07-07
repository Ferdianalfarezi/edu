-- =============================================================================
-- Database Role Setup for Multi-Tenant RLS (per ADR-001)
-- =============================================================================
-- Run this script as a PostgreSQL superuser (e.g., postgres) to bootstrap
-- the two roles needed for the application:
--
-- 1. edu_migration: Superuser-like role for running migrations.
--    Bypasses RLS so it can CREATE/ALTER tables and policies.
--
-- 2. edu_app: Application role used at runtime.
--    Has RLS enforced — all queries are filtered by tenant_id session variable.
-- =============================================================================

-- Create the migration role (bypasses RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'edu_migration') THEN
    CREATE ROLE edu_migration WITH LOGIN PASSWORD 'change_me_migration';
  END IF;
END
$$;

-- Grant superuser-equivalent privileges for DDL operations
ALTER ROLE edu_migration CREATEROLE CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE edu_dev TO edu_migration;

-- The migration role bypasses RLS by default (BYPASSRLS attribute)
ALTER ROLE edu_migration BYPASSRLS;

-- Create the application role (RLS enforced)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'edu_app') THEN
    CREATE ROLE edu_app WITH LOGIN PASSWORD 'change_me_app';
  END IF;
END
$$;

-- The app role does NOT bypass RLS (default, but explicit for clarity)
ALTER ROLE edu_app NOBYPASSRLS;

-- Grant schema usage and table access to app role
-- (Run after migrations have created the tables)
GRANT USAGE ON SCHEMA public TO edu_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO edu_app;

-- Ensure future tables created by edu_migration are also accessible by edu_app
ALTER DEFAULT PRIVILEGES FOR ROLE edu_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edu_app;
ALTER DEFAULT PRIVILEGES FOR ROLE edu_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO edu_app;
