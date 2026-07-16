import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PositionService } from './position.service';

/**
 * Precision-bloat guard for fractional indexing (§3.3.3). Consecutive inserts
 * at the same boundary grow position keys ('D', 'Da', 'Daa', …); left alone a
 * hot column's keys keep lengthening. This scheduled job scans for any column
 * (a board's lists, or a list's cards) that has grown a key past
 * `MAX_KEY_LENGTH` and re-spreads that column onto short, evenly-spaced keys.
 *
 * Runs once daily at a low-load hour. Ordering is preserved exactly — rows are
 * re-read in their current sort order (with created_at + id as the deterministic
 * tiebreak) before new keys are assigned.
 *
 * Safe under horizontal scaling: all replicas fire this @Cron, so the whole
 * pass runs inside one transaction guarded by a Postgres **advisory xact lock**
 * — only one instance does the work, the rest no-op, and every column's
 * re-key is atomic (auto-committed/rolled back with the transaction).
 */
@Injectable()
export class PositionRebalanceService {
  private readonly logger = new Logger(PositionRebalanceService.name);
  private static readonly MAX_KEY_LENGTH = 32;
  /** Arbitrary constant key so only one instance holds the rebalance lock. */
  private static readonly ADVISORY_LOCK_KEY = 291078;

  constructor(
    private readonly positions: PositionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    const { lists, cards, skipped } = await this.rebalanceOverlongColumns();
    if (skipped) return; // another instance is already rebalancing
    if (lists + cards > 0) {
      this.logger.log(
        `Rebalanced ${lists} list column(s) and ${cards} card column(s)`,
      );
    }
  }

  /**
   * Rebalance every over-long list/card column, atomically and singly — returns
   * `skipped` when another instance already holds the advisory lock.
   */
  async rebalanceOverlongColumns(): Promise<{
    lists: number;
    cards: number;
    skipped: boolean;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const [{ locked }] = (await manager.query(
        'SELECT pg_try_advisory_xact_lock($1) AS locked',
        [PositionRebalanceService.ADVISORY_LOCK_KEY],
      )) as Array<{ locked: boolean }>;
      if (!locked) return { lists: 0, cards: 0, skipped: true };

      const lists = await this.rebalanceTable(manager, 'lists', 'board_id');
      const cards = await this.rebalanceTable(manager, 'cards', 'list_id');
      return { lists, cards, skipped: false };
    });
  }

  /** Re-spread each parent group (in `table`) that contains an over-long key. */
  private async rebalanceTable(
    manager: EntityManager,
    table: string,
    parentCol: string,
  ): Promise<number> {
    const parents: Array<{ parent: string }> = await manager.query(
      `SELECT DISTINCT "${parentCol}" AS parent FROM "${table}"
       WHERE char_length(position_idx) > $1`,
      [PositionRebalanceService.MAX_KEY_LENGTH],
    );

    let rebalanced = 0;
    for (const { parent } of parents) {
      const rows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM "${table}" WHERE "${parentCol}" = $1
         ORDER BY position_idx ASC, created_at ASC, id ASC`,
        [parent],
      );
      const keys = this.positions.rebalancedKeys(rows.length);
      // One batched UPDATE per column (id/key pairs zipped via unnest).
      await manager.query(
        `UPDATE "${table}" t SET position_idx = v.key
         FROM unnest($1::uuid[], $2::varchar[]) AS v(id, key)
         WHERE t.id = v.id`,
        [rows.map((r) => r.id), keys],
      );
      rebalanced++;
    }
    return rebalanced;
  }
}
