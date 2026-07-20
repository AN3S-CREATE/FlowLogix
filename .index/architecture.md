# Architecture — FlowLogix (LogixFlow)

Collaborative multi-tenant Kanban platform (NestJS API + React SPA + RN offline sync).

## Components

| Layer | Path | Role |
|-------|------|------|
| API | `backend/` | NestJS: boards/lists/cards/comments, JWT auth, RLS tenant context, `/sync`, Socket.io realtime |
| Web | `frontend/` | React + Vite + Tailwind + Zustand |
| Mobile | `mobile/` | Offline-first CRDT sync + attachment queue (WatermelonDB ports) |
| Local data | `docker-compose.yml` | Postgres, MongoDB, Redis |
| Prod stack | `docker-compose.prod.yml` | Nginx TLS, 3 API replicas, Redis master/replica, Prometheus, Grafana |
| Observability | `deploy/` | Prometheus scrape config + Grafana dashboard provisioning |

## Data / isolation

- Tenant via `org_id` / `X-Org-Id`; Postgres RLS on boards → lists → cards → comments (chained membership).
- Ordering: Base62 fractional `position_idx` via `FractionalIndexer` / `PositionService`.
- Realtime: DB write commits → Redis Pub/Sub → `board:room:{boardId}` → Socket.io.

## Health

- `GET /health` — Postgres + Redis + Mongo probes; 503 if degraded.
- `GET /health/metrics` — Prometheus exposition.
