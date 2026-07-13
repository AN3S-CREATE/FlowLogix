import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames the Postgres session variable the boards RLS policy reads from
 * `app.current_org_id` to `app.current_tenant_id`, so the SQL policy and the
 * application's `set_config(...)` call share one canonical name (see
 * `.cursorrules` §1 Core Architectural Constraints).
 *
 * This is a separate migration rather than an edit to EnableRlsAndTriggers
 * because that migration is already applied in existing databases and would
 * not re-run — recreating the policy here converges both fresh installs and
 * already-migrated databases onto the new setting name. The application's
 * TENANT_SETTING constant is updated in lockstep; the two must always match or
 * the fail-closed policy returns zero rows.
 */
export class AlignRlsTenantSetting1784001000000 implements MigrationInterface {
  name = 'AlignRlsTenantSetting1784001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS boards_tenant_isolation ON boards`,
    );
    await queryRunner.query(`
      CREATE POLICY boards_tenant_isolation ON boards
      USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS boards_tenant_isolation ON boards`,
    );
    await queryRunner.query(`
      CREATE POLICY boards_tenant_isolation ON boards
      USING (org_id = current_setting('app.current_org_id', true)::uuid)
      WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
    `);
  }
}
