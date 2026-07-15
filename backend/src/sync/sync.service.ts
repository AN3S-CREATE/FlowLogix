import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Board } from '../boards/board.entity';
import { List } from '../lists/list.entity';
import { Card } from '../cards/card.entity';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';
import {
  SyncChangeDto,
  SyncCollection,
  SyncRequestDto,
  SyncResponseDto,
} from './dto/sync.dto';
import { mergeServerRecord, RecordState } from './sync-merge';

/** A loaded row viewed through its sync metadata + arbitrary field access. */
type SyncRow = {
  syncClocks: Record<string, number>;
  nodeId: string | null;
  syncDeletedAt: number | null;
} & Record<string, unknown>;

interface CollectionStrategy {
  /** The entity, used both to load and to issue a targeted partial update. */
  readonly entity: EntityTarget<ObjectLiteral>;
  /** Entity property names that participate in field-level LWW. */
  readonly syncFields: readonly string[];
  /** Load a record scoped to the org (via the board-ownership chain), or null. */
  load(
    manager: EntityManager,
    id: string,
    orgId: string,
  ): Promise<SyncRow | null>;
}

/**
 * Server master for the mobile offline-first `/sync` endpoint.
 *
 * For every change in the client's sync log it loads the org-scoped master row,
 * runs field-by-field Last-Write-Wins (`mergeServerRecord`), writes back any
 * field the client won, and echoes any record where the server is newer — all
 * inside one tenant transaction so the boards RLS policy is enforced.
 *
 * **Scope (v1).** Merges the *content* fields (`title`, `description`,
 * `isComplete`) of existing records — exactly the field-level conflict
 * resolution the client needs for concurrent edits. Structural fields
 * (`position_idx`, parent `list_id`/`board_id`) stay on the dedicated move
 * endpoints (the server column is still `double precision`, pending the
 * FractionalIndexer migration), and first-time inserts of offline-created
 * records go through the normal create routes. Unseen/out-of-org ids are simply
 * not accepted, so the client keeps them pending.
 */
@Injectable()
export class SyncService {
  private lastMicros = 0;

  private readonly strategies: Record<SyncCollection, CollectionStrategy> = {
    boards: {
      entity: Board,
      syncFields: ['title'],
      load: (manager, id, orgId) =>
        manager.findOne(Board, {
          where: { id, orgId },
        }) as Promise<SyncRow | null>,
    },
    lists: {
      entity: List,
      syncFields: ['title'],
      load: (manager, id, orgId) =>
        manager.findOne(List, {
          where: { id, board: { orgId } },
          relations: { board: true },
        }) as Promise<SyncRow | null>,
    },
    cards: {
      entity: Card,
      syncFields: ['title', 'description', 'isComplete'],
      load: (manager, id, orgId) =>
        manager.findOne(Card, {
          where: { id, list: { board: { orgId } } },
          relations: { list: { board: true } },
        }) as Promise<SyncRow | null>,
    },
  };

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async sync(orgId: string, req: SyncRequestDto): Promise<SyncResponseDto> {
    const strategy = this.strategies[req.collection];

    return runInTenantContext(this.dataSource, orgId, async (manager) => {
      const changes: SyncChangeDto[] = [];
      const acceptedIds: string[] = [];

      for (const change of req.changes) {
        // 1) Authorize: resolve the record in-org via the board-ownership chain.
        // Unseen id or a record in another org: don't accept — the client keeps
        // it pending and (for genuinely new records) creates it via the CRUD API.
        const authorized = await strategy.load(manager, change.id, orgId);
        if (!authorized) continue;

        // 2) Lock the row FOR UPDATE and re-read its freshly-committed state, so
        // concurrent syncs (or a CRUD write) on the same record serialize instead
        // of racing read-modify-write and losing an update. The lock is by id
        // alone — no relation join — so Postgres doesn't reject it on the nullable
        // side of an outer join. Null here means it was deleted between the two
        // reads; skip it.
        const row = (await manager.findOne(strategy.entity, {
          where: { id: change.id },
          lock: { mode: 'pessimistic_write' },
        })) as SyncRow | null;
        if (!row) continue;

        const server: RecordState = {
          fields: this.readFields(row, strategy.syncFields),
          clocks: row.syncClocks ?? {},
          nodeId: row.nodeId,
          deletedAt: row.syncDeletedAt,
        };
        const client: RecordState = {
          fields: this.filter(change.fields, strategy.syncFields),
          clocks: this.numericClocks(change.clocks, strategy.syncFields),
          nodeId: change.nodeId,
          deletedAt: change.deletedAt,
        };

        const result = mergeServerRecord(server, client);

        if (result.serverChanged) {
          // Targeted update of only the sync columns: writing the whole entity
          // back (save) would clobber any non-sync column (positionIdx, dueDate,
          // isArchived, ...) a concurrent CRUD write changed after we loaded it.
          const patch: Record<string, unknown> = {
            syncClocks: result.merged.clocks,
            nodeId: result.merged.nodeId,
            syncDeletedAt: result.merged.deletedAt,
          };
          for (const field of strategy.syncFields) {
            patch[field] = result.merged.fields[field];
          }
          await manager.update(
            strategy.entity,
            change.id,
            patch as QueryDeepPartialEntity<ObjectLiteral>,
          );
        }

        if (result.clientAccepted) acceptedIds.push(change.id);
        if (result.serverAhead) {
          changes.push({
            id: change.id,
            fields: result.merged.fields,
            clocks: result.merged.clocks,
            nodeId: result.merged.nodeId ?? '',
            deletedAt: result.merged.deletedAt,
          });
        }
      }

      return { changes, checkpoint: this.nowMicros(), acceptedIds };
    });
  }

  /** Snapshot the synced entity fields into a plain map for the merge. */
  private readFields(
    row: SyncRow,
    fields: readonly string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of fields) out[field] = row[field];
    return out;
  }

  /** Keep only the synced keys the client sent (ignore position/parent/etc.). */
  private filter<T>(
    source: Record<string, T>,
    fields: readonly string[],
  ): Record<string, T> {
    const out: Record<string, T> = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(source, field)) {
        out[field] = source[field];
      }
    }
    return out;
  }

  /**
   * Sanitize the client's clocks: keep only synced keys whose value is a finite
   * number. `clocks` arrives as an unvalidated JSON object, so a malformed or
   * hostile payload (a string, NaN, Infinity) must never reach the LWW
   * comparison — a bad clock would otherwise skew every merge for that record.
   */
  private numericClocks(
    source: Record<string, unknown>,
    fields: readonly string[],
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const field of fields) {
      const value = source[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[field] = value;
      }
    }
    return out;
  }

  /** Strictly-increasing server checkpoint clock (epoch-µs), never repeats. */
  private nowMicros(): number {
    const wall = Date.now() * 1000;
    this.lastMicros = wall > this.lastMicros ? wall : this.lastMicros + 1;
    return this.lastMicros;
  }
}
