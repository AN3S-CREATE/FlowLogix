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
- **Frontend / mobile / websockets.** The React SPA is a minimal scaffold; the
  Zustand optimistic-update, Redis pub/sub websocket, brand palette, and React
  Native / WatermelonDB pieces described in the rules are not implemented yet.

When you implement any of the above, follow `.cursorrules` and update this
status list.
