# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase: Local bootstrap cleanup (2026-07-20 evening) — containers cleaned + env remapped. Next: `docker compose up -d` + npm install.

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

## Decisions Made & Rationale
- Decision: Did not start FlowLogix compose during the sweep.
  Rationale: Host RAM ~90% used; Mongo port conflict; starting would risk destabilizing other running containers.
- Decision: Keep `chat-mongodb` on 27017; remap FlowLogix `MONGO_PORT=27018`.
  Rationale: Chat stack is healthy and in active use (46h uptime); remapping is safer than stopping it.
- Decision: Stop+remove `Geologix-AI` and remove 19 long-exited unused containers; leave chat + update_whatsapp stacks running.
  Rationale: User requested stop unused/crash-looping; active stacks left intact. Volumes not deleted.

## Next Immediate Steps
1. `docker compose up -d` (Postgres 5432, Mongo 27018, Redis 6379).
2. `npm install` at repo root; run migrations; `npm run dev:backend`; hit `/health`.
3. Start FlowLogix frontend on a free port if 5173 still owned by Neurologix.

## Patterns & Recurring Issues Noticed
- Pattern: Multiple unrelated Docker stacks share this host; port and memory contention is the dominant operational risk.
- Recurring Issue: FlowLogix local env files and `node_modules` absent — workspace not bootstrapped for runtime.

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. Internet OK. FlowLogix infra/apps Red. Memory critical. Canvas report produced. Memory file created.
- [2026-07-20T20:06+02:00] Stopped/removed Geologix-AI + 19 exited containers. Created `.env` + `backend/.env` with MONGO_PORT/URI 27018. chat-mongodb kept. RAM ~87–88% used (~3.8–4.1 GB free).
