import { MigrationInterface, QueryRunner } from 'typeorm';
import { FractionalIndexer } from '../../common/ordering/fractional-indexer';

/**
 * Migrate `lists.position_idx` and `cards.position_idx` from `double precision`
 * to a Base62 fractional-index `varchar` (the Lexorank scheme in `.cursorrules`
 * §1). Ordering then becomes an O(1) single-row write instead of renumbering a
 * whole column.
 *
 * Existing rows are backfilled in their current order: within each parent
 * (board→lists, list→cards) the rows are read ordered by the old numeric
 * position (with created_at + id as the deterministic tiebreak, per §3.3.3) and
 * assigned evenly-spaced fractional keys from `FractionalIndexer.rebalance`.
 */
export class MigratePositionIdxToFractional1785000000000 implements MigrationInterface {
  private readonly indexer = new FractionalIndexer();

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.toFractional(queryRunner, 'lists', 'board_id');
    await this.toFractional(queryRunner, 'cards', 'list_id');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.toNumeric(queryRunner, 'lists', 'board_id');
    await this.toNumeric(queryRunner, 'cards', 'list_id');
  }

  /** double precision -> varchar fractional key, backfilled in existing order. */
  private async toFractional(
    queryRunner: QueryRunner,
    table: string,
    parentCol: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${table}" ADD COLUMN "position_key" varchar(255)`,
    );

    const parents: Array<Record<string, string>> = await queryRunner.query(
      `SELECT DISTINCT "${parentCol}" AS parent FROM "${table}"`,
    );
    for (const { parent } of parents) {
      const rows: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM "${table}" WHERE "${parentCol}" = $1
         ORDER BY position_idx ASC, created_at ASC, id ASC`,
        [parent],
      );
      const keys = this.indexer.rebalance(rows.length);
      for (let i = 0; i < rows.length; i++) {
        await queryRunner.query(
          `UPDATE "${table}" SET "position_key" = $1 WHERE id = $2`,
          [keys[i], rows[i].id],
        );
      }
    }

    await queryRunner.query(
      `ALTER TABLE "${table}" ALTER COLUMN "position_key" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${table}" DROP COLUMN "position_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${table}" RENAME COLUMN "position_key" TO "position_idx"`,
    );
  }

  /** varchar fractional key -> double precision, backfilled by rank in key order. */
  private async toNumeric(
    queryRunner: QueryRunner,
    table: string,
    parentCol: string,
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${table}" ADD COLUMN "position_num" double precision`,
    );
    await queryRunner.query(
      `UPDATE "${table}" t SET "position_num" = sub.rn FROM (
         SELECT id, row_number() OVER (
           PARTITION BY "${parentCol}"
           ORDER BY position_idx ASC, created_at ASC, id ASC
         ) AS rn FROM "${table}"
       ) sub WHERE t.id = sub.id`,
    );
    await queryRunner.query(
      `ALTER TABLE "${table}" ALTER COLUMN "position_num" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "${table}" DROP COLUMN "position_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${table}" RENAME COLUMN "position_num" TO "position_idx"`,
    );
  }
}
