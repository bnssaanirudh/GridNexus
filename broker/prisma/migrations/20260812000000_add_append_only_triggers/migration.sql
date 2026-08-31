-- Create roles if they don't exist, without hardcoding passwords
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gridnexus_app') THEN
    CREATE ROLE gridnexus_app WITH LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gridnexus_admin') THEN
    CREATE ROLE gridnexus_admin WITH LOGIN;
  END IF;
END
$$;

-- Ensure schema usage
GRANT USAGE ON SCHEMA public TO gridnexus_app;
GRANT USAGE ON SCHEMA public TO gridnexus_admin;

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_snapshots" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_snapshots_pkey" PRIMARY KEY ("id")
);

-- Admin gets full privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gridnexus_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gridnexus_admin;

-- App gets full privileges on non-audit tables
GRANT SELECT, INSERT, UPDATE, DELETE ON 
  microgrids, 
  agents, 
  negotiations, 
  oraclesignals, 
  reconciliations, 
  integrity_snapshots 
TO gridnexus_app;

-- App gets ONLY SELECT and INSERT on audit tables
GRANT SELECT, INSERT ON 
  energytransfers, 
  beliefupdates, 
  rlrewards 
TO gridnexus_app;



-- Append-Only Triggers
CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS TRIGGER AS $$
BEGIN
  -- We allow the admin role to update or delete rows.
  -- This checks the current active session role or login user.
  IF current_setting('role', true) = 'gridnexus_admin' OR current_user = 'gridnexus_admin' THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Table % is append-only. UPDATE and DELETE are restricted.', TG_TABLE_NAME;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reject_update_energytransfers ON "energytransfers";
CREATE TRIGGER reject_update_energytransfers
BEFORE UPDATE OR DELETE ON "energytransfers"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS reject_update_beliefupdates ON "beliefupdates";
CREATE TRIGGER reject_update_beliefupdates
BEFORE UPDATE OR DELETE ON "beliefupdates"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS reject_update_rlrewards ON "rlrewards";
CREATE TRIGGER reject_update_rlrewards
BEFORE UPDATE OR DELETE ON "rlrewards"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
