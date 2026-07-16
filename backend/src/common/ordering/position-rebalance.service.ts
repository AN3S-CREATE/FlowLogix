import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PositionService } from './position.service';
import { TENANT_SETTING } from '../tenant/tenant-transaction.util';

/**
 * Precision-bloat guard for fractional indexing (§3.3.3). Consecutive inserts
 * at the same boundary grow position keys ('D', 'Da', 'Daa', …); left alone a
 * hot column's keys keep lengthening. This scheduled job scans for any column
 * (a board's lists, or a list's cards) that has grown a key past
 * `MAX_KEY_LENGTH` and re-spreads that column onto short, evenly-spaced keys.
 *
 * `lists`/`cards` are RLS-protected, so the scan/update can't see across orgs.
 * The whole pass runs in one transaction: it takes a Postgres advisory xact
 * lock (only one replica does the work), then iterates every org and sets the
 * tenant (`set_config(app.current_tenant_id, …, true)`) before scanning — so
 * each org's over-long columns are found and rewritten under its own RLS.
 * Ordering is preserved exactly (rows re-read in sort order, created_at + id as
 * the deterministic tiebreak) and each column is rewritten atomically.
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
   * Rebalance every over-long list/card column across all orgs, atomically and
   * singly — returns `skipped` when another instance holds the advisory lock.
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

      // `organizations` has no RLS, so this sees every tenant.
      const orgs = (await manager.query(
        'SELECT id FROM organizations',
      )) as Array<{ id: string }>;

      let lists = 0;
      let cards = 0;
      for (const { id: orgId } of orgs) {
        // SET LOCAL the tenant so the RLS-protected scans below see this org.
        await manager.query('SELECT set_config($1, $2, true)', [
          TENANT_SETTING,
          orgId,
        ]);
        lists += await this.rebalanceTable(manager, 'lists', 'board_id');
        cards += await this.rebalanceTable(manager, 'cards', 'list_id');
      }
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
