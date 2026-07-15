import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-record CRDT sync metadata the mobile `/sync` endpoint needs to do
 * field-level Last-Write-Wins against the PostgreSQL master, on `boards`,
 * `lists`, and `cards`:
 *
 *   - `sync_clocks`     jsonb  — map of `<field> -> epoch-µs` LWW clock, the
 *                                server counterpart of the mobile
 *                                `<field>_updated_at` columns.
 *   - `node_id`         varchar — the last writer's replica id (annotation only).
 *   - `sync_deleted_at` bigint  — the LWW deletion tombstone (epoch-µs), null=alive.
 *
 * Purely additive (nullable / defaulted columns), so it applies to populated
 * tables without touching existing rows or columns; existing CRUD writes simply
 * leave `sync_clocks` at its `{}` default until a record is first synced.
 */
export class AddSyncClocks1784500000000 implements MigrationInterface {
  name = 'AddSyncClocks1784500000000';

  private readonly tables = ['boards', 'lists', 'cards'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS sync_clocks jsonb NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS node_id varchar(64),
          ADD COLUMN IF NOT EXISTS sync_deleted_at bigint
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          DROP COLUMN IF EXISTS sync_clocks,
          DROP COLUMN IF EXISTS node_id,
          DROP COLUMN IF EXISTS sync_deleted_at
      `);
    }
  }
}
