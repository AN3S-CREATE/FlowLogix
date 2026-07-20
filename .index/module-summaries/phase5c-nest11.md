# Phase 5c — NestJS 11 Upgrade (2026-07-20)

**Status:** Complete. New honest score **99 / 100** (was Phase 5b **97 / 100**).

**Branch strategy:** Developed on `chore/nest-11`, validated green, then merged to `main` (shippable).

---

## 1. Executive summary

Dedicated NestJS 11 upgrade for `backend/` after Phase 5b reverted a half-install that left nested/duplicate `@nestjs`/`rxjs` copies and broke `nest build`.

This attempt:

1. Pinned aligned Nest **11.1.28** packages (exact versions, not loose `^`).
2. Added root `overrides` for `@nestjs/{common,core,platform-express,platform-socket.io,websockets,testing}` + `rxjs@7.8.2`.
3. Regenerated the lockfile from a clean `node_modules` delete (no Nest 10 leftovers).
4. Fixed Nest 11 / Express v5 / jwt typing breakages.
5. Verified: workspace install, `nest build`, 128 Jest, lint, live `/health` + auth smoke.

**Not 100:** live production HA drill still needs a real host/credentials.

---

## 2. Package bumps (key)

| Package | From | To |
|---------|------|-----|
| `@nestjs/common` / `core` / `platform-express` / `platform-socket.io` / `websockets` / `testing` | 10.4.x | **11.1.28** |
| `@nestjs/cli` | 10.4.x | **11.0.24** |
| `@nestjs/schematics` | 10.x | **11.1.0** |
| `@nestjs/config` | 3.3.x | **4.0.4** |
| `@nestjs/jwt` | 10.2.x | **11.0.2** |
| `@nestjs/typeorm` | 10.0.x | **11.0.3** |
| `@nestjs/schedule` | 4.1.x | **6.1.3** |
| `@nestjs/throttler` | 5.2.x | **6.5.0** |
| `rxjs` | 7.8.2 (pinned) | **7.8.2** (unchanged; override-forced) |
| `@types/express` | 4.x | **5.x** (Express v5 types) |
| `@types/node` | 20.x | **22.x** |

No `@nestjs/mongoose` / `@nestjs/passport` / `@nestjs/terminus` in this workspace (Mongo is driver-only health probe; JWT is custom guard).

---

## 3. Code fixes

| File | Change |
|------|--------|
| `package.json` (root) | `overrides` to force single Nest 11 + rxjs tree across workspaces |
| `backend/package.json` | Nest 11 aligned deps |
| `backend/src/main.ts` | `NestExpressApplication` + `app.set('query parser', 'extended')` (Express v5 default is `simple`) |
| `backend/src/auth/auth.module.ts` | Cast `JWT_EXPIRES_IN` to `ms.StringValue` for jsonwebtoken@9 typings |

No route wildcards / middleware `forRoutes('*')` in this codebase — Express v5 named-wildcard migration N/A.

### Behavioral notes (Nest 11)

- **Express v5** is the default platform; extended query parsing restored explicitly.
- **`@nestjs/config@4`**: internal config namespaces now take precedence over `process.env` in `ConfigService#get` (we use env-first patterns; no custom namespaces affected).
- **`@nestjs/throttler@6`**: API still uses `ThrottlerModule.forRoot([{ name, ttl, limit }])` + global `ThrottlerGuard` — unchanged for our usage.
- **Dynamic-module registry** no longer hash-dedupes `TypeOrmModule.forFeature([...])` by metadata; tests that stub a single DI instance may need `module.get(X, { each: true })` or shared module refs. Current suite did not require changes.
- **Lifecycle destroy hooks** run in reverse init order (no app code relied on the old order).

---

## 4. Validation

| Check | Result |
|-------|--------|
| `npm install` (workspaces) | PASS — no nested `backend/node_modules/@nestjs` |
| `npm run build --workspace backend` | PASS |
| Backend Jest | **20 suites / 128 tests** PASS |
| Backend lint | PASS |
| `GET /health` (local compose PG/Redis/Mongo) | **200** ok |
| `GET /auth/me` (no token) | **401** Missing bearer token |
| `POST /auth/login` bad password | **401** Invalid credentials |
| `POST /auth/login` seed user | **200** + accessToken |

---

## 5. Scorecard delta

| Residual (Phase 5b) | Points | Phase 5c |
|---------------------|-------:|----------|
| Nest 11 majors | ~2 | **Closed** |
| Live prod HA drill | ~1 | Still open |

**Score: 99 / 100** (live HA remains).

---

## 6. Sign-off

| Item | Status |
|------|--------|
| Phase 5b baseline | 97/100 |
| Phase 5c score | **99/100** |
| 100/100 reached? | **No** — live prod HA drill only |
| Safe for controlled production deploy? | **Yes**, with Nest 11 + prior 5b ops controls |
