import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { List } from '../../lists/list.entity';
import { Card } from '../../cards/card.entity';
import { PositionService } from './position.service';

/**
 * Precision-bloat guard for fractional indexing (§3.3.3). Consecutive inserts
 * at the same boundary grow position keys ('D', 'Da', 'Daa', …); left alone a
 * hot column's keys keep lengthening. This scheduled job scans for any column
 * (a board's lists, or a list's cards) that has grown a key past
 * `MAX_KEY_LENGTH` and re-spreads that column onto short, evenly-spaced keys.
 *
 * Runs once daily at a low-load hour. The ordering is preserved exactly — rows
 * are re-read in their current sort order (with created_at + id as the
 * deterministic tiebreak) before new keys are assigned.
 */
@Injectable()
export class PositionRebalanceService {
  private readonly logger = new Logger(PositionRebalanceService.name);
  private static readonly MAX_KEY_LENGTH = 32;

  constructor(
    private readonly positions: PositionService,
    @InjectRepository(List) private readonly listsRepo: Repository<List>,
    @InjectRepository(Card) private readonly cardsRepo: Repository<Card>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    const { lists, cards } = await this.rebalanceOverlongColumns();
    if (lists + cards > 0) {
      this.logger.log(
        `Rebalanced ${lists} list column(s) and ${cards} card column(s)`,
      );
    }
  }

  /** Rebalance every list column and card column that holds an over-long key. */
  async rebalanceOverlongColumns(): Promise<{ lists: number; cards: number }> {
    const lists = await this.rebalanceTable(
      this.listsRepo,
      'lists',
      'board_id',
    );
    const cards = await this.rebalanceTable(this.cardsRepo, 'cards', 'list_id');
    return { lists, cards };
  }

  /** Re-spread each parent group (in `table`) that contains an over-long key. */
  private async rebalanceTable<T extends ObjectLiteral>(
    repo: Repository<T>,
    table: string,
    parentCol: string,
  ): Promise<number> {
    const parents: Array<{ parent: string }> = await repo.query(
      `SELECT DISTINCT "${parentCol}" AS parent FROM "${table}"
       WHERE char_length(position_idx) > $1`,
      [PositionRebalanceService.MAX_KEY_LENGTH],
    );

    let rebalanced = 0;
    for (const { parent } of parents) {
      const rows: Array<{ id: string }> = await repo.query(
        `SELECT id FROM "${table}" WHERE "${parentCol}" = $1
         ORDER BY position_idx ASC, created_at ASC, id ASC`,
        [parent],
      );
      const keys = this.positions.rebalancedKeys(rows.length);
      for (let i = 0; i < rows.length; i++) {
        await repo.update(rows[i].id, {
          positionIdx: keys[i],
        } as unknown as QueryDeepPartialEntity<T>);
      }
      rebalanced++;
    }
    return rebalanced;
  }
}
