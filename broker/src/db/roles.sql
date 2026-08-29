-- broker/src/db/roles.sql
-- Audit Trail Hardening
-- Creates the restricted app role and the admin role.
-- It grants only SELECT and INSERT on the audit tables to gridnexus_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gridnexus_app') THEN
    CREATE ROLE gridnexus_app WITH LOGIN PASSWORD 'app_password';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gridnexus_admin') THEN
    CREATE ROLE gridnexus_admin WITH LOGIN PASSWORD 'admin_password';
  END IF;
END
$$;

-- Ensure schema usage
GRANT USAGE ON SCHEMA public TO gridnexus_app;
GRANT USAGE ON SCHEMA public TO gridnexus_admin;

-- Admin gets full privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gridnexus_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gridnexus_admin;

-- App gets full privileges on non-audit tables
GRANT SELECT, INSERT, UPDATE, DELETE ON 
  microgrids, 
  agents, 
  negotiations, 
  oraclesignals, 
  reasoning_deficits, 
  embedded_documents, 
  reconciliations, 
  integrity_snapshots 
TO gridnexus_app;

-- App gets ONLY SELECT and INSERT on audit tables
GRANT SELECT, INSERT ON 
  energytransfers, 
  beliefupdates, 
  rlrewards 
TO gridnexus_app;
