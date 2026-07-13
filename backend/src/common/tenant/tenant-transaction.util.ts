import { DataSource, EntityManager } from 'typeorm';

/**
 * Runs `work` inside a transaction with the Postgres session variable
 * app.current_org_id set via SET LOCAL (set_config's third arg = true),
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
      'app.current_org_id',
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
