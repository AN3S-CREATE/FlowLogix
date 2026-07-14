# LogixFlow

LogixFlow is a collaborative Kanban board platform. This repository is a monorepo split into two applications:

- **`backend/`** — NestJS (TypeScript) API server.
- **`frontend/`** — React single-page app built with Vite, TypeScript, Tailwind CSS, and Zustand for global state.
- **`mobile/`** — React Native offline-first sync module: WatermelonDB (local SQLite), LWW-CRDT merge handlers, an offline-first `SyncService`, and a Wi-Fi/LTE-gated attachment upload queue.

Local development datastores (PostgreSQL, MongoDB, Redis) are provisioned via the root `docker-compose.yml`.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker & Docker Compose

## Getting started

### 1. Start the datastores

```bash
cp .env.example .env
docker compose up -d
```

This starts:

| Service    | Purpose                     | Port  |
|------------|------------------------------|-------|
| PostgreSQL | Primary relational store     | 5432  |
| MongoDB    | Primary document store       | 27017 |
| Redis      | Pub/sub & caching layer      | 6379  |

### 2. Install dependencies

From the repo root (uses npm workspaces):

```bash
npm install
```

### 3. Run the backend

```bash
cp backend/.env.example backend/.env
npm run migration:run --workspace backend
npm run dev:backend
```

The API starts on `http://localhost:3000`. Every request to a tenant-scoped
endpoint (organizations, users, boards, and everything nested under a board)
must include an `X-Org-Id: <uuid>` header identifying the active
organization — see [`backend/README.md`](backend/README.md#data-model--tenant-isolation)
for how isolation is enforced.

### 4. Run the frontend

```bash
npm run dev:frontend
```

The app starts on `http://localhost:5173`.

## Project structure

```
FlowLogix/
├── docker-compose.yml       # Postgres, MongoDB, Redis for local dev
├── backend/                 # NestJS API
│   ├── src/
│   └── Dockerfile
├── frontend/                # React + Vite + Tailwind + Zustand SPA
│   └── src/
│       ├── components/
│       └── store/
└── mobile/                  # React Native offline-first sync module
    └── src/
        ├── crdt/            # LWW-CRDT primitives + field-level merge
        ├── sync/            # offline-first SyncService + network monitor
        ├── attachments/     # Wi-Fi/LTE-gated background upload queue
        └── model/           # WatermelonDB schema, models, port adapters
```

## Backend (NestJS)

```bash
cd backend
npm install
npm run start:dev   # watch mode
npm run lint
npm run test
npm run build
docker build -t logixflow-backend .
```

## Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
```

## Mobile (React Native offline-first sync)

The `mobile/` workspace holds the offline-first synchronization module. Its pure
logic — the LWW-CRDT merge handlers, the `SyncService`, and the attachment
upload queue — is written behind injectable ports so it type-checks and unit
tests off-device (no emulator required). The React Native UI, native SQLite
(WatermelonDB) adapter, and NetInfo wiring plug into those ports in the app.

```bash
npm run typecheck:mobile   # tsc --noEmit
npm run test:mobile        # vitest (CRDT, sync, and upload-queue specs)
```

- **CRDT** (`src/crdt/`): a strictly-monotonic high-precision clock, an LWW
  register, an LWW-Element-Set, and a field-level `mergeRecord` keyed on each
  field's `<field>_updated_at` timestamp.
- **Sync** (`src/sync/`): mutations write straight to local SQLite and stamp
  per-field clocks; on reconnect the engine pulls, merges field-by-field (later
  timestamp wins), and pushes pending changes.
- **Attachments** (`src/attachments/`): large files are staged locally and
  uploaded only on Wi-Fi/LTE, with bounded concurrency and exponential backoff.
