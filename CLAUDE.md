# CLAUDE.md

Guidance for Claude Code (and other AI assistants) when working in this repository.

The full, authoritative coding rules, architectural constraints, tech stack,
brand/UI standards, and testing requirements live in **`.cursorrules`** and are
imported below so there is a single source of truth shared with Cursor.

@.cursorrules

---

## Implementation status vs. the rules above

These rules are the target the workspace is converging on; parts are not built
yet. Notable gaps between the rules and the current code:

- **RLS session variable.** The boards policy and the runtime helper both use
  `app.current_tenant_id`, matching the rules. The name lives in one place —
  the `TENANT_SETTING` constant in
  `backend/src/common/tenant/tenant-transaction.util.ts` — and the SQL policy
  (see the `AlignRlsTenantSetting` migration) must always match it; if the two
  ever diverge the fail-closed policy returns zero rows.
- **RLS coverage.** RLS is currently enabled only on `boards`; `lists`, `cards`,
  and `comments` are isolated transitively at the application layer via
  `TenantAccessService`. Extending DB-level RLS to those tables (they have no
  `org_id` column, so policies must join up to the owning board) is future work.
- **Ordering.** Wired. `lists.position_idx` / `cards.position_idx` are Base62
  fractional-index `varchar` keys (the `MigratePositionIdxToFractional`
  migration converts + backfills existing rows in order). `PositionService`
  (`backend/src/common/ordering/position.service.ts`) wraps `FractionalIndexer`;
  Lists/Cards compute an append-to-end key on create (or validate a
  client-supplied key) and validate keys on move. `PositionRebalanceService` is
  a daily `@Cron` that re-spreads any column whose keys exceed 32 chars
  (precision-bloat guard, §3.3.3). The `/sync` merge still leaves `position_idx`
  out of scope (content fields only).
- **Real-time websockets.** Implemented. `backend/src/realtime/` holds the
  Socket.io gateway, the Redis Pub/Sub service, and `BoardEventsService` — the
  service-layer capture point that publishes lightweight `{ cardId, listId,
  positionIdx }` deltas to `board:room:{boardId}` *after* the DB write commits
  (decoupled per §4). `CardsService`/`ListsService` call it; the gateway
  pattern-subscribes and fans frames out to the matching room, with an org
  ownership check on join and a Redis-backed replay log for reconnect
  delta-sync. The client half is `frontend/src/realtime/boardSocketManager.ts`.
- **Frontend.** The React SPA is a minimal scaffold; the Zustand
  optimistic-update, brand palette pieces described in the rules are largely in
  place (the branded board UI and the socket manager exist; store wiring of live
  frames is the next step).
- **Mobile offline-first sync.** Implemented in the `mobile/` workspace
  (`mobile/src/`). `crdt/` holds the LWW-CRDT primitives — a strictly-monotonic
  high-precision clock, an LWW register, an LWW-Element-Set, and a field-level
  `mergeRecord` keyed on `<field>_updated_at`. `sync/` is the offline-first
  `SyncService`: mutations write straight to local SQLite and stamp per-field
  clocks; on reconnect it pulls, merges field-by-field, and pushes pending
  changes. `HttpSyncTransport` (`sync/httpSyncTransport.ts`) is the concrete
  transport: it POSTs the field-level change log to the backend `/sync` endpoint
  and applies the server-newer fields it returns (fetch is injected, so it is
  testable off-device). `attachments/` is a background upload queue that stages
  large files locally and uploads only on Wi-Fi/LTE, with bounded concurrency and
  backoff; `attachments/backgroundUploadTask.ts` is the Expo/React Native
  background-task glue that drains it on OS wake-ups when the connection is
  suitable (the `expo-task-manager` / `expo-background-task` surface is an
  injected `BackgroundTaskHost` port). `model/` has the WatermelonDB
  schema/models (per-field `*_updated_at` columns) and the port adapters. Pure
  logic is unit-tested with vitest (46 tests); the React Native UI and native
  SQLite/NetInfo/Expo wiring live behind injectable ports.
- **Server `/sync` endpoint.** Implemented in `backend/src/sync/`. `sync-merge.ts`
  is the master half of the mobile `mergeRecord` — a pure field-level LWW merge
  (later clock wins; exact ties broken by greater canonical-JSON value, identical
  to the client so both converge; deletion is an LWW tombstone). `SyncService`
  runs it per record inside a tenant transaction, and `SyncController` exposes
  `POST /sync` (tenant from the `X-Org-Id` header). The master carries per-record
  CRDT metadata via the `AddSyncClocks` migration — additive `sync_clocks` (jsonb
  `<field>→epoch-µs`), `node_id`, and `sync_deleted_at` columns on
  `boards`/`lists`/`cards`, mapped on the entities (`bigintToNumber` transformer).
  Jest-tested (mocked DataSource). **v1 scope:** merges *content* fields
  (`title`/`description`/`isComplete`) of existing records; `position_idx` and
  parent-move sync wait on the `FractionalIndexer` column migration, and
  first-time inserts of offline-created records still go through the CRUD routes.

When you implement any of the above, follow `.cursorrules` and update this
status list.
