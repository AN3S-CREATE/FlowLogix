import { DataSource, EntityManager } from 'typeorm';

/**
 * Name of the Postgres session variable that carries the active tenant id.
 * This MUST stay in sync with the boards RLS policy's `current_setting(...)`
 * clause (see the AlignRlsTenantSetting migration); if the two ever diverge
 * the fail-closed policy returns zero rows.
 */
export const TENANT_SETTING = 'app.current_tenant_id';

/**
 * Runs `work` inside a transaction with the Postgres session variable
 * app.current_tenant_id set via SET LOCAL (set_config's third arg = true),
 * which the boards RLS policy checks. SET LOCAL only lasts for the
 * transaction it's issued in, so this must wrap every query that touches
 * RLS-protected tables rather than being set once per connection.
 */
export async function runInTenantContext<T>(
  dataSource: DataSource,
  orgId: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.startTransaction();
    await queryRunner.query('SELECT set_config($1, $2, true)', [
      TENANT_SETTING,
      orgId,
    ]);
    const result = await work(queryRunner.manager);
    await queryRunner.commitTransaction();
    return result;
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}
