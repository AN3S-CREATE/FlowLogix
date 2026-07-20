# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase: Daily System Readiness Sweep (2026-07-20) — complete. Local/dev host probed; FlowLogix stack not running.

## Key Architectural Insights Discovered
- Insight 1: Local datastores are defined in `docker-compose.yml` (Postgres 5432, Mongo 27017, Redis 6379); none of the FlowLogix containers were running at check time.
- Insight 2: App health surface is `GET /health` + `GET /health/metrics` (`backend/src/health/`); overall status is `ok` only when Postgres, Redis, and Mongo probes are all up.
- Insight 3: Prod failover design exists in `docker-compose.prod.yml` (3 API replicas, Redis master/replica, Prometheus/Grafana) but was not deployed/running on this host.
- Insight 4: Host port 27017 is occupied by unrelated `chat-mongodb`; FlowLogix `docker compose up` would conflict without remapping.
- Insight 5: Port 5173 HTTP 200 is Neurologix_V3 Vite — not FlowLogix frontend.

## Files Deeply Reviewed
- `docker-compose.yml` (Summary: local Postgres/Mongo/Redis with healthchecks; volumes for persistence.)
- `docker-compose.prod.yml` (Summary: web TLS edge, api1–3, Redis HA, datastores, Prometheus/Grafana.)
- `backend/src/health/health.controller.ts` / `health.service.ts` (Summary: public multi-DB health + Prometheus metrics.)
- `backend/src/common/ordering/position-rebalance.service.ts` (Summary: daily 3AM cron; requires live Nest + Postgres.)
- `.env.example` / `.env.prod.example` (Summary: templates only; live `.env` / `backend/.env` missing.)

## Open Questions & Areas Needing Investigation
- Q1: Is there a remote production/staging endpoint to probe (beyond this workstation)?
- Q2: Should local Mongo use a non-default port to avoid `chat-mongodb` collision?

## Decisions Made & Rationale
- Decision: Did not start FlowLogix compose during the sweep.
  Rationale: Host RAM ~90% used; Mongo port conflict; starting would risk destabilizing other running containers.

## Next Immediate Steps
1. Free host memory / stop crash-looping `Geologix-AI` if appropriate.
2. Copy `.env.example` → `.env` and `backend/.env.example` → `backend/.env`.
3. Remap Mongo port or stop conflicting container, then `docker compose up -d`.
4. `npm install` at repo root; start backend + frontend; hit `/health`.

## Patterns & Recurring Issues Noticed
- Pattern: Multiple unrelated Docker stacks share this host; port and memory contention is the dominant operational risk.
- Recurring Issue: FlowLogix local env files and `node_modules` absent — workspace not bootstrapped for runtime.

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. Internet OK. FlowLogix infra/apps Red. Memory critical. Canvas report produced. Memory file created.
