# GridNexus Database Upgrade Instructions

This guide provides instructions for upgrading an existing GridNexus production database to the new schema synchronization and append-only protections.

## Background

The previous migration `20260812000000_add_append_only_triggers` contained hardcoded passwords and referenced tables that did not exist in the initial database migration. These issues have been fixed in the codebase. 
Because modifying an already applied migration changes its checksum, Prisma will fail to deploy subsequent migrations on existing databases unless the migration checksum is explicitly resolved.

## Upgrade Steps

If you are deploying against an existing GridNexus database that has already applied the `20260812000000_add_append_only_triggers` migration, follow these steps to upgrade:

1. **Resolve the modified checksum:**
   Because the file `20260812000000_add_append_only_triggers/migration.sql` was modified (to remove hardcoded passwords and fix invalid table grants), you must tell Prisma to accept the new checksum as valid for the already applied migration:
   ```bash
   npx prisma migrate resolve --applied 20260812000000_add_append_only_triggers
   ```

2. **Deploy the schema synchronization migration:**
   Once the checksum is resolved, you can safely apply the new migration that synchronizes the database with the `schema.prisma` file and adds all missing tables and constraints:
   ```bash
   npx prisma migrate deploy
   ```

3. **Verify Append-Only Triggers:**
   The `20260831000000_sync_current_schema` migration automatically applies append-only triggers to the newly created audit tables (`settlements` and `audit_events`). Ensure your application connects using the `gridnexus_app` role to benefit from these protections.

## New Deployments

If you are deploying to a brand new empty database, no special action is required. Simply run:
```bash
npx prisma migrate deploy
```
This will cleanly apply all migrations in order.
