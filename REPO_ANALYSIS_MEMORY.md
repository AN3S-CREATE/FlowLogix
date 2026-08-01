# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Enhanced Production Readiness Audit — **Phase 0 complete** (2026-07-22). Fresh baseline **86/100**. **STOP** — awaiting user scope confirmation before Phase 1+. Prior Phase 5d **100/100** retained as uplift-history claim (local), not as Enhanced baseline.

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
- Insight 16: Phase 5 → 5b → 5c → 5d: **92 → 97 → 99 → 100/100** (local uplift campaign).
- Insight 17: Board DnD uses `@atlaskit/pragmatic-drag-and-drop` (+ hitbox).
- Insight 18: Nest 11 needs exact pins + root `overrides` + clean lockfile.
- Insight 19: Nest 11 / Express v5 defaults to `simple` query parser — set `extended` in `main.ts`.
- Insight 20: `@nestjs/jwt@11` + jsonwebtoken@9 require `expiresIn` as `ms.StringValue`.
- Insight 21: Live HA: PG/Redis/Mongo stop → `/health` 503 → restart → 200 ok (~8–10s healthy); host RAM blocks full 3-API prod compose.
- Insight 22 (2026-07-22): Enhanced Phase 0 re-scores **86/100** — local evidence still green; deducts for blocked remote deploy (NEST), unverified full prod compose, placeholder Alertmanager, optional e2e, no SSO, mobile module-only.
- Insight 23 (2026-07-22): `npm audit` backend+frontend workspaces report **0** vulnerabilities (improved vs early Phase 0).
- Insight 24 (2026-07-22): FlowLogix API already on `:3000` with `/health` 200; compose ~45h healthy.

## Files Deeply Reviewed
- Phase 0–5d surfaces; health ACL; deploy alertmanager/load/HA; board DnD; CI deploy.yml
- `.index/module-summaries/phase5b-gap-closure.md`
- `.index/module-summaries/phase5c-nest11.md`
- `.index/module-summaries/phase5d-ha-drill.md`
- `.index/module-summaries/phase0-readiness-2026-07-22.md` (Enhanced Phase 0 baseline **86/100**)
- `deploy/HA-TABLETOP.md` (live evidence filled)
- Canvas: `phase5d-ha-drill.canvas.tsx`; `phase0-readiness-2026-07-22.canvas.tsx`

## Open Questions & Areas Needing Investigation
- Q1: **BLOCKED on credentials / access (2026-07-20, still 2026-07-22)** — optional live prod HA / NEST deploy. No FlowLogix staging/prod API URL reachable; NEST Tailscale host has no SSH from agent; do not password-spray. Ask user for unlock + preferred remoting path.
- Q2: (resolved) Mongo — keep + optional health gate.
- Q3: (resolved) Nest 11 dedicated upgrade — done in Phase 5c.
- Q4: (resolved) Atlaskit DnD — done in 5b.
- Q5–Q6: (resolved earlier)
- Q7: (resolved) Live dependency HA drill — done in 5d on local stack.
- Q8 (2026-07-22): User must confirm Enhanced audit scope (local vs NEST vs other), rubric weights, exclusions (SSO/tracing/RN), SLOs, Phase 1 preference.

## Decisions Made & Rationale
- Decision: Remap FlowLogix Mongo to host port 27018.
  Rationale: Preserve active `chat-mongodb` on 27017.
- Decision: Phase 0–5d campaign locked **60 → … → 100/100** on local uplift evidence.
  Rationale: Evidence-based; final point from live degrade/recover, not remote URL.
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
- Decision: Award Phase 5d 100 without full 3-API prod compose bring-up.
  Rationale: Host RAM ~86%; dependency failover is the reliability claim; api2 LB kill remains optional polish.
- Decision (2026-07-22): Enhanced Phase 0 baseline **86/100**; supersedes 100 as *active* readiness score until user confirms scope/weights.
  Rationale: Honest production-deploy posture; no silent overwrite of history (new dated report).
- Decision (2026-07-22): Do not retry NEST password auth / SSH spray.
  Rationale: Prior account lockout; user instruction.

## Next Immediate Steps
1. Await user answers to Phase 0 confirmation questions (deploy target, weights, exclusions, SLOs, NEST unlock, alert webhook, Phase 1 preference).
2. Until confirmation: **no Phase 1–5 remediations**.
3. Keep local compose running; leave Nest API as found if already serving `/health`.
4. (2026-07-22 reconfirm) Baseline **86/100** re-validated unchanged — do not re-score without new evidence.

## Patterns & Recurring Issues Noticed
- Pattern: npm workspaces can nest/hoist stale Nest majors after bumps — always `npm ls`, delete lock+node_modules if invalid, verify no `backend/node_modules/@nestjs`.
- Pattern: Rules/docs converge; Atlaskit + Nest 11 + HA evidence now aligned.
- Recurring Issue: Host RAM + co-resident containers constrain full prod compose drills.
- Recurring Issue: Remote deploy paths (NEST / public URL) remain the largest ops gap vs local Green.

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
- [2026-07-20T22:10+02:00] Phase 5c Nest 11: clean lockfile + overrides; build/128 tests/lint/health/auth green; score **99/100**; committed `071c7fc`, merged to main, pushed all remotes.
- [2026-07-20T22:25+02:00] Phase 5d HA drill: live PG/Redis/Mongo failover; compose config OK; alerts load; Redis replicaof smoke; **100/100**; docs+canvas; committed `27fd445`, pushed all remotes.
- [2026-07-20T22:27+02:00] Optional live prod HA probe: **blocked**. No FlowLogix public `/health`; no confirmed SSH/kube/docker prod access. Ask-list recorded; no drill, no commit.
- [2026-07-21T12:07+02:00] NEST deploy attempt blocked (no SSH; account lockout). Documented in memory.
- [2026-07-22T19:05+02:00] Part A: compose already healthy; `/health` 200; tests 128/23/48 PASS; NEST still blocked (no retry). Enhanced Phase 0 written **86/100**; canvas + index refresh. Awaiting scope confirmation.
- [2026-07-22T19:32+02:00] User re-sent Phase 0 prompt (no answers). Part A re-applied: compose ~45h healthy; `/health` 200; auth/me 401; 128/23/48 PASS; prod config OK; NEST 22/80/443 closed (8081 only). **Confirmed unchanged — 86/100 retained**; report + canvas reconfirmation stamp. **STOP** — no Phase 1.

## NEST deploy attempt (2026-07-21 12:07) — still blocked 2026-07-22
- Host: nest-1 Tailscale IP 100.117.250.123 (active via Tailscale).
- Reachability: TCP 22 closed; 3389 RDP open; 5985 WinRM open; 80/443 closed; 8081 open (existing platform-api health, not FlowLogix); 6379 Redis open; 27017 Mongo open.
- Auth: SSH unavailable. WinRM remoting blocked from agent (TrustedHosts needs local elevation; NTLM creds rejected). SMB file shares were briefly readable (andries_development, Users) without successful admin C$; later SMB became Access Denied after account lockout from failed logon attempts.
- FlowLogix clone observed earlier at share path andries_development\andries_github\FlowLogix (main, remotes configured); .env.prod already present on host (remote-local). CORS was localhost at observation time.
- Docker Desktop present on NEST (named pipe only; no TCP engine). Deploy via docker compose not completed — no remote command execution path from agent.
- FlowLogix HTTP health on :80/:443: not up.
- Action needed: unlock locked account(s) on NEST; enable OpenSSH Server or Tailscale SSH / allow WinRM for a known admin; RDP and run compose; rotate any passwords shared in chat.
- **2026-07-22:** No password spray / SSH retry performed per user instruction.
