# Phase 3 — Specialized & Advanced Uplift (2026-07-20)

**Status:** Implemented and pushed (separate commit from Phase 1/2).

**Baseline after Phase 2:** ~76–80/100 → **Estimated after Phase 3: ~84–88/100**

---

## Scope followed

From Phase 0/2 backlog **P7** (sync `position_idx` + offline-created inserts via `POST /sync`).

| Item | Result |
|------|--------|
| Sync `positionIdx` under LWW | Done — lists/cards merge Base62 keys with content fields |
| Sync parent refs (`listId` / `boardId`) | Done — org-validated before accept |
| Offline-created inserts via `/sync` | Done — boards/lists/cards when parent in-org + UUID id |
| Invalid position keys | Done — dropped (field + clock); never written |
| LWW tie-break parity | Done — same canonical-JSON greater-value rule; mobile tests updated |
| Content-only older clients | Preserved — omitting structural fields keeps v1 merge behaviour |

**Deferred (explicit):** Atlaskit pragmatic DnD (P8); Nest 11 / Vite 8 / Vitest 4 majors; live prod HA (P10); sync delta-pull by `sinceCheckpoint` (still reserved).

---

## What changed (paths)

### Backend
- `backend/src/sync/sync.service.ts` — expanded sync fields; sanitize; tenant-safe `tryInsert`; mint append key when position missing/invalid on insert
- `backend/src/sync/sync.module.ts` — imports `OrderingModule`
- `backend/src/sync/sync.service.spec.ts` — position LWW, invalid key, board/list/card inserts, out-of-org reject
- `backend/src/sync/sync-merge.spec.ts` — `positionIdx` LWW + tie-break
- `backend/src/common/ordering/position.service.ts` — quiet `isValid()` helper

### Mobile
- `mobile/src/crdt/crdt.test.ts` — `positionIdx` as Base62 string; LWW + tie-break tests (client already stored string keys)

### Docs / index
- `CLAUDE.md`, `REPO_ANALYSIS_MEMORY.md`, `.index/*`, this file

---

## Compatibility notes

| Client behaviour | Server behaviour |
|------------------|------------------|
| Sends only `title` / `description` / `isComplete` (v1) | Content-only LWW on existing rows; structural columns untouched |
| Sends `positionIdx` + clocks | LWW merge if key is valid Base62; invalid keys ignored |
| Sends new UUID + required parent/title | Insert under JWT org / parent RLS chain; accepted |
| Incomplete insert / foreign parent | Not accepted; client keeps `pending` |

Wire shape unchanged: `{ collection, sinceCheckpoint, changes[{ id, fields, clocks, nodeId, deletedAt }] }`.

---

## Validation

| Check | Result |
|-------|--------|
| Backend Jest (full) | **18 suites / 116 tests passed** (+8 sync-related) |
| Backend sync subset | **27 tests passed** |
| Mobile Vitest | **5 files / 48 tests passed** (+2 positionIdx) |

---

## Estimated score impact

| Category | Before (P2) | After (est.) | Delta | Driver |
|----------|------------:|-------------:|------:|--------|
| Architecture | 8–9/10 | 9/10 | +0–1 | Sync path covers order + create |
| Reliability | 8/10 | 9/10 | +1 | Offline inserts + position LWW |
| Domain | 8–9/10 | 9–10/10 | +1 | Offline-first Kanban closer to complete |
| Testing | 9/15 | 10/15 | +1 | Sync insert + position edge cases |
| Specialized/Domain | 7/10 | 8–9/10 | +1–2 | Mobile↔master structural sync |
| **Total** | **~76–80** | **~84–88** | **+8** | |

---

## Phase 4 candidates

1. Atlaskit `@atlaskit/pragmatic-drag-and-drop` migration (P8)
2. Isolated PR: Nest 11 / Vite 8 / Vitest 4 for remaining npm critical/high
3. Prod HA verify + Prometheus alert rules (P10)
4. Sync delta-pull using `sinceCheckpoint` (server change feed)
5. Broadcast board events after sync writes (parity with CRUD realtime)
