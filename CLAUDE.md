# CLAUDE.md

Guidance for Claude Code (and other AI assistants) when working in this repository.

The full, authoritative coding rules, architectural constraints, tech stack,
brand/UI standards, and testing requirements live in **`.cursorrules`** and are
imported below so there is a single source of truth shared with Cursor.

@.cursorrules

Mandatory **operational** rules for AI agents — notably the policy to mirror
every commit/push to all three FlowLogix remotes — live in **`AGENTS.md`** and
are imported here so Claude Code and other assistants always load them:

@AGENTS.md

---

## Implementation status vs. the rules above

These rules are the target the workspace is converging on; parts are not built
yet. Notable gaps between the rules and the current code:

- **Authentication.** Built (JWT). `backend/src/auth/` has `AuthService`
  (bcrypt credential check + token signing), `POST /auth/login` and `GET
  /auth/me`, and a global `JwtAuthGuard` (APP_GUARD) that protects every HTTP
  route unless `@Public()` (login + `/health*`). The guard verifies the bearer
  token and attaches `request.user`; `ActiveOrgId` now reads the org **from the
  verified JWT**, not the old spoofable `X-Org-Id` header. Websocket contexts
  pass through the guard (the gateway keeps its own handshake check). OAuth2/SSO
  (external IdP) remains future work — this is the local-credential JWT core.

- **HTTP hardening.** Global `HttpExceptionFilter` (`APP_FILTER`) masks unexpected
  500s and shapes `HttpException` responses. `helmet` sets baseline security
  headers in `main.ts`. `@nestjs/throttler` rate-limits at 100 req/min per IP
  globally, with login tightened to 10/min and `/health*` `@SkipThrottle()`'d.

- **RLS session variable.** The boards policy and the runtime helper both use

  `app.current_tenant_id`, matching the rules. The name lives in one place —
  the `TENANT_SETTING` constant in
  `backend/src/common/tenant/tenant-transaction.util.ts` — and the SQL policy
  (see the `AlignRlsTenantSetting` migration) must always match it; if the two
  ever diverge the fail-closed policy returns zero rows.
- **RLS coverage.** DB-level RLS now covers `boards`, `lists`, `cards`, and
  `comments` (`.cursorrules` §1). `lists`/`cards`/`comments` have no `org_id`
  column, so the `EnableRlsOnListsCardsComments` migration gives each a
  chained-membership policy that checks the row's parent is visible under the
  parent's own RLS (`lists.board_id IN (SELECT id FROM boards)`, `cards.list_id
  IN (SELECT id FROM lists)`, `comments.card_id IN (SELECT id FROM cards)`).
  Because each subquery is itself RLS-filtered, the single `boards` org check
  propagates down the hierarchy — one source of truth, no per-table org column.
  All three tables are `FORCE`d (the app connects as a non-owner role) and fail
  closed to zero rows when the tenant isn't set, so every CRUD data query in
  `ListsService`/`CardsService`/`CommentsService` runs through
  `runInTenantContext`. The daily `PositionRebalanceService` scan is likewise
  RLS-blind across orgs, so it iterates `organizations` (no RLS) inside one
  advisory-locked transaction and `set_config`s the tenant before each org's
  over-long-column scan. `TenantAccessService` remains as defense-in-depth for
  uniform not-found semantics.
- **Ordering.** Wired. `lists.position_idx` / `cards.position_idx` are Base62
  fractional-index `varchar` keys (the `MigratePositionIdxToFractional`
  migration converts + backfills existing rows in order). `PositionService`
  (`backend/src/common/ordering/position.service.ts`) wraps `FractionalIndexer`;
  Lists/Cards compute an append-to-end key on create (or validate a
  client-supplied key) and validate keys on move. `PositionRebalanceService` is
  a daily `@Cron` that re-spreads any column whose keys exceed 32 chars
  (precision-bloat guard, §3.3.3). `/sync` merges `positionIdx` (and parent
  `listId`/`boardId`) under the same field-level LWW as content fields.
- **Real-time websockets.** Implemented. `backend/src/realtime/` holds the
  Socket.io gateway, the Redis Pub/Sub service, and `BoardEventsService` — the
  service-layer capture point that publishes lightweight `{ cardId, listId,
  positionIdx }` deltas to `board:room:{boardId}` *after* the DB write commits
  (decoupled per §4). `CardsService`/`ListsService` call it; the gateway
  pattern-subscribes and fans frames out to the matching room, with an org
  ownership check on join and a Redis-backed replay log for reconnect
  delta-sync. The client half is `frontend/src/realtime/boardSocketManager.ts`.
- **Frontend.** The branded React SPA and the Zustand optimistic-update store
  are in place, and live frames are wired into the store. With `VITE_API_URL`
  set, `AuthGate` requires JWT login (`POST /auth/login`), hydrates the active
  board via REST (`frontend/src/api/`), and persists DnD moves with optimistic
  UI + rollback on non-2xx (`PATCH /cards/:id` with `beforeCardId`/`afterCardId`
  so the server mints fractional keys — the client never invents them).
  `needsResync` (content WS frames or sync gaps) triggers `refetchBoard` for a
  targeted snapshot instead of a hard reload. `App` mounts `useBoardSocket`
  (`frontend/src/realtime/useBoardSocket.ts`): org comes from the JWT session
  (fallback `VITE_ORG_ID`); WS URL from `VITE_WS_URL` or `VITE_API_URL`. Without
  `VITE_API_URL` the board still runs as an offline demo. Pure logic is
  vitest-tested (`remoteMutations.test.ts`, `mapBoard.test.ts`). Remaining gap:
  migrating drag-and-drop from `@hello-pangea/dnd` to the `.cursorrules`-specified
  `@atlaskit/pragmatic-drag-and-drop`.
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
  logic is unit-tested with vitest (48 tests); the React Native UI and native
  SQLite/NetInfo/Expo wiring live behind injectable ports.
- **Server `/sync` endpoint.** Implemented in `backend/src/sync/`. `sync-merge.ts`
  is the master half of the mobile `mergeRecord` — a pure field-level LWW merge
  (later clock wins; exact ties broken by greater canonical-JSON value, identical
  to the client so both converge; deletion is an LWW tombstone). `SyncService`
  runs it per record inside a tenant transaction, and `SyncController` exposes
  `POST /sync` (tenant from the authenticated JWT). The master carries per-record
  CRDT metadata via the `AddSyncClocks` migration — additive `sync_clocks` (jsonb
  `<field>→epoch-µs`), `node_id`, and `sync_deleted_at` columns on
  `boards`/`lists`/`cards`, mapped on the entities (`bigintToNumber` transformer).
  Jest-tested (mocked DataSource). **v2 / Phase 3 scope:** merges content fields
  plus `positionIdx` and parent refs (`listId`/`boardId`); validates Base62 keys
  via `PositionService`; accepts first-time inserts of offline-created UUID rows
  when the parent is in-org (RLS tenant context). Older clients that omit
  structural fields keep content-only merge behaviour.

When you implement any of the above, follow `.cursorrules` and update this
status list.
