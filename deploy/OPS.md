# FlowLogix operations runbook

Local and production ops for health, metrics, Compose, and alerts. No secrets.

## Local stack (`docker-compose.yml`)

```bash
cp .env.example .env
docker compose up -d
# Postgres :5432, Mongo :27018 (host remap), Redis :6379
```

| Check | Command / URL |
|-------|----------------|
| Compose health | `docker compose ps` — all services `healthy` |
| API liveness | `GET http://localhost:3000/health` → `status: "ok"` when postgres/redis/mongo probes are up |
| Prometheus text | `GET http://localhost:3000/health/metrics` (`@Public()`, scrapable) |

`GET /health` returns **503** when any probe is down (`status: "degraded"`). Mongo is probe-only today (no domain collections); a bad `MONGO_URI` still fails the overall gate.

## Production stack (`docker-compose.prod.yml`)

Requires a filled `.env.prod` from `.env.prod.example` (JWT, DB, Redis, Grafana admin, TLS paths). **Do not commit `.env.prod`.**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Topology:

| Service | Role |
|---------|------|
| `web` | Nginx TLS edge + SPA; round-robins `api1`–`api3` |
| `api1`–`api3` | NestJS replicas (`NODE_ID` distinct for logs/metrics) |
| `redis-master` / `redis-replica` | Pub/Sub + cache; APIs write to master |
| `postgres` / `mongodb` | Datastores |
| `prometheus` | Scrapes each API `/health/metrics` every 15s; evaluates `deploy/prometheus/alerts.yml` |
| `grafana` | Dashboards from `deploy/grafana/`; default UI port `${GRAFANA_PORT:-3001}` |

HA notes (design only — verify on a real host before calling production-ready):

- Three API replicas behind Nginx; Socket.io fan-out needs Redis Pub/Sub (already wired).
- Redis replica is read-only failover candidate; promote manually if master fails (no Sentinel in this compose).
- Postgres is a single primary; take volume snapshots / managed DB for RPO.

## Prometheus alerts

Rules live in [`deploy/prometheus/alerts.yml`](prometheus/alerts.yml), loaded via `rule_files` in [`prometheus.yml`](prometheus/prometheus.yml). Compose mounts both files read-only into the Prometheus container.

| Alert | Intent |
|-------|--------|
| `FlowLogixDependencyDown` | `flowlogix_dependency_up == 0` for 1m |
| `FlowLogixPostgresHighLatency` | Probe >500ms for 5m |
| `FlowLogixApiHighErrorRate` | 5xx rate >5% for 5m |
| `FlowLogixApiHighLatencyP95` | p95 >1s for 10m |
| `FlowLogixWebsocketPoolSaturated` | Pool >5000 for 10m |
| `FlowLogixInstanceDown` | `up{job="flowlogix-api"} == 0` for 2m |

**How to inspect without Alertmanager:** open Prometheus UI (add a published port locally if needed) → **Alerts**. Optional: configure Alertmanager + a webhook later; Grafana can also create contact points against the provisioned Prometheus datasource (`deploy/grafana/provisioning/datasources/datasource.yml`).

Validate rule syntax offline:

```bash
# If promtool is installed:
promtool check rules deploy/prometheus/alerts.yml
promtool check config deploy/prometheus/prometheus.yml
```

## Grafana

- Datasource: Prometheus at `http://prometheus:9090` (auto-provisioned).
- Overview dashboard: `deploy/grafana/dashboards/flowlogix-overview.json`.
- Default admin password: `GF_SECURITY_ADMIN_PASSWORD` from `.env.prod`.

## CI images

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) on `main`: lint/test backend + frontend (Vitest) + mobile, then push `backend`/`frontend` images to GHCR. Production hosts pull those tags into `docker-compose.prod.yml`.

Optional **E2E smoke stub**: workflow_dispatch with `run_e2e=true` prints the manual checklist (no remote staging URL in-repo yet).

## Suggested health-check cadence

| Cadence | Check |
|---------|--------|
| **Continuous** | Prometheus scrapes `/health/metrics` (15s); evaluate `alerts.yml` |
| **Every deploy / PR to main** | CI `verify` (Jest + Vitest + frontend build) |
| **Daily (ops)** | `GET /health` on each API replica → `status: ok`; skim Prometheus Alerts page |
| **Weekly** | Grafana overview; confirm Redis memory/clients sane; spot-check WS join on a board |
| **Monthly** | Compose.prod failover tabletop (kill one `apiN`, confirm Nginx still serves); review npm audit majors backlog; optional `workflow_dispatch` e2e stub checklist |
| **After schema / sync changes** | Backend sync + health specs; smoke `POST /sync` + SPA move rollback |

## npm audit policy

Do **not** run `npm audit fix --force` on Nest/Vite majors without a dedicated upgrade PR. Remaining critical/high findings are tracked in `.index/module-summaries/phase4-docs-observability-devops.md` and the Phase 5 readiness report (Nest 11 / Vite 8 / Vitest 4 backlog). Prefer `npm audit fix` (non-force) when it stays green.
