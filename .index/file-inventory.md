# File Inventory

| Path | Purpose | Status |
|------|---------|--------|
| `package.json` | npm workspaces root (backend/frontend/mobile) | Active |
| `docker-compose.yml` | Local Postgres/Mongo/Redis | Active |
| `docker-compose.prod.yml` | Production multi-replica stack (+ alert mount) | Active |
| `.env.example` | Local compose env template | Active |
| `.env` | Local compose env (MONGO_PORT=27018); gitignored | Active |
| `backend/.env` | Nest runtime env (MONGO_URI :27018); gitignored | Active |
| `.env.prod.example` | Prod secrets template | Active |
| `.cursorrules` | AI coding / brand / architecture rules | Active |
| `CLAUDE.md` | Implementation status vs rules | Active |
| `README.md` | Getting started + ops pointer | Active |
| `backend/src/health/` | Health + Prometheus metrics | Active |
| `backend/src/auth/` | JWT auth module + global guard | Active |
| `backend/src/realtime/` | Socket.io + Redis pub/sub | Active |
| `backend/src/sync/` | Mobile LWW sync + delta-pull + post-commit WS | Active |
| `backend/src/common/ordering/` | Fractional indexer + rebalance cron | Active |
| `deploy/prometheus/` | Scrape config + alert rules | Active |
| `deploy/grafana/` | Dashboards + provisioning | Active |
| `deploy/OPS.md` | Health/metrics/compose.prod/alerts runbook | Active |
| `deploy/certs/` | TLS certs mount target | Missing (expected empty until provisioned) |
| `.github/workflows/deploy.yml` | Deploy workflow | Active |
| `REPO_ANALYSIS_MEMORY.md` | Cross-session agent memory | Active |
| `.index/` | Agent context index | Active |
| `.index/module-summaries/phase0-readiness.md` | Phase 0 readiness audit deliverable (60/100) | Active |
| `.index/module-summaries/phase1-quick-wins.md` | Phase 1 Quick Wins deliverable (~68–70/100 est.) | Active |
| `.index/module-summaries/phase2-core-hardening.md` | Phase 2 SPA REST+JWT + resync refetch (~76–80/100 est.) | Active |
| `.index/module-summaries/phase3-specialized-uplift.md` | Phase 3 sync positionIdx + offline inserts (~84–88/100 est.) | Active |
| `.index/module-summaries/phase4-docs-observability-devops.md` | Phase 4 alerts/docs/sync WS/delta-pull (~90–93/100 est.) | Active |
| `.index/module-summaries/phase5-final-readiness.md` | Phase 5 final validation + scorecard (**92/100**) | Active |
| `backend/src/common/filters/` | Global HTTP exception filter + Jest specs | Active |
| `backend/src/**/*.spec.ts` | Jest unit tests (18 files / 119 tests) | Active |
| `frontend/src/api/` | REST client, session, board hydrate/map | Active |
| `frontend/src/components/auth/` | LoginScreen + AuthGate (API mode) | Active |
| `frontend/.env.example` | `VITE_API_URL` / WS / board id template | Active |
| `frontend/src/**/*.test.ts` | Vitest store/mutation/mapBoard tests (3 files / 21) | Active |
| `mobile/src/**/*.test.ts` | Vitest CRDT/sync/upload tests (5 files / 48) | Active |
| `.github/workflows/deploy.yml` | CI verify (incl. frontend Vitest) + optional e2e stub + GHCR push | Active |
