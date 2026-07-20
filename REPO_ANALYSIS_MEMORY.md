# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase 1 Quick Wins — **complete** (2026-07-20). Docs JWT alignment, global HTTP filter, helmet, throttling, CI mobile tests. Estimated readiness **~68–70/100** (from Phase 0 baseline 60). Uncommitted; awaiting review. Datastores left running; Nest stopped after `/health` smoke.

## Key Architectural Insights Discovered
- Insight 1: Local datastores via `docker-compose.yml` (Postgres 5432, Mongo 27018 remapped, Redis 6379); all three healthy after bootstrap.
- Insight 2: App health surface is `GET /health` + `GET /health/metrics`; overall `ok` only when Postgres, Redis, and Mongo probes are all up.
- Insight 3: Prod failover design exists in `docker-compose.prod.yml` (3 API replicas, Redis master/replica, Prometheus/Grafana) but was not deployed on this host.
- Insight 4: Host port 27017 occupied by `chat-mongodb`; FlowLogix Mongo on 27018.
- Insight 5: Tenant org comes from JWT (`ActiveOrgId`), not `X-Org-Id` — docs now aligned (Phase 1).
- Insight 6: Mongo is probe-only in runtime (`health.probes.ts`); no domain Mongoose/collections usage found.
- Insight 7: Frontend is demo/localStorage-first; no REST API client; WS optional via `VITE_WS_URL` + `VITE_ORG_ID`; `needsResync` has no auto-refetch.
- Insight 8: Sync v1 merges content fields only; `position_idx` / offline inserts out of scope (CLAUDE.md + sync code).
- Insight 9: Global HTTP `ExceptionFilter` (`APP_FILTER`) + helmet + throttler now wired (Phase 1). WS still uses `WsExceptionFilter`.
- Insight 10: CI verify now includes mobile vitest; remaining npm critical/high need Nest 11 / Vite 8 / Vitest 4 majors (no `--force` in Phase 1).
- Insight 11: Safe `npm audit fix` does not clear the 1 critical + 8 high; audit counts ~35–36 until major upgrades.

## Files Deeply Reviewed
- `docker-compose.yml` / `docker-compose.prod.yml` (local + prod stacks)
- `backend/src/app.module.ts`, `main.ts`, `auth/jwt-auth.guard.ts`, `common/tenant/active-org-id.decorator.ts`
- `backend/src/common/filters/http-exception.filter.ts` (+ spec)
- `backend/src/health/*`, `database/typeorm.config.ts`, migrations (6)
- `backend/package.json` (`migration:run`), root/frontend/mobile `package.json`
- `.github/workflows/deploy.yml`, `deploy/prometheus/prometheus.yml`
- `README.md`, `backend/README.md`, `CLAUDE.md`, `.cursorrules`
- Frontend: `App.tsx`, board DnD (`@hello-pangea/dnd`), store `needsResync`, `persistence.ts`
- `.index/module-summaries/phase0-readiness.md`, `phase1-quick-wins.md`

## Open Questions & Areas Needing Investigation
- Q1: Remote production/staging endpoint to probe?
- Q2: Compliance / SLOs / rubric weight tweaks still unanswered from Phase 0 checkpoint (proceeded on "Apply recommended").
- Q3: Intent for Mongo — keep for future docs or remove from health gate?
- Q4: Approve Nest 11 / Vitest 4 / Vite major upgrade PR for remaining audit critical/high?

## Decisions Made & Rationale
- Decision: Remap FlowLogix Mongo to host port 27018.
  Rationale: Preserve active `chat-mongodb` on 27017.
- Decision: Phase 0 baseline 60/100; Phase 1 = P2–P4 (+ light P6/P9), not P1 SPA rewrite.
  Rationale: User "Apply recommended" → Quick Wins; SPA/sync/HA deferred.
- Decision: Do not `npm audit fix --force`.
  Rationale: Remaining fixes require Nest 11 / Vite 8 / Vitest 4 breaking majors.
- Decision: Stop Nest after `/health` smoke; leave compose up.
  Rationale: Host RAM constrained; datastores needed for next work.
- Decision: No git commit (user did not ask).

## Next Immediate Steps
1. Human review of Phase 1 diff; commit when requested.
2. Phase 2: SPA REST + JWT hydration (P1) then `needsResync` refetch (P5).
3. Separate PR for major dep upgrades to clear npm critical/high.
4. Re-run `npm run dev:backend` when needed; compose already up.

## Patterns & Recurring Issues Noticed
- Pattern: Multiple Docker stacks share this host; port/memory contention is operational risk.
- Pattern: Rules/docs were ahead of or out of sync with code (X-Org-Id fixed in Phase 1; pragmatic-dnd still pending).
- Recurring Issue: Frontend/backend integration incomplete — API mature, SPA still offline demo (Phase 2).

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. FlowLogix infra Red. Memory file created.
- [2026-07-20T20:06+02:00] Cleanup + `.env` with MONGO 27018.
- [2026-07-20T20:16+02:00] Part A bootstrap Green; Phase 0 audit written (60/100).
- [2026-07-20T20:25+02:00] Phase 1 Quick Wins implemented; `/health` ok; 106 backend tests pass; est. ~68–70/100. Memory + phase1 summary updated.
