import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

/** Local SQLite representation of a board (see `Card` for the LWW convention). */
export class Board extends Model {
  static table = 'boards';

  @text('title') title!: string;
  @field('title_updated_at') titleUpdatedAt!: number;

  @text('org_id') orgId!: string;
  @field('org_id_updated_at') orgIdUpdatedAt!: number;

  @text('node_id') nodeId!: string;
  @field('deleted_at') deletedAt!: number | null;
  @field('pending') pending!: boolean;
}
