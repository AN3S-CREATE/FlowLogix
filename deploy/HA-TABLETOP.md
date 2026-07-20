# FlowLogix HA tabletop checklist (no live prod credentials required)

Use this when you cannot run a live production failover drill. Pair with local
`docker compose -f docker-compose.prod.yml config` validation.

## Preconditions

- [ ] `.env.prod` filled from `.env.prod.example` (never commit)
- [ ] `METRICS_SECRET` set (Prometheus Bearer scrape)
- [ ] TLS certs path (`TLS_CERT_DIR`) exists or is stubbed for config-only checks
- [ ] Images buildable or pullable (`IMAGE_TAG`)

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

### 4. Metrics / Alertmanager path

| Step | Expected |
|------|----------|
| Scrape without Bearer | API returns **401** on `/health/metrics` |
| Scrape with `METRICS_SECRET` | 200 Prometheus text |
| Fire a test alert | Appears in Prometheus Alerts + Alertmanager (webhook may  fail to placeholder — OK) |

### 5. Mongo optional gate

| Step | Expected |
|------|----------|
| `HEALTH_REQUIRE_MONGO=false`, stop mongodb | `/health` still **ok** if postgres+redis up |
| `HEALTH_REQUIRE_MONGO=true` (default), stop mongodb | `/health` **503** |

## Sign-off

| Item | Status |
|------|--------|
| Live prod HA drill | **Not executed** (no prod credentials / host in-repo) |
| Tabletop reviewed | Yes / No |
| Compose config validated | Yes / No |
| Follow-ups | ________________ |

Update `.index/module-summaries/phase5b-gap-closure.md` when a real host drill completes.
