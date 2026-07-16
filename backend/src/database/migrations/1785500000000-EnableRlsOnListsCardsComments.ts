import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends DB-level Row-Level Security from `boards` to `lists`, `cards`, and
 * `comments` (`.cursorrules` §1). These tables have no `org_id`, so each policy
 * checks that the row's parent is visible under the parent's own RLS via a
 * correlated `EXISTS` — e.g. `EXISTS (SELECT 1 FROM boards p WHERE p.id =
 * lists.board_id)`. `EXISTS` (over `IN (SELECT …)`) lets the planner satisfy the
 * per-row policy check with a single indexed lookup on the parent's primary key.
 * The parent read is still RLS-filtered, so the single `boards` org check
 * (`org_id = current_setting('app.current_tenant_id', true)::uuid`) propagates
 * down the whole hierarchy — no per-table org column, one source of truth.
 *
 * `current_setting(..., true)` returns NULL when the tenant isn't set, so any
 * query that forgets `runInTenantContext` fails closed (zero rows) rather than
 * leaking across tenants. The app connects as a non-owner role, so FORCE ROW
 * LEVEL SECURITY makes the policy apply to it (RLS is bypassed for the owner).
 */
export class EnableRlsOnListsCardsComments1785500000000 implements MigrationInterface {
  private readonly policies: Array<{
    table: string;
    parentTable: string;
    fk: string;
  }> = [
    { table: 'lists', parentTable: 'boards', fk: 'board_id' },
    { table: 'cards', parentTable: 'lists', fk: 'list_id' },
    { table: 'comments', parentTable: 'cards', fk: 'card_id' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, parentTable, fk } of this.policies) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      // Correlated EXISTS (not `IN (SELECT …)`) so the per-row policy check is a
      // single indexed lookup on the parent PK. Columns are qualified because the
      // child table also has an `id` column.
      const membership = `EXISTS (SELECT 1 FROM ${parentTable} p WHERE p.id = ${table}.${fk})`;
      await queryRunner.query(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (${membership})
        WITH CHECK (${membership});
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order so children drop before parents (not strictly required for
    // DROP POLICY, but keeps the teardown symmetric with up()).
    for (const { table } of [...this.policies].reverse()) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`,
      );
      await queryRunner.query(
        `ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`,
      );
    }
  }
}
