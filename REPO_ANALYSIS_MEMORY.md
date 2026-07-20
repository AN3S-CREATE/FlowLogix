# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase 3 Specialized & Advanced Uplift — **complete** (2026-07-20). Sync v2: `positionIdx` + parent refs under LWW; offline-created inserts via `POST /sync`. Estimated readiness **~84–88/100** (from Phase 2 ~76–80). Phase 1 `bf50683`; Phase 2 `a000402`; Phase 3 committed separately.

## Key Architectural Insights Discovered
- Insight 1: Local datastores via `docker-compose.yml` (Postgres 5432, Mongo 27018 remapped, Redis 6379); all three healthy after bootstrap.
- Insight 2: App health surface is `GET /health` + `GET /health/metrics`; overall `ok` only when Postgres, Redis, and Mongo probes are all up.
- Insight 3: Prod failover design exists in `docker-compose.prod.yml` (3 API replicas, Redis master/replica, Prometheus/Grafana) but was not deployed on this host.
- Insight 4: Host port 27017 occupied by `chat-mongodb`; FlowLogix Mongo on 27018.
- Insight 5: Tenant org comes from JWT (`ActiveOrgId`), not `X-Org-Id` — docs aligned (Phase 1).
- Insight 6: Mongo is probe-only in runtime (`health.probes.ts`); no domain Mongoose/collections usage found.
- Insight 7: Frontend API mode gated on `VITE_API_URL`; without it the offline demo seed still runs.
- Insight 8: Sync v2 merges content + `positionIdx`/`listId`/`boardId`; offline UUID inserts when parent in-org; invalid Base62 keys dropped with clocks.
- Insight 9: Global HTTP `ExceptionFilter` + helmet + throttler wired (Phase 1).
- Insight 10: Card moves use neighbor ids (`beforeCardId`/`afterCardId`); server mints Base62 keys — SPA never invents `positionIdx`.
- Insight 11: `needsResync` auto-calls `refetchBoard()` in API mode (content WS frames / sync gaps).
- Insight 12: Seed user `andries@veralogix.co.za` / `Veralogix#2026` via `npm run seed --workspace backend`.
- Insight 13: Dropped sync fields must also drop clocks — otherwise a high clock with a missing value wins LWW and wipes the server field.

## Files Deeply Reviewed
- Phase 0/1/2 surfaces (auth, health, filters, compose, SPA API)
- `backend/src/sync/sync.service.ts`, `sync-merge.ts`, DTOs + specs
- `mobile/src/crdt/mergeRecord.ts`, `crdt.test.ts`, Watermelon card fields
- `.index/module-summaries/phase0-readiness.md` … `phase3-specialized-uplift.md`

## Open Questions & Areas Needing Investigation
- Q1: Remote production/staging endpoint to probe?
- Q2: Intent for Mongo — keep for future docs or remove from health gate?
- Q3: Approve Nest 11 / Vitest 4 / Vite major upgrade PR for remaining audit critical/high?
- Q4: When to schedule Atlaskit DnD migration?
- Q5: Should `/sync` writes publish board realtime events (parity with CRUD)?

## Decisions Made & Rationale
- Decision: Remap FlowLogix Mongo to host port 27018.
  Rationale: Preserve active `chat-mongodb` on 27017.
- Decision: Phase 0 baseline 60/100; Phase 1 = P2–P4 (+ light P6/P9); Phase 2 = P1+P5; Phase 3 = P7.
  Rationale: Incremental readiness.
- Decision: Do not `npm audit fix --force`.
  Rationale: Remaining fixes require Nest 11 / Vite 8 / Vitest 4 breaking majors.
- Decision: SPA API mode opt-in via `VITE_API_URL` (demo seed otherwise).
  Rationale: Preserve offline demo; avoid breaking local UX without backend.
- Decision: Server mints move keys from neighbor card ids (SPA).
  Rationale: Matches `.cursorrules` — frontend never mints fractional keys.
- Decision: Sync accepts client Base62 `positionIdx` when valid; else mint append on insert / ignore on update.
  Rationale: Never corrupt fractional order; keep offline creates unblocked.
- Decision: Offline sync inserts require UUID id + in-org parent; incomplete payloads stay pending.
  Rationale: Fail closed for multi-tenant safety; no cross-org parent attach.

## Next Immediate Steps
1. Human review of Phase 3 PR/diff on `main`.
2. Phase 4 candidates: Atlaskit DnD; npm majors; prod HA; sync delta-pull; sync→realtime events.
3. Optional: smoke offline create → `/sync` against live Postgres.

## Patterns & Recurring Issues Noticed
- Pattern: Multiple Docker stacks share this host; port/memory contention is operational risk.
- Pattern: Rules/docs converge toward code in Phases 1–3; pragmatic-dnd still pending.
- Recurring Issue: npm critical/high blocked on major upgrades (deferred).

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. FlowLogix infra Red. Memory file created.
- [2026-07-20T20:06+02:00] Cleanup + `.env` with MONGO 27018.
- [2026-07-20T20:16+02:00] Part A bootstrap Green; Phase 0 audit written (60/100).
- [2026-07-20T20:25+02:00] Phase 1 Quick Wins; `/health` ok; 106 backend tests; est. ~68–70/100.
- [2026-07-20T20:35+02:00] Phase 1 committed `bf50683` and pushed to origin/veralogix/an3s/catalyst.
- [2026-07-20T20:45+02:00] Phase 2 SPA REST+JWT + needsResync refetch; 108 backend / 21 frontend tests; smoke login+move ok after seed.
- [2026-07-20T20:55+02:00] Remotes verified at `a000402`; Phase 3 sync positionIdx + offline inserts; 116 backend / 48 mobile tests.
