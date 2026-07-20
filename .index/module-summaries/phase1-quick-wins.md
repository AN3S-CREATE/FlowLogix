# Phase 1 — Quick Wins (2026-07-20)

**Status:** Implemented (uncommitted). Ready for human review.

**Baseline (Phase 0):** 60/100 → **Estimated after Phase 1: ~68–70/100**

---

## Scope followed

From Phase 0 gaps **P2–P4** (+ light **P6** CI / **P9** docs). Deferred P1/P5/P7/P8/P10 to later phases.

| Item | Result |
|------|--------|
| P4 Stale `X-Org-Id` docs | Fixed — JWT Bearer + `ActiveOrgId` in root/`backend` README; frontend persistence comment; Mongo port/role clarified |
| P3 Global HTTP filter + headers + rate limit | Done — `HttpExceptionFilter`, `helmet`, `@nestjs/throttler` |
| P2 npm audit critical/high | Partial — safe `npm audit fix` cannot clear remaining without Nest 11 / Vite 8 / Vitest 4 majors (deferred) |
| P6 CI mobile smoke | Done — mobile vitest step in `.github/workflows/deploy.yml` |
| P9 Mongo clarification | Docs only — probe-only + host port 27018 |

---

## What changed (paths)

### Backend security / quality
- `backend/src/common/filters/http-exception.filter.ts` — global HTTP filter (masks unexpected 500s)
- `backend/src/common/filters/http-exception.filter.spec.ts` — 4 unit tests
- `backend/src/app.module.ts` — `APP_FILTER` + `ThrottlerModule` + `ThrottlerGuard` (100/min)
- `backend/src/main.ts` — `helmet` (CSP off for API; CORP cross-origin)
- `backend/src/health/health.controller.ts` — `@SkipThrottle()`
- `backend/src/auth/auth.controller.ts` — login `@Throttle` 10/min
- `backend/package.json` — deps `@nestjs/throttler`, `helmet`

### Docs / CI / status
- `README.md` — JWT auth; Mongo probe-only :27018
- `backend/README.md` — JWT tenant; RLS covers boards→lists→cards→comments
- `frontend/src/store/persistence.ts` — Bearer comment (no `X-Org-Id`)
- `.github/workflows/deploy.yml` — mobile install + vitest in verify job
- `CLAUDE.md` — HTTP hardening status bullet

### Index / memory
- `.index/module-summaries/phase1-quick-wins.md` (this file)
- `REPO_ANALYSIS_MEMORY.md`, `.index/*` refreshed

---

## Deferred (explicit)

| Gap | Why deferred |
|-----|----------------|
| P1 SPA REST + JWT hydration | Phase 2 — medium effort, high risk |
| P5 `needsResync` → board refetch | Phase 2 — depends on REST client |
| P2 remaining npm vulns (1 critical vitest, 8 high) | Need `--force` majors: Nest 11, Vite 8, Vitest 4 — dedicated upgrade PR |
| P7 Sync `position_idx` + offline inserts | Phase 3 — large |
| P8 Atlaskit pragmatic DnD | Phase 2/3 — medium UI migration |
| P10 Prod HA verify + alert rules | Needs live/prod compose — not this host |

---

## npm audit

| Moment | Total | Critical | High | Notes |
|--------|------:|---------:|-----:|-------|
| Phase 0 baseline | 35 | 1 | 8 | Pre-Phase-1 |
| After `helmet`/`throttler` install + safe `npm audit fix` | 36 | 1 | 8 | Safe fix cannot clear majors; no `--force` used |

Remaining critical: `vitest` (fix → 4.1.10). High: mostly transitive via `@nestjs/cli` / `@nestjs/platform-express` / `vite` requiring major bumps.

---

## Validation

| Check | Result |
|-------|--------|
| Backend Jest | **17 suites / 106 tests passed** (was 16 / ~23+ prior; +filter specs) |
| `tsc -p backend/tsconfig.build.json --noEmit` | Pass |
| Compose datastores | postgres/redis/mongo healthy |
| `GET /health` after changes | **200** `status:ok` (pg/redis/mongo up) |
| Helmet headers on `/health` | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, HSTS, CORP present |
| Nest stopped after smoke | Yes (RAM) |

---

## Estimated score impact

| Category | Before | After (est.) | Delta | Driver |
|----------|-------:|-------------:|------:|--------|
| Code Quality | 7/10 | 8/10 | +1 | Global `APP_FILTER` |
| Security | 8/15 | 10–11/15 | +2–3 | Helmet + throttle; audit backlog still open |
| Documentation | 5/10 | 8/10 | +3 | JWT/`ActiveOrgId` + Mongo/RLS docs aligned |
| DevOps | 3/5 | 4/5 | +1 | Mobile vitest in CI verify |
| Others | unchanged | — | 0 | SPA/sync/HA deferred |
| **Total** | **60** | **~68–70** | **+8–10** | |

---

## Ready for review? / Phase 2 candidates

**Ready for review:** Yes — small, reviewable diff; no commit (user did not ask).

**Phase 2 candidates (recommended order):**
1. SPA REST client + JWT login/session (P1)
2. `needsResync` → targeted board refetch (P5)
3. Controlled major upgrades for audit critical/high (Nest 11 / Vitest 4 / Vite) in an isolated PR
4. Atlaskit DnD migration (P8) if bandwidth allows
