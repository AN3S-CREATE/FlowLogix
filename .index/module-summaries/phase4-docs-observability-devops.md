# Phase 4 — Documentation, Observability & DevOps (2026-07-20)

**Status:** Implemented on `main` (commit after Phase 3 `4fb971d`).

**Baseline after Phase 3:** ~84–88/100 → **Estimated after Phase 4: ~90–93/100**

---

## Remote verification (Part A)

| Remote | URL | `main` has `4fb971d` |
|--------|-----|----------------------|
| origin | https://github.com/AN3S-CREATE/FlowLogix.git | Yes (same as an3s) |
| an3s | https://github.com/AN3S-CREATE/FlowLogix.git | Yes |
| veralogix | https://github.com/veralogix-group-innovation/FlowLogix.git | Yes |

No catch-up push required before Phase 4.

> A third mirror (`catalyst`) was also verified at this date. It was **retired
> 2026-07-26** and removed from this table; it is no longer a FlowLogix mirror.
> See `.index/key-decisions.md` and the "Retired remote" note in `AGENTS.md`.

---

## Scope followed (priority order)

| Item | Result |
|------|--------|
| (B) Prometheus alert rules + ops docs | Done — `deploy/prometheus/alerts.yml`, compose mount, `deploy/OPS.md` |
| (C) Board events after sync writes | Done — emit after tenant txn commit via `BoardEventsService` |
| (D) Sync `sinceCheckpoint` delta-pull | Done — org-scoped clock/tombstone query, capped by `MAX_SYNC_CHANGES` |
| (A) npm audit without breaking | Documented — non-force fix leaves Nest11/Vite/webpack majors; **no `--force`** |
| (E) Atlaskit pragmatic DnD | **Deferred** — still `@hello-pangea/dnd`; documented as remaining gap |

---

## What changed (paths)

### Observability / DevOps
- `deploy/prometheus/alerts.yml` — dependency down, PG latency, 5xx rate, p95 latency, WS pool, scrape `up`
- `deploy/prometheus/prometheus.yml` — `rule_files`
- `docker-compose.prod.yml` — mount alerts.yml
- `deploy/OPS.md` — health/metrics/compose.prod/alerts/Grafana/CI runbook

### Sync → realtime + delta-pull
- `backend/src/sync/sync.service.ts` — pending events after commit; `pullSinceCheckpoint`
- `backend/src/sync/sync.module.ts` — imports `RealtimeModule`
- `backend/src/sync/dto/sync.dto.ts` — checkpoint comment updated
- `backend/src/sync/sync.service.spec.ts` — emit + delta-pull specs (+3)

### Docs / index
- `README.md`, `CLAUDE.md`, `REPO_ANALYSIS_MEMORY.md`, `.index/*`, this file

---

## npm audit backlog (safe path)

Do **not** run `npm audit fix --force`. Remaining issues require breaking majors:

| Area | Blocker |
|------|---------|
| NestJS platform / typeorm / schedule / cli | Nest **11** (+ related) |
| Frontend Vite / vitest chain | Vite **8** / Vitest **4** (picomatch via vite) |
| webpack (via `@nestjs/cli`) | Nest CLI 11 |

Track as an isolated upgrade PR; keep main shippable.

---

## Validation

| Check | Result |
|-------|--------|
| Backend Jest | **18 suites / 119 tests passed** |
| Backend build | Green (tsc) |
| Frontend / mobile Vitest | Unchanged surface; run `npm test` in each workspace |
| `GET /health` | 200 `status:ok` (local) |

---

## Estimated score impact

| Category | Before (P3) | After (est.) | Delta | Driver |
|----------|------------:|-------------:|------:|--------|
| Observability | 7/10 | 9/10 | +2 | Alert rules + OPS runbook |
| Documentation | 7–8/10 | 9/10 | +1–2 | OPS + phase report + CLAUDE |
| Architecture | 9/10 | 9–10/10 | +0–1 | Sync→WS + delta-pull |
| Domain | 8–9/10 | 9/10 | +0–1 | Offline sync peers SPA via WS |
| DevOps | 4/5 | 4–5/5 | +0–1 | Prod alerts wired in compose |
| Security (audit) | — | unchanged | 0 | Majors deferred deliberately |
| **Total** | **~84–88** | **~90–93** | **+5–6** | |

---

## Deferred / Phase 5 candidates

1. Live prod HA verify on a real host (compose.prod smoke + failover drill)
2. Isolated Nest 11 / Vite 8 / Vitest 4 upgrade PR for remaining audit critical/high
3. `@atlaskit/pragmatic-drag-and-drop` migration (P8)
4. Alertmanager webhook / Grafana unified contact points
5. Optional: protect `/health/metrics` or scrape-only network ACL
6. e2e smoke in CI (login → move → sync) against compose
7. Mongo retirement vs keep probe-only (open question)
