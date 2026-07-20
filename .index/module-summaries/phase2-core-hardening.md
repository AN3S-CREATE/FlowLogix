# Phase 2 — Core Hardening (2026-07-20)

**Status:** Implemented and pushed (separate commit from Phase 1).

**Baseline after Phase 1:** ~68–70/100 → **Estimated after Phase 2: ~76–80/100**

---

## Scope followed

From Phase 0 gaps **P1** + **P5** (SPA REST + JWT hydration; `needsResync` → targeted refetch). Also closed the card-move DTO gap needed for end-to-end DnD persistence.

| Item | Result |
|------|--------|
| P1 Wire SPA → REST + JWT | Done — `AuthGate` + login, board hydrate, optimistic move/create with rollback |
| P5 `needsResync` → board refetch | Done — auto `refetchBoard()` in API mode; banner still available |
| Card move validation | Done — `listId` + `beforeCardId`/`afterCardId`; server mints fractional keys |
| Board members for avatars | Done — `findAll` loads `user` (password hash stripped) |

**Deferred (explicit):** P7 sync `position_idx` / offline inserts (Phase 3); P8 Atlaskit DnD; P2 npm major upgrades; P10 prod HA.

---

## What changed (paths)

### Backend
- `backend/src/cards/dto/update-card.dto.ts` — optional `listId`, `beforeCardId`, `afterCardId`
- `backend/src/cards/cards.service.ts` — neighbor-based `positionIdx` mint; same-board list move guard
- `backend/src/cards/cards.service.spec.ts` — 2 unit tests for neighbor move + invalid neighbor
- `backend/src/board-members/board-members.service.ts` — join `user`, strip `passwordHash`

### Frontend API / auth
- `frontend/src/api/config.ts`, `http.ts`, `session.ts`, `authApi.ts`, `boardApi.ts`, `mapBoard.ts`, `boardLoader.ts`
- `frontend/src/api/mapBoard.test.ts`
- `frontend/src/components/auth/LoginScreen.tsx`, `AuthGate.tsx`
- `frontend/.env.example` — `VITE_API_URL` / optional WS + board id

### Frontend store / UI / realtime
- `frontend/src/store/persistence.ts` — real `PATCH /cards/:id` in API mode
- `frontend/src/store/useBoardStore.ts` — `hydrateBoard`, `refetchBoard`, async `addCard`, neighbor moves + server key stamp
- `frontend/src/components/board/Board.tsx` — auto-refetch on `needsResync`
- `frontend/src/components/board/AppHeader.tsx` — signed-in `BrandedAvatar` + sign out
- `frontend/src/realtime/useBoardSocket.ts` — org from JWT session; WS URL from API URL fallback
- `frontend/src/App.tsx` — wrap shell in `AuthGate`
- `frontend/src/vite-env.d.ts` — new env typings

### Docs / index
- `README.md`, `CLAUDE.md`, `REPO_ANALYSIS_MEMORY.md`, `.index/*`, this file

---

## How to run API mode

```bash
cp frontend/.env.example frontend/.env.local
npm run seed --workspace backend   # andries@veralogix.co.za / Veralogix#2026
npm run dev:backend
npm run dev:frontend
```

Omit `VITE_API_URL` to keep the offline demo seed (no login).

---

## Validation

| Check | Result |
|-------|--------|
| Backend Jest | **18 suites / 108 tests passed** (+2 card update) |
| Frontend Vitest | **3 files / 21 tests passed** (+mapBoard) |
| Frontend `tsc` + Vite build | Pass |
| Backend `tsc -p tsconfig.build.json` | Pass |
| `GET /health` | **200** `status:ok` (pg/redis/mongo) |
| Login → boards → lists → cards → PATCH move | Ok (after seed); members include `user` without hash |

---

## Estimated score impact

| Category | Before (P1) | After (est.) | Delta | Driver |
|----------|------------:|-------------:|------:|--------|
| Architecture | 7/10 | 8–9/10 | +1–2 | SPA↔API wired |
| Reliability | 6/10 | 8/10 | +2 | Optimistic rollback + resync refetch |
| Domain | 7/10 | 8–9/10 | +1–2 | End-to-end Kanban path |
| Testing | 8/15 | 9/15 | +1 | Card move + mapBoard tests |
| Documentation | 8/10 | 8–9/10 | +0–1 | Frontend API mode docs |
| **Total** | **~68–70** | **~76–80** | **+8–10** | |

---

## Phase 3 candidates

1. Sync v1: `position_idx` + offline-created inserts (`POST /sync`)
2. Atlaskit pragmatic DnD migration (P8)
3. Isolated PR: Nest 11 / Vite 8 / Vitest 4 for remaining npm critical/high
4. Prod HA verify + Prometheus alert rules (P10)
