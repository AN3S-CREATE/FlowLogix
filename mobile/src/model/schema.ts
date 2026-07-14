import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * WatermelonDB (local SQLite) schema for the offline-first mobile app.
 *
 * Every user-editable field carries a companion `<field>_updated_at` column
 * holding a high-precision epoch-µs LWW clock, so sync can merge field-by-field
 * (see `crdt/mergeRecord`). Records also carry:
 *   - `node_id`    — the replica that made the latest write (LWW tie-break),
 *   - `deleted_at` — the LWW tombstone (null = alive),
 *   - `pending`    — set on local edits not yet acknowledged by the server.
 *
 * Positions stay compatible with the backend `FractionalIndexer` (string keys)
 * — `position_idx` is a string column here.
 */
export const mySchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'boards',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'title_updated_at', type: 'number' },
        { name: 'org_id', type: 'string', isIndexed: true },
        { name: 'org_id_updated_at', type: 'number' },
        { name: 'node_id', type: 'string' },
        { name: 'deleted_at', type: 'number', isOptional: true },
        { name: 'pending', type: 'boolean', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'lists',
      columns: [
        { name: 'board_id', type: 'string', isIndexed: true },
        { name: 'board_id_updated_at', type: 'number' },
        { name: 'title', type: 'string' },
        { name: 'title_updated_at', type: 'number' },
        { name: 'position_idx', type: 'string' },
        { name: 'position_idx_updated_at', type: 'number' },
        { name: 'node_id', type: 'string' },
        { name: 'deleted_at', type: 'number', isOptional: true },
        { name: 'pending', type: 'boolean', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'cards',
      columns: [
        { name: 'list_id', type: 'string', isIndexed: true },
        { name: 'list_id_updated_at', type: 'number' },
        { name: 'title', type: 'string' },
        { name: 'title_updated_at', type: 'number' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'description_updated_at', type: 'number' },
        { name: 'position_idx', type: 'string' },
        { name: 'position_idx_updated_at', type: 'number' },
        { name: 'is_complete', type: 'boolean' },
        { name: 'is_complete_updated_at', type: 'number' },
        { name: 'node_id', type: 'string' },
        { name: 'deleted_at', type: 'number', isOptional: true },
        { name: 'pending', type: 'boolean', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'attachment_uploads',
      columns: [
        { name: 'card_id', type: 'string', isIndexed: true },
        { name: 'local_uri', type: 'string' },
        { name: 'filename', type: 'string' },
        { name: 'mime_type', type: 'string' },
        { name: 'size_bytes', type: 'number' },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'attempts', type: 'number' },
        { name: 'next_attempt_at', type: 'number' },
        { name: 'remote_url', type: 'string', isOptional: true },
        { name: 'last_error', type: 'string', isOptional: true },
      ],
    }),
  ],
});
