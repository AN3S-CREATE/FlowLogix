import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

/**
 * Local SQLite representation of a card. Each editable field is paired with its
 * `*UpdatedAt` LWW clock so the sync engine can merge field-by-field. `nodeId`,
 * `deletedAt` and `pending` carry the CRDT + dirty-tracking metadata.
 */
export class Card extends Model {
  static table = 'cards';

  @text('list_id') listId!: string;
  @field('list_id_updated_at') listIdUpdatedAt!: number;

  @text('title') title!: string;
  @field('title_updated_at') titleUpdatedAt!: number;

  @text('description') description!: string | null;
  @field('description_updated_at') descriptionUpdatedAt!: number;

  @text('position_idx') positionIdx!: string;
  @field('position_idx_updated_at') positionIdxUpdatedAt!: number;

  @field('is_complete') isComplete!: boolean;
  @field('is_complete_updated_at') isCompleteUpdatedAt!: number;

  @text('node_id') nodeId!: string;
  @field('deleted_at') deletedAt!: number | null;
  @field('pending') pending!: boolean;
}
