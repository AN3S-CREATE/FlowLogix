import { MigrationInterface, QueryRunner } from 'typeorm';

const APP_ROLE = process.env.APP_DB_USER ?? 'logixflow_app';
const APP_ROLE_PASSWORD = process.env.APP_DB_PASSWORD ?? 'logixflow_app';
const UPDATED_AT_TABLES = [
  'organizations',
  'boards',
  'lists',
  'cards',
  'comments',
];

// These are interpolated into raw SQL below (role name as an identifier,
// role name/password as string literals), so escape them defensively even
// though they normally come from trusted deployment env vars.
const escapedRoleIdent = APP_ROLE.replace(/"/g, '""');
const escapedRoleLiteral = APP_ROLE.replace(/'/g, "''");
const escapedPasswordLiteral = APP_ROLE_PASSWORD.replace(/'/g, "''");

export class EnableRlsAndTriggers1783940500000 implements MigrationInterface {
  name = 'EnableRlsAndTriggers1783940500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // RLS is bypassed for superusers and for a table's own owner, so the
    // app must run as a separate, unprivileged role for the boards policy
    // below to have any effect. Migrations still run as the superuser
    // owner (POSTGRES_USER) so they retain DDL rights.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${escapedRoleLiteral}') THEN
          CREATE ROLE "${escapedRoleIdent}" WITH LOGIN PASSWORD '${escapedPasswordLiteral}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
        END IF;
      END
      $$;
    `);
    await queryRunner.query(
      `GRANT USAGE ON SCHEMA public TO "${escapedRoleIdent}"`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${escapedRoleIdent}"`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${escapedRoleIdent}"`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    for (const table of UPDATED_AT_TABLES) {
      await queryRunner.query(`
        CREATE TRIGGER set_${table}_updated_at
        BEFORE UPDATE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      `);
    }

    // Rows are only visible/writable when org_id matches the tenant set on
    // the current transaction via set_config('app.current_org_id', ..., true)
    // (see TenantContext). current_setting(..., true) returns NULL when
    // unset, so a request that forgets to set the tenant sees zero rows
    // instead of leaking across tenants.
    await queryRunner.query(`ALTER TABLE boards ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE boards FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY boards_tenant_isolation ON boards
      USING (org_id = current_setting('app.current_org_id', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS boards_tenant_isolation ON boards`,
    );
    await queryRunner.query(`ALTER TABLE boards NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE boards DISABLE ROW LEVEL SECURITY`);

    for (const table of UPDATED_AT_TABLES) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS set_${table}_updated_at ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at`);

    await queryRunner.query(
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "${escapedRoleIdent}"`,
    );
    await queryRunner.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM "${escapedRoleIdent}"`,
    );
    await queryRunner.query(
      `REVOKE USAGE ON SCHEMA public FROM "${escapedRoleIdent}"`,
    );
    await queryRunner.query(`DROP ROLE IF EXISTS "${escapedRoleIdent}"`);
  }
}
