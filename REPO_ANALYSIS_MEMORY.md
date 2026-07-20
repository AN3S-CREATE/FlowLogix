# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase 5 Final Validation & Production Readiness — **complete** (2026-07-20). Final score **92/100** (not 100). Phase 1 `bf50683`; Phase 2 `a000402`; Phase 3 `4fb971d`; Phase 4 `a1f30c0` / memory `bfc5d41`; Phase 5 commit after this update. All remotes had Phase 4 SHAs before Phase 5.

## Key Architectural Insights Discovered
- Insight 1: Local datastores via `docker-compose.yml` (Postgres 5432, Mongo 27018 remapped, Redis 6379); all three healthy after bootstrap.
- Insight 2: App health surface is `GET /health` + `GET /health/metrics`; overall `ok` only when Postgres, Redis, and Mongo probes are all up.
- Insight 3: Prod failover design exists in `docker-compose.prod.yml` (3 API replicas, Redis master/replica, Prometheus/Grafana) with Phase 4 alert rules mounted.
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
- Insight 14: Sync publishes board events only *after* tenant txn commit (parity with CRUD; Redis best-effort).
- Insight 15: `sinceCheckpoint > 0` delta-pulls rows whose jsonb clocks or `sync_deleted_at` exceed the checkpoint (org-scoped, capped).
- Insight 16: Phase 5 re-validation: 119/21/48 tests green; `/health` ok; auth 401 smoke; final readiness **92/100**.

## Files Deeply Reviewed
- Phase 0–5 surfaces; sync/realtime/deploy; CI `deploy.yml`
- `.index/module-summaries/phase0-readiness.md` … `phase5-final-readiness.md`
- Canvas: `phase5-final-readiness.canvas.tsx`

## Open Questions & Areas Needing Investigation
- Q1: Remote production/staging endpoint to probe?
- Q2: Intent for Mongo — keep for future docs or remove from health gate?
- Q3: Approve Nest 11 / Vitest 4 / Vite major upgrade PR for remaining audit critical/high?
- Q4: When to schedule Atlaskit DnD migration?
- Q5: (resolved) `/sync` writes publish board realtime events — yes, Phase 4.
- Q6: (resolved) Phase 4 SHAs on all remotes — yes, before Phase 5.

## Decisions Made & Rationale
- Decision: Remap FlowLogix Mongo to host port 27018.
  Rationale: Preserve active `chat-mongodb` on 27017.
- Decision: Phase 0 baseline 60/100; Phases 1–4 incremental; Phase 5 locks **92/100**.
  Rationale: Evidence-based; prefer honest shortfall over fake 100.
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
- Decision: Sync→realtime emits after commit only; boards collection has no WS mutation type (lists/cards only).
  Rationale: Match CRUD decoupling; avoid inventing board.* frame types.
- Decision: Atlaskit DnD deferred past Phase 5.
  Rationale: Non-trivial UI migration; documented as remaining gap (−2 CQ/Domain).
- Decision: Phase 5 CI adds frontend Vitest + workflow_dispatch e2e stub (not full compose e2e).
  Rationale: Close small DevOps/Testing gap without inventing a staging host.

## Next Immediate Steps
1. Human review of Phase 5 report + optional canvas.
2. Future: live HA drill; Nest/Vite majors PR; Atlaskit; Alertmanager; metrics ACL; full e2e; Mongo decision.
3. Follow OPS.md health-check cadence (daily health, weekly Grafana, monthly HA tabletop).

## Patterns & Recurring Issues Noticed
- Pattern: Multiple Docker stacks share this host; port/memory contention is operational risk.
- Pattern: Rules/docs converge toward code in Phases 1–5; pragmatic-dnd still pending.
- Recurring Issue: npm critical/high blocked on major upgrades (deferred; documented in phase4/5 + OPS.md).

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. FlowLogix infra Red. Memory file created.
- [2026-07-20T20:06+02:00] Cleanup + `.env` with MONGO 27018.
- [2026-07-20T20:16+02:00] Part A bootstrap Green; Phase 0 audit written (60/100).
- [2026-07-20T20:25+02:00] Phase 1 Quick Wins; `/health` ok; 106 backend tests; est. ~68–70/100.
- [2026-07-20T20:35+02:00] Phase 1 committed `bf50683` and pushed to origin/veralogix/an3s/catalyst.
- [2026-07-20T20:45+02:00] Phase 2 SPA REST+JWT + needsResync refetch; 108 backend / 21 frontend tests; smoke login+move ok after seed.
- [2026-07-20T20:55+02:00] Remotes verified at `a000402`; Phase 3 sync positionIdx + offline inserts; 116 backend / 48 mobile tests.
- [2026-07-20T21:10+02:00] Remotes verified at `4fb971d`; Phase 4 alerts/OPS + sync→WS + delta-pull; 119 backend / 21 frontend / 48 mobile; `/health` ok; committed `a1f30c0` and pushed all remotes.
- [2026-07-20T21:20+02:00] Phase 5: remotes confirmed at `bfc5d41`; re-validation green; final **92/100**; report + CI polish + OPS cadence.
