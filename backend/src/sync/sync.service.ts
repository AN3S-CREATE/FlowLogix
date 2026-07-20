import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  QueryFailedError,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Board, BoardVisibility } from '../boards/board.entity';
import { List } from '../lists/list.entity';
import { Card } from '../cards/card.entity';
import { PositionService } from '../common/ordering/position.service';
import { runInTenantContext } from '../common/tenant/tenant-transaction.util';
import { BoardEventsService } from '../realtime/board-events.service';
import {
  BoardMutationPayload,
  BoardMutationType,
} from '../realtime/dto/board-mutation';
import {
  MAX_SYNC_CHANGES,
  SyncChangeDto,
  SyncCollection,
  SyncRequestDto,
  SyncResponseDto,
} from './dto/sync.dto';
import { mergeServerRecord, RecordState } from './sync-merge';

/** Queued after the tenant transaction commits (DB write decoupled from WS). */
interface PendingBoardEvent {
  type: BoardMutationType;
  boardId: string;
  payload: BoardMutationPayload;
}

/** A loaded row viewed through its sync metadata + arbitrary field access. */
type SyncRow = {
  syncClocks: Record<string, number>;
  nodeId: string | null;
  syncDeletedAt: number | null;
} & Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  /**
   * Insert an offline-created row when the id is unseen. Returns true when the
   * insert committed; false when the payload is incomplete / parent out-of-org
   * (client keeps the change pending). Throws on unexpected DB errors.
   */
  tryInsert(
    manager: EntityManager,
    orgId: string,
    change: SyncChangeDto,
    positions: PositionService,
  ): Promise<boolean>;
}

/**
 * Server master for the mobile offline-first `/sync` endpoint.
 *
 * For every change in the client's sync log it loads the org-scoped master row
 * (or inserts a new offline-created row), runs field-by-field Last-Write-Wins
 * (`mergeServerRecord`), writes back any field the client won, and echoes any
 * record where the server is newer — all inside one tenant transaction so RLS
 * is enforced.
 *
 * **Scope (v2 / Phase 3–4).** Merges content fields plus structural sync fields
 * (`positionIdx`, `listId` / `boardId`) under LWW, and accepts first-time
 * inserts of offline-created records when the parent is in-org and the client
 * id is a UUID. Invalid Base62 `positionIdx` values are dropped (never written);
 * older clients that omit structural fields keep content-only merge behaviour.
 * After commit, list/card writes publish lightweight board events (parity with
 * CRUD). When `sinceCheckpoint > 0`, also delta-pulls org-scoped rows whose
 * sync clocks (or tombstone) exceed that checkpoint.
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
      tryInsert: async (manager, orgId, change) => {
        if (!isUuid(change.id)) return false;
        const title = asNonEmptyString(change.fields.title);
        if (title === null) return false;
        const clocks = numericClocks(change.clocks, ['title']);
        try {
          await manager.insert(Board, {
            id: change.id,
            orgId,
            title,
            description: null,
            visibility: BoardVisibility.PRIVATE,
            syncClocks: clocks,
            nodeId: change.nodeId || null,
            syncDeletedAt: change.deletedAt,
          });
          return true;
        } catch (err) {
          if (isUniqueViolation(err)) return false;
          throw err;
        }
      },
    },
    lists: {
      entity: List,
      syncFields: ['title', 'boardId', 'positionIdx'],
      load: (manager, id, orgId) =>
        manager.findOne(List, {
          where: { id, board: { orgId } },
          relations: { board: true },
        }) as Promise<SyncRow | null>,
      tryInsert: async (manager, orgId, change, positions) => {
        if (!isUuid(change.id)) return false;
        const title = asNonEmptyString(change.fields.title);
        const boardId = asUuid(change.fields.boardId);
        if (title === null || boardId === null) return false;
        if (!(await boardInOrg(manager, boardId, orgId))) return false;

        const positionIdx = await resolvePositionKey(
          positions,
          change.fields.positionIdx,
          async () => {
            const last = await manager.findOne(List, {
              where: { boardId },
              order: { positionIdx: 'DESC' },
            });
            return last ? last.positionIdx : null;
          },
        );

        const clocks = numericClocks(change.clocks, [
          'title',
          'boardId',
          'positionIdx',
        ]);
        try {
          await manager.insert(List, {
            id: change.id,
            boardId,
            title,
            positionIdx,
            syncClocks: clocks,
            nodeId: change.nodeId || null,
            syncDeletedAt: change.deletedAt,
          });
          return true;
        } catch (err) {
          if (isUniqueViolation(err)) return false;
          throw err;
        }
      },
    },
    cards: {
      entity: Card,
      syncFields: ['title', 'description', 'isComplete', 'listId', 'positionIdx'],
      load: (manager, id, orgId) =>
        manager.findOne(Card, {
          where: { id, list: { board: { orgId } } },
          relations: { list: { board: true } },
        }) as Promise<SyncRow | null>,
      tryInsert: async (manager, orgId, change, positions) => {
        if (!isUuid(change.id)) return false;
        const title = asNonEmptyString(change.fields.title);
        const listId = asUuid(change.fields.listId);
        if (title === null || listId === null) return false;
        if (!(await listInOrg(manager, listId, orgId))) return false;

        const positionIdx = await resolvePositionKey(
          positions,
          change.fields.positionIdx,
          async () => {
            const last = await manager.findOne(Card, {
              where: { listId },
              order: { positionIdx: 'DESC' },
            });
            return last ? last.positionIdx : null;
          },
        );

        const description =
          typeof change.fields.description === 'string'
            ? change.fields.description
            : null;
        const isComplete =
          typeof change.fields.isComplete === 'boolean'
            ? change.fields.isComplete
            : false;

        const clocks = numericClocks(change.clocks, [
          'title',
          'description',
          'isComplete',
          'listId',
          'positionIdx',
        ]);
        try {
          await manager.insert(Card, {
            id: change.id,
            listId,
            title,
            description,
            isComplete,
            positionIdx,
            syncClocks: clocks,
            nodeId: change.nodeId || null,
            syncDeletedAt: change.deletedAt,
          });
          return true;
        } catch (err) {
          if (isUniqueViolation(err)) return false;
          throw err;
        }
      },
    },
  };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly positions: PositionService,
    private readonly boardEvents: BoardEventsService,
  ) {}

  async sync(orgId: string, req: SyncRequestDto): Promise<SyncResponseDto> {
    const strategy = this.strategies[req.collection];
    const pendingEvents: PendingBoardEvent[] = [];

    const response = await runInTenantContext(
      this.dataSource,
      orgId,
      async (manager) => {
        const changes: SyncChangeDto[] = [];
        const acceptedIds: string[] = [];

        // Acquire row locks in a deterministic (id-sorted) order so two concurrent
        // /sync requests touching the same records can't deadlock by locking them
        // in opposite orders. Per-record merges are independent, so processing
        // order doesn't affect the result. Use raw binary comparison, not
        // localeCompare — the latter is locale-sensitive, so instances under
        // different locales could order the same ids differently and reintroduce
        // the deadlock this ordering exists to prevent.
        const orderedChanges = [...req.changes].sort((a, b): number =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        );

        for (const change of orderedChanges) {
          // 1) Authorize: resolve the record in-org via the board-ownership chain.
          let authorized = await strategy.load(manager, change.id, orgId);

          if (!authorized) {
            // Unseen id: attempt an offline-created insert when the payload is
            // complete and the parent is in-org. On unique-violation race (another
            // sync won), fall through to a re-load + merge.
            const inserted = await strategy.tryInsert(
              manager,
              orgId,
              change,
              this.positions,
            );
            if (inserted) {
              acceptedIds.push(change.id);
              const created = await this.eventForInsert(
                manager,
                req.collection,
                change,
              );
              if (created) pendingEvents.push(created);
              continue;
            }
            authorized = await strategy.load(manager, change.id, orgId);
            if (!authorized) continue; // incomplete / out-of-org → keep pending
          }

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

          const { fields: clientFields, clocks: clientClocks } =
            await this.sanitizeClientChange(
              manager,
              orgId,
              strategy.syncFields,
              change.fields,
              change.clocks,
            );

          const server: RecordState = {
            fields: this.readFields(row, strategy.syncFields),
            clocks: row.syncClocks ?? {},
            nodeId: row.nodeId,
            deletedAt: row.syncDeletedAt,
          };
          const client: RecordState = {
            fields: clientFields,
            clocks: clientClocks,
            nodeId: change.nodeId,
            deletedAt: change.deletedAt,
          };

          const result = mergeServerRecord(server, client);

          if (result.serverChanged) {
            // Targeted update of only the sync columns: writing the whole entity
            // back (save) would clobber any non-sync column (dueDate, isArchived,
            // ...) a concurrent CRUD write changed after we loaded it.
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
            const updated = await this.eventForUpdate(
              manager,
              req.collection,
              change.id,
              server,
              result.merged,
            );
            if (updated) pendingEvents.push(updated);
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

        // Delta-pull: rows peers/CRUD updated since the client's checkpoint that
        // were not already covered by the push/merge loop above.
        if (req.sinceCheckpoint > 0) {
          const room = MAX_SYNC_CHANGES - changes.length;
          if (room > 0) {
            const exclude = new Set(changes.map((c) => c.id));
            for (const id of acceptedIds) exclude.add(id);
            const pulled = await this.pullSinceCheckpoint(
              manager,
              req.collection,
              orgId,
              req.sinceCheckpoint,
              exclude,
              room,
            );
            changes.push(...pulled);
          }
        }

        return { changes, checkpoint: this.nowMicros(), acceptedIds };
      },
    );

    // Publish only after commit — never couple Redis latency to the DB write.
    for (const event of pendingEvents) {
      void this.boardEvents.emit(event.type, event.boardId, event.payload);
    }

    return response;
  }

  /**
   * Org-scoped rows whose tombstone or any field clock is newer than
   * `sinceCheckpoint`. Bounded by `limit`; skips ids already in the response.
   */
  private async pullSinceCheckpoint(
    manager: EntityManager,
    collection: SyncCollection,
    orgId: string,
    sinceCheckpoint: number,
    excludeIds: Set<string>,
    limit: number,
  ): Promise<SyncChangeDto[]> {
    const strategy = this.strategies[collection];
    const clockPredicate = (alias: string): Brackets =>
      new Brackets((qb) => {
        qb.where(
          `${alias}.sync_deleted_at IS NOT NULL AND ${alias}.sync_deleted_at > :cp`,
          { cp: sinceCheckpoint },
        ).orWhere(
          `EXISTS (
            SELECT 1 FROM jsonb_each(${alias}.sync_clocks) AS e
            WHERE (e.value #>> '{}')::bigint > :cp
          )`,
          { cp: sinceCheckpoint },
        );
      });

    let rows: SyncRow[] = [];
    if (collection === 'boards') {
      rows = (await manager
        .createQueryBuilder(Board, 'b')
        .where('b.org_id = :orgId', { orgId })
        .andWhere(clockPredicate('b'))
        .orderBy('b.id', 'ASC')
        .take(limit + excludeIds.size)
        .getMany()) as unknown as SyncRow[];
    } else if (collection === 'lists') {
      rows = (await manager
        .createQueryBuilder(List, 'l')
        .innerJoin('l.board', 'board')
        .where('board.org_id = :orgId', { orgId })
        .andWhere(clockPredicate('l'))
        .orderBy('l.id', 'ASC')
        .take(limit + excludeIds.size)
        .getMany()) as unknown as SyncRow[];
    } else {
      rows = (await manager
        .createQueryBuilder(Card, 'c')
        .innerJoin('c.list', 'list')
        .innerJoin('list.board', 'board')
        .where('board.org_id = :orgId', { orgId })
        .andWhere(clockPredicate('c'))
        .orderBy('c.id', 'ASC')
        .take(limit + excludeIds.size)
        .getMany()) as unknown as SyncRow[];
    }

    const out: SyncChangeDto[] = [];
    for (const row of rows) {
      const id = String(row['id']);
      if (excludeIds.has(id)) continue;
      out.push({
        id,
        fields: this.readFields(row, strategy.syncFields),
        clocks: row.syncClocks ?? {},
        nodeId: row.nodeId ?? '',
        deletedAt: row.syncDeletedAt,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  private async eventForInsert(
    manager: EntityManager,
    collection: SyncCollection,
    change: SyncChangeDto,
  ): Promise<PendingBoardEvent | null> {
    if (collection === 'boards') return null;
    if (collection === 'lists') {
      const boardId = asUuid(change.fields.boardId);
      if (boardId === null) return null;
      const positionIdx =
        typeof change.fields.positionIdx === 'string'
          ? change.fields.positionIdx
          : undefined;
      return {
        type: 'list.created',
        boardId,
        payload: { listId: change.id, positionIdx },
      };
    }
    const listId = asUuid(change.fields.listId);
    if (listId === null) return null;
    const boardId = await boardIdForList(manager, listId);
    if (boardId === null) return null;
    const positionIdx =
      typeof change.fields.positionIdx === 'string'
        ? change.fields.positionIdx
        : undefined;
    return {
      type: 'card.created',
      boardId,
      payload: { cardId: change.id, listId, positionIdx },
    };
  }

  private async eventForUpdate(
    manager: EntityManager,
    collection: SyncCollection,
    id: string,
    before: RecordState,
    after: RecordState,
  ): Promise<PendingBoardEvent | null> {
    if (collection === 'boards') return null;

    const deletedNow =
      after.deletedAt !== null && after.deletedAt !== undefined;
    const wasDeleted =
      before.deletedAt !== null && before.deletedAt !== undefined;

    if (collection === 'lists') {
      const boardId = asUuid(after.fields.boardId ?? before.fields.boardId);
      if (boardId === null) return null;
      if (deletedNow && !wasDeleted) {
        return { type: 'list.deleted', boardId, payload: { listId: id } };
      }
      const positionIdx =
        typeof after.fields.positionIdx === 'string'
          ? after.fields.positionIdx
          : undefined;
      return {
        type: 'list.updated',
        boardId,
        payload: { listId: id, positionIdx },
      };
    }

    const listId = asUuid(after.fields.listId ?? before.fields.listId);
    if (listId === null) return null;
    const boardId = await boardIdForList(manager, listId);
    if (boardId === null) return null;
    if (deletedNow && !wasDeleted) {
      return {
        type: 'card.deleted',
        boardId,
        payload: { cardId: id, listId },
      };
    }
    const beforeList = asUuid(before.fields.listId);
    const afterPos =
      typeof after.fields.positionIdx === 'string'
        ? after.fields.positionIdx
        : undefined;
    const beforePos =
      typeof before.fields.positionIdx === 'string'
        ? before.fields.positionIdx
        : undefined;
    const moved = beforeList !== listId || beforePos !== afterPos;
    return {
      type: moved ? 'card.moved' : 'card.updated',
      boardId,
      payload: { cardId: id, listId, positionIdx: afterPos },
    };
  }

  /**
   * Keep only synced keys; drop invalid `positionIdx` and out-of-org parents so
   * a hostile/legacy payload cannot corrupt fractional order or cross tenants.
   * Dropped fields also drop their clocks — otherwise a high clock with a
   * missing value would win LWW and wipe the server field.
   * Older clients that omit structural fields are unaffected (content-only LWW).
   */
  private async sanitizeClientChange(
    manager: EntityManager,
    orgId: string,
    fields: readonly string[],
    sourceFields: Record<string, unknown>,
    sourceClocks: Record<string, unknown>,
  ): Promise<{
    fields: Record<string, unknown>;
    clocks: Record<string, number>;
  }> {
    const outFields: Record<string, unknown> = {};
    const outClocks: Record<string, number> = {};
    const rawClocks = numericClocks(sourceClocks, fields);

    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(sourceFields, field)) continue;
      const value = sourceFields[field];

      if (field === 'positionIdx') {
        if (typeof value !== 'string' || !this.positions.isValid(value)) {
          continue;
        }
        outFields[field] = value;
        if (rawClocks[field] !== undefined) outClocks[field] = rawClocks[field];
        continue;
      }

      if (field === 'listId') {
        const listId = asUuid(value);
        if (listId === null) continue;
        if (!(await listInOrg(manager, listId, orgId))) continue;
        outFields[field] = listId;
        if (rawClocks[field] !== undefined) outClocks[field] = rawClocks[field];
        continue;
      }

      if (field === 'boardId') {
        const boardId = asUuid(value);
        if (boardId === null) continue;
        if (!(await boardInOrg(manager, boardId, orgId))) continue;
        outFields[field] = boardId;
        if (rawClocks[field] !== undefined) outClocks[field] = rawClocks[field];
        continue;
      }

      outFields[field] = value;
      if (rawClocks[field] !== undefined) outClocks[field] = rawClocks[field];
    }

    // Clocks for fields the client omitted entirely are ignored (absent = 0 in
    // merge). Only clocks for accepted fields participate.
    return { fields: outFields, clocks: outClocks };
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

  /** Strictly-increasing server checkpoint clock (epoch-µs), never repeats. */
  private nowMicros(): number {
    const wall = Date.now() * 1000;
    this.lastMicros = wall > this.lastMicros ? wall : this.lastMicros + 1;
    return this.lastMicros;
  }
}

/**
 * Sanitize the client's clocks: keep only synced keys whose value is a finite
 * number. `clocks` arrives as an unvalidated JSON object, so a malformed or
 * hostile payload (a string, NaN, Infinity) must never reach the LWW
 * comparison — a bad clock would otherwise skew every merge for that record.
 */
function numericClocks(
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

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

function asUuid(value: unknown): string | null {
  return isUuid(value) ? (value as string) : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string } | undefined;
  return driver?.code === '23505';
}

async function boardInOrg(
  manager: EntityManager,
  boardId: string,
  orgId: string,
): Promise<boolean> {
  const row = await manager.findOne(Board, { where: { id: boardId, orgId } });
  return row !== null;
}

async function listInOrg(
  manager: EntityManager,
  listId: string,
  orgId: string,
): Promise<boolean> {
  const row = await manager.findOne(List, {
    where: { id: listId, board: { orgId } },
    relations: { board: true },
  });
  return row !== null;
}

async function boardIdForList(
  manager: EntityManager,
  listId: string,
): Promise<string | null> {
  const row = await manager.findOne(List, {
    where: { id: listId },
    select: { id: true, boardId: true },
  });
  return row?.boardId ?? null;
}

/**
 * Prefer a client-supplied valid Base62 key; otherwise mint an append key after
 * the current last sibling so offline creates never leave a null/invalid index.
 */
async function resolvePositionKey(
  positions: PositionService,
  provided: unknown,
  lastSiblingKey: () => Promise<string | null>,
): Promise<string> {
  if (typeof provided === 'string' && positions.isValid(provided)) {
    return provided;
  }
  const last = await lastSiblingKey();
  return positions.keyForAppend(last);
}
