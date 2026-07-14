import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { mySchema } from './schema';
import { Board } from './Board';
import { List } from './List';
import { Card } from './Card';
import { AttachmentUploadModel } from './AttachmentUploadModel';

/**
 * Builds the WatermelonDB `Database` backed by native SQLite (JSI on-device).
 * Call once at app start and share the instance. Migrations are intentionally
 * empty at v1 — add them here as the schema `version` bumps.
 */
export function createDatabase(): Database {
  const adapter = new SQLiteAdapter({
    schema: mySchema,
    // JSI is the fast synchronous bridge on both platforms; falls back safely.
    jsi: true,
    onSetUpError: (error) => {
      // Surface catastrophic DB setup failures to crash reporting.
      // eslint-disable-next-line no-console
      console.error('WatermelonDB setup failed', error);
    },
  });

  return new Database({
    adapter,
    modelClasses: [Board, List, Card, AttachmentUploadModel],
  });
}
