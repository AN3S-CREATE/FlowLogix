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
- **Ordering.** `FractionalIndexer` (`backend/src/common/ordering/fractional-indexer.ts`)
  exists and is tested, but `lists.position_idx` / `cards.position_idx` are still
  `double precision`. Adopting fractional indexing means migrating those columns
  to `varchar`/`text` and writing new positions through `FractionalIndexer`.
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
  changes. `attachments/` is a background upload queue that stages large files
  locally and uploads only on Wi-Fi/LTE, with bounded concurrency and backoff.
  `model/` has the WatermelonDB schema/models (per-field `*_updated_at` columns)
  and the port adapters. Pure logic is unit-tested with vitest (32 tests); the
  React Native UI and native SQLite/NetInfo wiring live behind injectable ports.

When you implement any of the above, follow `.cursorrules` and update this
status list.
