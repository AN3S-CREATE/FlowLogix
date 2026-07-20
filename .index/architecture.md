# Architecture — FlowLogix (LogixFlow)

Collaborative multi-tenant Kanban platform (NestJS API + React SPA + RN offline sync).

## Components

| Layer | Path | Role |
|-------|------|------|
| API | `backend/` | NestJS: boards/lists/cards/comments, JWT auth, RLS tenant context, `/sync`, Socket.io realtime |
| Web | `frontend/` | React + Vite + Tailwind + Zustand; JWT+REST hydrate when `VITE_API_URL` set; optional WS; offline demo otherwise |
| Mobile | `mobile/` | Offline-first CRDT sync + attachment queue (WatermelonDB ports) |
| Local data | `docker-compose.yml` | Postgres :5432, MongoDB :27018 (host remap), Redis :6379 |
| Prod stack | `docker-compose.prod.yml` | Nginx TLS, 3 API replicas, Redis master/replica, Prometheus, Grafana |
| Observability | `deploy/` | Prometheus scrape + alert rules + Grafana dashboard provisioning; `OPS.md` runbook |

## Data / isolation

- Tenant via JWT `orgId` (`ActiveOrgId` decorator) — **not** client `X-Org-Id`.
- Postgres RLS on boards → lists → cards → comments (chained membership); app connects as `logixflow_app`.
- Ordering: Base62 fractional `position_idx` via `FractionalIndexer` / `PositionService`.
- Realtime: DB write commits → Redis Pub/Sub → `board:room:{boardId}` → Socket.io.
- Mongo: used by health probe only today (no domain collections found).

## Health

- `GET /health` — Postgres + Redis + Mongo probes; 503 if any *required* probe is down.
- Mongo optional via `HEALTH_REQUIRE_MONGO=false` (still probed/recorded; keep for future docs store).
- `GET /health/metrics` — Prometheus exposition; ACL via `METRICS_SECRET` (Bearer / `X-Metrics-Secret`). Public only in non-prod when secret unset.

## HTTP hardening (Phase 1)

- Global `HttpExceptionFilter` (`APP_FILTER`); `helmet` headers in `main.ts`.
- `@nestjs/throttler`: 100 req/min default; login 10/min; health skipped.

## Readiness

- Phase 0 baseline: **60/100** — see `.index/module-summaries/phase0-readiness.md`.
- Phase 1 Quick Wins: **~68–70/100** (est.) — see `.index/module-summaries/phase1-quick-wins.md`.
- Phase 2 Core Hardening: **~76–80/100** (est.) — see `.index/module-summaries/phase2-core-hardening.md`.
- Phase 3 Specialized uplift: **~84–88/100** (est.) — sync `positionIdx` + offline inserts; see `phase3-specialized-uplift.md`.
- Phase 4 Docs/observability/DevOps: **~90–93/100** (est.) — alerts, sync→WS, delta-pull; see `phase4-docs-observability-devops.md`.
- Phase 5 Final validation: **92/100** — see `phase5-final-readiness.md`.
- Phase 5b Gap closure: **97/100** — see `phase5b-gap-closure.md`.
- Phase 5c Nest 11: **99/100** — see `phase5c-nest11.md` (not 100; live HA remain).

## Frontend API mode (Phase 2)

- `VITE_API_URL` → login gate, REST board hydrate, PATCH moves, `needsResync` → `refetchBoard`.
- WS org from JWT session; URL from `VITE_WS_URL` or API origin.
- Card moves send neighbor ids; Nest mints Base62 `position_idx`.

## Sync v2 (Phase 3–4)

- `POST /sync` LWW includes `positionIdx` + `listId`/`boardId` (validated, tenant-scoped).
- Offline-created UUID inserts when parent is in-org; older content-only clients unchanged.
- `sinceCheckpoint > 0` delta-pulls org-scoped rows with newer clocks/tombstones.
- List/card sync writes emit board realtime events after commit (CRUD parity).
