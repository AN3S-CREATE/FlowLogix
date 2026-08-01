# FlowLogix HA tabletop checklist (no live prod credentials required)

Use this when you cannot run a live production failover drill. Pair with local
`docker compose -f docker-compose.prod.yml config` validation.

## Preconditions

- [x] `.env.prod` filled from `.env.prod.example` (never commit) — local drill copy only
- [x] `METRICS_SECRET` set (Prometheus Bearer scrape)
- [x] TLS certs path (`TLS_CERT_DIR`) exists or is stubbed for config-only checks
- [x] Images buildable or pullable (`IMAGE_TAG`) — config-validated; full image bring-up skipped (RAM)

## Config validation (local)

```bash
# Syntax / interpolation check — does not start containers
docker compose -f docker-compose.prod.yml --env-file .env.prod config > /dev/null

# Optional: start observability only (prometheus + alertmanager + grafana)
# after a full stack is up — see OPS.md
```

Record date + operator + result below.

| Date | Operator | `compose config` | Notes |
|------|----------|------------------|-------|
| 2026-07-20 | Phase 5b agent | **OK** | Validated with temporary `.env.prod.ci` (not committed); Alertmanager + metrics bearer config present |
| 2026-07-20 | Phase 5d agent | **OK** (~293 ms) | Local `.env.prod` from example (gitignored); stub `deploy/certs/` (gitignored); host RAM ~83–86% used — full 3-API+Grafana stack **not** started |

## Live evidence drill (Phase 5d — 2026-07-20)

**Host:** Windows 10, ~31 GB RAM, ~4–5 GB free during drill (~83–86% used). Co-resident: `chat-*`, `update_whatsapp_db-*` (left untouched). FlowLogix local compose datastores + Nest 11 API on `:3000`.

**Why not full `docker-compose.prod.yml` up:** Insufficient free RAM for 3 API replicas + Nginx + Grafana + second Postgres/Mongo/Redis set without risking OOM of co-resident stacks; ports 80/443/5432/6379 already in use by local or other services.

### Timed results (API `GET /health`)

| Step | Action | HTTP | `/health` status | Notes |
|------|--------|-----:|------------------|-------|
| Baseline | — | 200 | `ok` | postgres/redis/mongo up |
| PG down | `docker stop logixflow-postgres` | **503** | degraded | Immediate (~20 ms probe) |
| PG up | `docker start` → healthy ~8–10 s | **200** | `ok` | Full recovery |
| Redis down | `docker stop logixflow-redis` | **503** | degraded | 2nd probe timed out (~8 s) while client hung |
| Redis up | `docker start` → healthy ~8–10 s | **200** | `ok` | Full recovery |
| Mongo down | `docker stop logixflow-mongodb` | **503** | degraded | Default `HEALTH_REQUIRE_MONGO=true` |
| Mongo up | `docker start` → healthy ~8–10 s | **200** | `ok` | Full recovery |
| Post-drill | — | 200 | `ok` | Auth `GET /auth/me` still **401** (guard intact) |

### Redis master/replica smoke (isolated containers, ports 6380/6381)

Spun `fl-drill-redis-master` + `fl-drill-redis-replica` (`--replicaof`, password auth), then removed.

| Check | Result |
|-------|--------|
| Master `INFO replication` | `role:master`, `connected_slaves:1` |
| Replica `ROLE` | `slave` / handshake → replicaof topology confirmed |
| Cleanup | Both containers `docker rm -f`'d; did not touch `logixflow-redis` |

### Observability config load

| Check | Result |
|-------|--------|
| `promtool check rules deploy/prometheus/alerts.yml` (via `prom/prometheus:v2.54.1`) | **SUCCESS: 6 rules found** |
| `amtool check-config` Alertmanager | **SUCCESS** (1 receiver, placeholder webhook) |
| `promtool check config prometheus.yml` standalone | Expected fail without compose-injected `metrics_bearer_token`; OK under prod compose `configs:` |

### Multi-replica API kill (api2)

**Not executed live** — would require building/pulling frontend+backend images and bringing up `api1`–`api3` + `web` under memory pressure. Walked as tabletop below; remains the only topology gap vs a full prod host.

## Tabletop scenarios (walk through verbally / on whiteboard)

### 1. Kill one API replica

| Step | Expected |
|------|----------|
| `docker compose … stop api2` | Nginx continues to `api1`/`api3` |
| `GET /health` via edge | 200 from remaining replicas |
| Socket.io clients | Reconnect; Redis Pub/Sub still fans board rooms |
| Restart `api2` | Joins LB; metrics scrape resumes |

### 2. Redis master blip

| Step | Expected |
|------|----------|
| Pause/stop `redis-master` briefly | Pub/Sub / realtime degrade; CRUD may still work if not Redis-dependent for writes |
| Promote/restart master | Clients reconnect; no Sentinel auto-failover in this compose — **manual** |
| Confirm | Alerts `FlowLogixDependencyDown{dependency="redis"}` if probe fails |

### 3. Postgres unavailable

| Step | Expected |
|------|----------|
| Stop postgres | `/health` → 503 `degraded`; LB marks nodes unhealthy |
| Restore volume / start | Migrations not re-run automatically; app recovers when DB accepts connections |

**Live evidence (local stack):** see Phase 5d table above — 503 → 200 recovery confirmed.

### 4. Metrics / Alertmanager path

| Step | Expected |
|------|----------|
| Scrape without Bearer | API returns **401** on `/health/metrics` |
| Scrape with `METRICS_SECRET` | 200 Prometheus text |
| Fire a test alert | Appears in Prometheus Alerts + Alertmanager (webhook may fail to placeholder — OK) |

**Local note:** Non-prod API without `METRICS_SECRET` returns **200** open scrape (by design). Prod fail-closed path remains compose-wired.

### 5. Mongo optional gate

| Step | Expected |
|------|----------|
| `HEALTH_REQUIRE_MONGO=false`, stop mongodb | `/health` still **ok** if postgres+redis up |
| `HEALTH_REQUIRE_MONGO=true` (default), stop mongodb | `/health` **503** |

**Live evidence:** Default true → mongo stop → **503**; restart → **200 ok**.

## Sign-off

| Item | Status |
|------|--------|
| Live dependency failover/recovery (local prod-equivalent datastores + Nest 11 API) | **Executed** 2026-07-20 |
| Full 3-replica prod compose bring-up | **Skipped** (host RAM / port conflicts) |
| Multi-replica LB kill (`api2`) | Tabletop only — needs dedicated prod/staging host |
| Tabletop reviewed | **Yes** |
| Compose config validated | **Yes** |
| Alert rules + Alertmanager config load | **Yes** |
| Follow-ups | Optional: run same drills against real prod URL / SSH / kube context for edge LB + api2 kill |

Update `.index/module-summaries/phase5d-ha-drill.md` when a real host drill completes.
