# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase 5c NestJS 11 upgrade — **complete** (2026-07-20). Score **99/100** (was 97). Nest 11.1.28 shipped with clean lockfile + root overrides. Live prod HA still open (~1 pt).

## Key Architectural Insights Discovered
- Insight 1: Local datastores via `docker-compose.yml` (Postgres 5432, Mongo 27018 remapped, Redis 6379); all three healthy after bootstrap.
- Insight 2: `/health` gates on *required* probes; Mongo optional via `HEALTH_REQUIRE_MONGO=false`.
- Insight 3: Prod failover design in `docker-compose.prod.yml` + Alertmanager; Prometheus scrapes with Bearer `METRICS_SECRET`.
- Insight 4: Host port 27017 occupied by `chat-mongodb`; FlowLogix Mongo on 27018.
- Insight 5: Tenant org comes from JWT (`ActiveOrgId`), not `X-Org-Id`.
- Insight 6: Mongo is probe-only (no domain collections) — **kept** for future docs/attachments.
- Insight 7: Frontend API mode gated on `VITE_API_URL`.
- Insight 8: Sync v2 merges content + `positionIdx`/`listId`/`boardId`.
- Insight 9: Global HTTP `ExceptionFilter` + helmet + throttler wired.
- Insight 10: Card moves use neighbor ids; server mints Base62 keys.
- Insight 11: `needsResync` → `refetchBoard()` in API mode.
- Insight 12: Seed user `andries@veralogix.co.za` / `Veralogix#2026`.
- Insight 13: Dropped sync fields must also drop clocks.
- Insight 14: Sync publishes board events only after tenant txn commit.
- Insight 15: `sinceCheckpoint > 0` delta-pulls org-scoped newer rows.
- Insight 16: Phase 5 locked **92/100**; Phase 5b closed gaps → **97/100**; Phase 5c Nest 11 → **99/100**.
- Insight 17: Board DnD uses `@atlaskit/pragmatic-drag-and-drop` (+ hitbox).
- Insight 18: Nest 11 needs exact pins + root `overrides` + clean lockfile; partial upgrade left Nest 10 hoisted and broke build.
- Insight 19: Nest 11 / Express v5 defaults to `simple` query parser — set `extended` in `main.ts`.
- Insight 20: `@nestjs/jwt@11` + jsonwebtoken@9 require `expiresIn` as `ms.StringValue`, not plain `string`.

## Files Deeply Reviewed
- Phase 0–5c surfaces; health ACL; deploy alertmanager/load/HA; board DnD; CI deploy.yml
- `.index/module-summaries/phase5b-gap-closure.md`
- `.index/module-summaries/phase5c-nest11.md`
- Canvas: `phase5b-gap-closure.canvas.tsx`

## Open Questions & Areas Needing Investigation
- Q1: Remote production/staging endpoint to probe?
- Q2: (resolved) Mongo — keep + optional health gate.
- Q3: (resolved) Nest 11 dedicated upgrade — done in Phase 5c.
- Q4: (resolved) Atlaskit DnD — done in 5b.
- Q5–Q6: (resolved earlier)

## Decisions Made & Rationale
- Decision: Remap FlowLogix Mongo to host port 27018.
  Rationale: Preserve active `chat-mongodb` on 27017.
- Decision: Phase 5 locks **92/100**; Phase 5b **97/100**; Phase 5c **99/100**.
  Rationale: Evidence-based; only live HA remains for 100.
- Decision: Nest 11 via feature branch then merge to main when green.
  Rationale: Avoid half-state on main; prior nested-module failure.
- Decision: Root npm `overrides` for Nest 11 + rxjs 7.8.2.
  Rationale: Prevent workspace dedupe from leaving Nest 10 copies.
- Decision: Keep Mongo; `HEALTH_REQUIRE_MONGO=false` optional.
  Rationale: Least-breaking vs retire; future docs store.
- Decision: Metrics ACL via `METRICS_SECRET` (prod fail-closed).
  Rationale: `/health` public for LB; scrapes authenticated.
- Decision: SPA API mode opt-in via `VITE_API_URL`.
  Rationale: Preserve offline demo.
- Decision: Server mints move keys from neighbor card ids.
  Rationale: Matches `.cursorrules`.

## Next Immediate Steps
1. Human review of Phase 5c Nest 11 report.
2. Future: live HA drill on real host; wire Alertmanager webhook for real.
3. Follow OPS.md cadence.

## Patterns & Recurring Issues Noticed
- Pattern: npm workspaces can nest/hoist stale Nest majors after bumps — always `npm ls`, delete lock+node_modules if invalid, verify no `backend/node_modules/@nestjs`.
- Pattern: Rules/docs converge; Atlaskit + Nest 11 now aligned.
- Recurring Issue: (closed) Nest majors; Vite majors closed in 5b.

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. FlowLogix infra Red. Memory file created.
- [2026-07-20T20:06+02:00] Cleanup + `.env` with MONGO 27018.
- [2026-07-20T20:16+02:00] Part A bootstrap Green; Phase 0 audit written (60/100).
- [2026-07-20T20:25+02:00] Phase 1 Quick Wins; `/health` ok; 106 backend tests; est. ~68–70/100.
- [2026-07-20T20:35+02:00] Phase 1 committed `bf50683` and pushed to origin/veralogix/an3s/catalyst.
- [2026-07-20T20:45+02:00] Phase 2 SPA REST+JWT + needsResync refetch; 108 backend / 21 frontend tests; smoke login+move ok after seed.
- [2026-07-20T20:55+02:00] Remotes verified at `a000402`; Phase 3 sync positionIdx + offline inserts; 116 backend / 48 mobile tests.
- [2026-07-20T21:10+02:00] Remotes verified at `4fb971d`; Phase 4 alerts/OPS + sync→WS + delta-pull; 119 backend / 21 frontend / 48 mobile; `/health` ok; committed `a1f30c0` and pushed all remotes.
- [2026-07-20T21:20+02:00] Phase 5: remotes confirmed at `bfc5d41`; re-validation green; final **92/100**; report + CI polish + OPS cadence; committed `6b643e0`/`4ef7056` and pushed all remotes.
- [2026-07-20T21:45+02:00] Phase 5b gap closure: metrics ACL, Alertmanager, Mongo optional, Atlaskit, Vite8/Vitest4, load/HA, CI e2e; Nest11 deferred; **97/100**.
- [2026-07-20T22:10+02:00] Phase 5c Nest 11: clean lockfile + overrides; build/128 tests/lint/health/auth green; score **99/100**.
