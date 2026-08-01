# Repository Analysis State — FlowLogix / LogixFlow

## Current Analysis Phase & Progress
Phase 6 — **GitHub Actions stabilization in progress** (2026-08-01). Diagnosis completed, CI/workflow/docs fixes applied locally, and local validation is green in an isolated temp copy. Remote GitHub validation still requires a commit/push from this checkout.
Optional live **prod** HA (`api2` behind LB) — **blocked on credentials / no reachable FlowLogix endpoint** (probed 2026-07-20). No fabricated drill.

**2026-07-26 daily readiness sweep — operational readiness is NOT 100/100.** The 100/100 was a
*codebase* score measured on a provisioned host. This working copy is a **fresh clone made
2026-07-26 04:27** (reflog: `clone: from AN3S-CREATE/FlowLogix`) with no `node_modules`, no `.env`,
no build output, and no running services. A **P1 build blocker** now prevents provisioning it —
see Insight 22. Do **not** quote 100/100 as today's operational state.

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
- Insight 16: Phase 5 → 5b → 5c → 5d: **92 → 97 → 99 → 100/100**.
- Insight 17: Board DnD uses `@atlaskit/pragmatic-drag-and-drop` (+ hitbox).
- Insight 18: Nest 11 needs exact pins + root `overrides` + clean lockfile.
- Insight 19: Nest 11 / Express v5 defaults to `simple` query parser — set `extended` in `main.ts`.
- Insight 20: `@nestjs/jwt@11` + jsonwebtoken@9 require `expiresIn` as `ms.StringValue`.
- Insight 21: Live HA: PG/Redis/Mongo stop → `/health` 503 → restart → 200 ok (~8–10s healthy); host RAM blocks full 3-API prod compose.
- Insight 22 (**P1, 2026-07-26**): `npm ci` fails from a clean clone on **every** platform —
  `EBADPLATFORM @esbuild/netbsd-arm64@0.28.1`. `package-lock.json` carries **26 `@esbuild/*`
  platform packages with `optional: false`**, so npm treats all of them as required. Cause: two
  esbuild majors coexist — `mobile` pins `vitest@^2.1.4` → vite 5 → `esbuild ^0.21.3` (0.21.5),
  while `frontend` pins `vite@^8.1.5`/`vitest@^4.1.10` → `esbuild ^0.27||^0.28` (0.28.1). The
  duplicate nests under `node_modules/esbuild/node_modules/` and npm drops the `optional` flag
  there, plus on three platforms new in 0.28.1 (netbsd-arm64, openbsd-arm64, openharmony-arm64)
  that hoist to the root with no 0.21.5 counterpart. **Regenerating the lockfile does not fix it**
  (npm 11.11.0 reproduces the same 26). **Verified fix:** add `"esbuild": "0.28.1"` to root
  `overrides` → single esbuild copy, 26 entries, **0 non-optional**. Cleaner alternative: bump
  `mobile` to vitest 4 so all workspaces share one vite/esbuild major.
- Insight 23 (**2026-07-26**): CI **masks** Insight 22. `.github/workflows/deploy.yml` runs
  per-workspace `npm install` (`working-directory: backend|frontend|mobile`) and **never** runs
  root `npm ci` — so the committed lockfile is never exercised and its pins are not enforced.
  Green CI ≠ reproducible clean clone.
- Insight 24 (**2026-07-26**, *resolved same day*): Mirror policy (AGENTS.md) was **broken** —
  `veralogix` = `ed97742` (1 behind), `an3s`/origin = `0c85f9f`, `catalyst` = **"Repository not
  found"**; and this clone had only `origin` configured. **Resolved:** owner directed dropping
  catalyst. Policy is now **two mirrors** (`veralogix` + `an3s`); `AGENTS.md` carries a
  "Retired remote — do not re-add" note so a future agent doesn't restore it. GitHub 404s
  identically for deleted and inaccessible-private repos, so the root cause was undiagnosable
  from a clone — recorded as such rather than guessed.
- Insight 25 (**2026-07-26**): No backup capability exists. No `pg_dump`, no backup/restore script,
  no tested restore, no RPO/RTO. `deploy/OPS.md:65` defers it ("take volume snapshots / managed DB").
- Insight 26 (**2026-07-26**): The Mongo 27018 host remap (Insight 4) lived **only** in the
  gitignored `.env`. `.env.example` ships `MONGO_PORT=27017`, which collides with the co-resident
  `chat-mongodb`. A naive `cp .env.example .env && docker compose up -d` will fail to bind.
- Insight 27 (**2026-07-26**): Commit `0c85f9f` has a **corrupt message** — raw `git status` output
  was captured as the commit message.
- Insight 28 (**2026-08-01**): Current `main` is not broken in CI; clean isolated repro passed root
  `npm ci`, backend lint/tests/build, frontend lint/tests/build, mobile type-check/tests, compose
  smoke, and both Docker image builds. The active problem is workflow design, not a failing HEAD.
- Insight 29 (**2026-08-01**): Historical failed runs on `main` come from three already-resolved
  root causes: missing root lockfile for `setup-node` cache, unsupported `vitest --ci` in mobile,
  and a temporary backend lint regression (`_listId` unused). Those failures remain visible in
  GitHub history even after the code is fixed.
- Insight 30 (**2026-08-01**): The repo had only one workflow and it was **not PR-safe**: no
  `pull_request` trigger, per-workspace `npm install` instead of root `npm ci`, no dedicated
  required-check aggregator, and no focused CI documentation.

## Files Deeply Reviewed
- Phase 0–5d surfaces; health ACL; deploy alertmanager/load/HA; board DnD; CI deploy.yml
- `.index/module-summaries/phase5b-gap-closure.md`
- `.index/module-summaries/phase5c-nest11.md`
- `.index/module-summaries/phase5d-ha-drill.md`
- `deploy/HA-TABLETOP.md` (live evidence filled)
- Canvas: `phase5d-ha-drill.canvas.tsx`
- `.github/workflows/deploy.yml`
- `package.json`
- `docs/ci.md`
- `README.md`

## Open Questions & Areas Needing Investigation
- Q1: **BLOCKED on credentials (2026-07-20)** — optional live prod HA (`api2` kill behind LB). No FlowLogix staging/prod API URL reachable; example `app.veralogix.co.za` does not resolve; `api.veralogix.co.za` is Apache 404 on `/health` (not Nest). Local `.env.prod` is localhost stub. Docker Desktop local only; empty kube; SSH aliases `VeraCore`/`TV-Box` exist but are **not** confirmed FlowLogix ops paths — do not use without user OK.
- Q2: (resolved) Mongo — keep + optional health gate.
- Q3: (resolved) Nest 11 dedicated upgrade — done in Phase 5c.
- Q4: (resolved) Atlaskit DnD — done in 5b.
- Q5–Q6: (resolved earlier)
- Q7: (resolved) Live dependency HA drill — done in 5d on local stack.

## Decisions Made & Rationale
- Decision: Remap FlowLogix Mongo to host port 27018.
  Rationale: Preserve active `chat-mongodb` on 27017.
- Decision: Phase 5 locks **92/100**; 5b **97**; 5c **99**; 5d **100/100**.
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
- Decision: Award 100 without full 3-API prod compose bring-up.
  Rationale: Host RAM ~86%; dependency failover is the reliability claim; api2 LB kill remains optional polish.
- Decision: Keep one workflow file but split it into backend/frontend/mobile/CI-health/smoke/publish jobs.
  Rationale: Clear required checks without unnecessary workflow sprawl.
- Decision: Switch GitHub Actions installs to root `npm ci`.
  Rationale: Forces lockfile validation and improves reproducibility/caching.

## Next Immediate Steps
1. **P1 — remote validation.** Commit/push the CI changes, then confirm new `CI & Publish` runs are
   green on push and on a PR-equivalent branch.
2. **P1 — unblock provisioning.** Re-check whether Insight 22 still reproduces against the current
   lockfile on a fresh clone; if it does, apply the proven `esbuild` dedupe fix in the repo.
3. ~~**P1 — restore the mirror invariant.**~~ **Done 2026-07-26.** Catalyst retired by owner
   decision; `veralogix` + `an3s` remotes configured and both brought to the same SHA. Mirror
   policy in `AGENTS.md` is now two-way. Verify with `git ls-remote` on both before calling any
   future push complete.
4. **P2 — host capacity.** C: at 2.8% free (25.7 GB) is causing VSS/shadow-copy failures and a
   failed Windows 11 25H2 install (0x800703EE). Free space before starting Docker Desktop.
5. **P2 — backup.** Author a `pg_dump` + restore procedure with a stated RPO/RTO; add a restore drill
   to the OPS cadence (Insight 25).
6. **P3 — document the Mongo remap.** Set/annotate `MONGO_PORT=27018` in `.env.example` (Insight 26).
7. **P3 — pin Node.** Add `engines.node` matching CI's Node 20; local host runs non-LTS v25.2.1.
8. Await user decision for optional live prod HA: API base URL + replica access + api2-stop
   permission + maintenance window.

## Patterns & Recurring Issues Noticed
- Pattern: npm workspaces can nest/hoist stale Nest majors after bumps — always `npm ls`, delete lock+node_modules if invalid, verify no `backend/node_modules/@nestjs`.
- Pattern: Rules/docs converge; Atlaskit + Nest 11 + HA evidence now aligned.
- Recurring Issue: Host RAM + co-resident containers constrain full prod compose drills.

## Session Log
- [2026-07-20T16:05+02:00] Daily readiness sweep. FlowLogix infra Red. Memory file created.
- [2026-07-20T20:06+02:00] Cleanup + `.env` with MONGO 27018.
- [2026-07-20T20:16+02:00] Part A bootstrap Green; Phase 0 audit written (60/100).
- [2026-07-20T20:25+02:00] Phase 1 Quick Wins; `/health` ok; 106 backend tests; est. ~68–70/100.
- [2026-07-20T20:35+02:00] Phase 1 committed `bf50683` and pushed to origin/veralogix/an3s
  (a third mirror, catalyst, was also pushed at the time — **retired 2026-07-26**, do not push to it).
- [2026-07-20T20:45+02:00] Phase 2 SPA REST+JWT + needsResync refetch; 108 backend / 21 frontend tests; smoke login+move ok after seed.
- [2026-07-20T20:55+02:00] Remotes verified at `a000402`; Phase 3 sync positionIdx + offline inserts; 116 backend / 48 mobile tests.
- [2026-07-20T21:10+02:00] Remotes verified at `4fb971d`; Phase 4 alerts/OPS + sync→WS + delta-pull; 119 backend / 21 frontend / 48 mobile; `/health` ok; committed `a1f30c0` and pushed all remotes.
- [2026-07-20T21:20+02:00] Phase 5: remotes confirmed at `bfc5d41`; re-validation green; final **92/100**; report + CI polish + OPS cadence; committed `6b643e0`/`4ef7056` and pushed all remotes.
- [2026-07-20T21:45+02:00] Phase 5b gap closure: metrics ACL, Alertmanager, Mongo optional, Atlaskit, Vite8/Vitest4, load/HA, CI e2e; Nest11 deferred; **97/100**.
- [2026-07-20T22:10+02:00] Phase 5c Nest 11: clean lockfile + overrides; build/128 tests/lint/health/auth green; score **99/100**; committed `071c7fc`, merged to main, pushed all remotes.
- [2026-07-20T22:25+02:00] Phase 5d HA drill: live PG/Redis/Mongo failover; compose config OK; alerts load; Redis replicaof smoke; **100/100**; docs+canvas; committed `27fd445`, pushed all remotes.
- [2026-07-20T22:27+02:00] Optional live prod HA probe: **blocked**. No FlowLogix public `/health`; no confirmed SSH/kube/docker prod access. Ask-list recorded; no drill, no commit.
- [2026-07-26T05:30+02:00] Daily readiness sweep on a **fresh 04:27 clone**. Found P1 `npm ci`
  EBADPLATFORM blocker (Insight 22) and proved the fix in an isolated copy at
  `d:\_flowlogix-healthcheck` — repo left untouched. Also found CI never runs `npm ci` (23),
  broken 3-remote mirror incl. catalyst 404 (24), zero backup capability (25), lost Mongo 27018
  remap (26), corrupt HEAD commit message (27). Docker Desktop stopped; all service ports closed;
  C: at 2.8% free. Memory + index updated. **No repo fixes applied — awaiting go-ahead.**
- [2026-08-01T11:20+02:00] Phase 6 CI stabilization: wrote a failure diagnosis report, updated
  `.github/workflows/deploy.yml` for push/PR/schedule/manual CI with `CI Health`, added `docs/ci.md`,
  added root `ci:*` scripts, and updated index files. Validated with `actionlint`, local
  `npm run ci:verify`, compose smoke, and Docker image builds in an isolated temp copy. Remote
  GitHub confirmation still pending because no commit/push has been requested in this session.
