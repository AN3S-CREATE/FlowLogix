# LogixFlow Backend

NestJS + TypeORM API on PostgreSQL.

## Data model

| Table            | Key fields                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------------|
| `organizations`   | `id`, `name`, `domain`, `created_at`, `updated_at`                                                   |
| `users`           | `id`, `org_id`, `email`, `password_hash`, `first_name`, `last_name`, `avatar_url`, `timezone`, `locale`, `is_active`, `created_at` |
| `boards`          | `id`, `org_id`, `title`, `description`, `visibility`, `bg_properties` (jsonb), `created_by`, `created_at`, `updated_at` |
| `board_members`   | `board_id`, `user_id`, `role`, `joined_at` — composite PK `(board_id, user_id)`                     |
| `lists`           | `id`, `board_id`, `title`, `position_idx`, `is_archived`, `created_at`, `updated_at`                |
| `cards`           | `id`, `list_id`, `title`, `description`, `position_idx`, `due_date`, `is_complete`, `is_archived`, `custom_fields` (jsonb), `created_at`, `updated_at` |
| `card_members`    | `card_id`, `user_id` — composite PK `(card_id, user_id)`                                            |
| `comments`        | `id`, `card_id`, `user_id`, `text_content`, `created_at`, `updated_at`                              |

Ids are `uuid` (`gen_random_uuid()`). `organizations`, `boards`, `lists`, `cards`, and
`comments` auto-maintain `updated_at` via a Postgres trigger. All child tables
cascade-delete with their parent (`created_by` on `boards` is `ON DELETE SET NULL`).

## Migrations

```bash
npm run migration:run       # apply
npm run migration:revert    # roll back the last migration
npm run migration:generate -- src/database/migrations/SomeName   # after entity changes
```

`1783940430113-InitSchema` creates the schema from the TypeORM entities.
`1783940500000-EnableRlsAndTriggers` creates the `updated_at` triggers, the
non-superuser `logixflow_app` role the running app connects as, and the
Row-Level Security policy on `boards` (see below).

## Data model & tenant isolation

Every tenant-scoped table is reachable only through its org: `users` and
`boards` carry `org_id` directly; `lists`, `cards`, `board_members`,
`card_members`, and `comments` are scoped transitively through the
board/list/card they belong to.

Callers identify the active tenant with an `X-Org-Id: <uuid>` header on every
request to a tenant-scoped endpoint (`organizations/*`, `users/*`, `boards/*`,
and everything nested under a board — lists, cards, members, comments). The
`ActiveOrgId` decorator (`src/common/tenant/active-org-id.decorator.ts`)
validates and extracts it; a missing or malformed header is rejected with
`400` before any query runs.

Isolation is enforced at two layers:

1. **Application layer** — every service query filters by `org_id` directly
   (`users`, `boards`) or by walking the ownership chain up to the owning
   board (`TenantAccessService.assertBoardInOrg` / `assertListInOrg` /
   `assertCardInOrg`), returning `404` rather than leaking existence of a
   resource that belongs to another org.
2. **Database layer (`boards` only)** — `boards` has Row-Level Security
   enabled and `FORCE`d:

   ```sql
   CREATE POLICY boards_tenant_isolation ON boards
     USING (org_id = current_setting('app.current_tenant_id', true)::uuid)
     WITH CHECK (org_id = current_setting('app.current_tenant_id', true)::uuid);
   ```

   `current_setting(..., true)` returns `NULL` when unset, so a query that
   forgets to set the tenant sees zero rows instead of leaking across
   tenants (fail closed).

RLS is bypassed by Postgres for superusers and for a table's own owner,
*even with `FORCE ROW LEVEL SECURITY`*. Since `docker-compose`'s
`POSTGRES_USER` is a superuser (the Postgres image always bootstraps it that
way), the migration also creates an unprivileged `logixflow_app` role
(`APP_DB_USER` / `APP_DB_PASSWORD` env vars) with `GRANT`-only access, and
the running app connects as that role instead — `POSTGRES_USER` is only used
by migrations, which need DDL rights. `BoardsService` and
`TenantAccessService.assertBoardInOrg` run their board queries inside
`runInTenantContext` (`src/common/tenant/tenant-transaction.util.ts`), which
opens a transaction and does `SELECT set_config('app.current_tenant_id', $1, true)`
(the `SET LOCAL` equivalent) before querying — required because `SET LOCAL`
only lasts for the transaction it's issued in.

You can verify the policy directly with `psql`:

```sql
-- as logixflow_app, no tenant set: 0 rows
SELECT count(*) FROM boards;

-- as logixflow_app, tenant set: only that org's boards
BEGIN;
SELECT set_config('app.current_tenant_id', '<org-uuid>', true);
SELECT * FROM boards;
COMMIT;
```
