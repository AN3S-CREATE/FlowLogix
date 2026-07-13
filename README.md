# LogixFlow

LogixFlow is a collaborative Kanban board platform. This repository is a monorepo split into two applications:

- **`backend/`** — NestJS (TypeScript) API server.
- **`frontend/`** — React single-page app built with Vite, TypeScript, Tailwind CSS, and Zustand for global state.

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
npm run dev:backend
```

The API starts on `http://localhost:3000`.

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
└── frontend/                # React + Vite + Tailwind + Zustand SPA
    └── src/
        ├── components/
        └── store/
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
