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
| API liveness | `GET http://localhost:3000/health` → `status: "ok"` when required probes are up |
| Prometheus text | `GET /health/metrics` — open in non-prod without secret; with `METRICS_SECRET` send `Authorization: Bearer …` or `X-Metrics-Secret` |

`GET /health` returns **503** when any *required* probe is down (`status: "degraded"`).

### Mongo keep-vs-retire

Mongo is **probe-only** today (no domain Mongoose/collections). Decision: **keep** the optional dependency for a future document/attachment store, but allow prod to run without it:

| Env | Behaviour |
|-----|-----------|
| `HEALTH_REQUIRE_MONGO=true` (default) | Mongo down → overall `/health` degraded (legacy behaviour) |
| `HEALTH_REQUIRE_MONGO=false` | Mongo still probed + recorded in metrics; does **not** fail the gate. Postgres + Redis remain required. |

### Metrics ACL

| Env | Behaviour |
|-----|-----------|
| `METRICS_SECRET` set | Require Bearer or `X-Metrics-Secret` |
| Unset + `NODE_ENV=production` | **401** (fail closed) |
| Unset + non-production | Open scrape (local dev) |

`/health` stays public for load balancers.

## Production stack (`docker-compose.prod.yml`)

Requires a filled `.env.prod` from `.env.prod.example` (JWT, `METRICS_SECRET`, DB, Redis, Grafana admin, TLS paths). **Do not commit `.env.prod`.**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod config   # validate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Topology:

| Service | Role |
|---------|------|
| `web` | Nginx TLS edge + SPA; round-robins `api1`–`api3` |
| `api1`–`api3` | NestJS replicas (`NODE_ID` distinct for logs/metrics) |
| `redis-master` / `redis-replica` | Pub/Sub + cache; APIs write to master |
| `postgres` / `mongodb` | Datastores (mongo optional via `HEALTH_REQUIRE_MONGO`) |
| `prometheus` | Scrapes each API `/health/metrics` with Bearer `METRICS_SECRET`; evaluates `alerts.yml` |
| `alertmanager` | Receives Prometheus alerts; webhook placeholder in `deploy/alertmanager/alertmanager.yml` |
| `grafana` | Dashboards from `deploy/grafana/`; default UI port `${GRAFANA_PORT:-3001}` |

HA notes + live evidence: [`HA-TABLETOP.md`](HA-TABLETOP.md). Phase 5d (2026-07-20) recorded local dependency failover/recovery on Nest 11; full 3-replica edge stack still needs a dedicated host with free RAM.

- Three API replicas behind Nginx; Socket.io fan-out needs Redis Pub/Sub (already wired).
- Redis replica is read-only failover candidate; promote manually if master fails (no Sentinel in this compose).
- Postgres is a single primary; take volume snapshots / managed DB for RPO.

## Prometheus alerts + Alertmanager

Rules: [`deploy/prometheus/alerts.yml`](prometheus/alerts.yml). Scrapes + alerting block: [`prometheus.yml`](prometheus/prometheus.yml) → `alertmanager:9093`.

| Alert | Intent |
|-------|--------|
| `FlowLogixDependencyDown` | `flowlogix_dependency_up == 0` for 1m |
| `FlowLogixPostgresHighLatency` | Probe >500ms for 5m |
| `FlowLogixApiHighErrorRate` | 5xx rate >5% for 5m |
| `FlowLogixApiHighLatencyP95` | p95 >1s for 10m |
| `FlowLogixWebsocketPoolSaturated` | Pool >5000 for 10m |
| `FlowLogixInstanceDown` | `up{job="flowlogix-api"} == 0` for 2m |

Alertmanager config: [`deploy/alertmanager/alertmanager.yml`](alertmanager/alertmanager.yml) — replace the placeholder webhook URL with Slack/PagerDuty/email. Until then, alerts still evaluate in Prometheus UI and land in Alertmanager's UI.

```bash
# If promtool is installed:
promtool check rules deploy/prometheus/alerts.yml
promtool check config deploy/prometheus/prometheus.yml
```

## Load / SLO smoke

See [`deploy/load/README.md`](load/README.md) — Node `smoke.mjs` and optional k6. Not run on every CI push.

## Grafana

- Datasource: Prometheus at `http://prometheus:9090` (auto-provisioned).
- Overview dashboard: `deploy/grafana/dashboards/flowlogix-overview.json`.
- Default admin password: `GF_SECURITY_ADMIN_PASSWORD` from `.env.prod`.

## CI images

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) on `main`: lint/test backend + frontend (Vitest) + mobile, then push `backend`/`frontend` images to GHCR.

Optional **E2E smoke** (`workflow_dispatch` + `run_e2e=true`): validates `docker-compose.prod.yml` config, starts local datastores, builds backend, curls `GET /health` → `status: ok`.

## Suggested health-check cadence

| Cadence | Check |
|---------|--------|
| **Continuous** | Prometheus scrapes `/health/metrics` (15s) with Bearer; Alertmanager receives firing alerts |
| **Every deploy / PR to main** | CI `verify` (Jest + Vitest + frontend build) |
| **Daily (ops)** | `GET /health` on each API replica → `status: ok`; skim Prometheus/Alertmanager |
| **Weekly** | Grafana overview; Redis memory/clients; WS spot-check |
| **Monthly** | [`HA-TABLETOP.md`](HA-TABLETOP.md) + npm audit majors review; optional `workflow_dispatch` e2e |
| **After schema / sync changes** | Backend sync + health specs; smoke `POST /sync` + SPA move rollback |

## npm audit policy

Do **not** run `npm audit fix --force` on Nest/Vite majors without a dedicated upgrade PR. Prefer incremental upgrades that keep CI green. Remaining Nest 11 / Vite 8 / Vitest 4 debt (if any) is tracked in `.index/module-summaries/phase5b-gap-closure.md`.
