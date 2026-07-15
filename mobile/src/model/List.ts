import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

/** Local SQLite representation of a list (see `Card` for the LWW convention). */
export class List extends Model {
  static table = 'lists';

  @text('board_id') boardId!: string;
  @field('board_id_updated_at') boardIdUpdatedAt!: number;

  @text('title') title!: string;
  @field('title_updated_at') titleUpdatedAt!: number;

  @text('position_idx') positionIdx!: string;
  @field('position_idx_updated_at') positionIdxUpdatedAt!: number;

  @text('node_id') nodeId!: string;
  @field('deleted_at') deletedAt!: number | null;
  @field('pending') pending!: boolean;
}
