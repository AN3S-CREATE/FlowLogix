# CI guide

FlowLogix uses GitHub Actions for three responsibilities:

1. **Required verification** via the `CI Health` job.
2. **Optional compose smoke** via `workflow_dispatch` (`run_e2e=true`) or the weekly schedule.
3. **Image publishing** to GHCR on pushes to `main` or manual dispatch with `publish_images=true`.

## Required checks

If branch protection is enabled, use **`CI Health`** as the required status check. It fails if any of these jobs fail:

- `Backend checks`
- `Frontend checks`
- `Mobile checks`

## Required secrets and variables

The verification workflow does not require any user-managed secrets.

| Name | Required | Used for | Source |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes | Publishing backend/frontend images to GHCR | Built in by GitHub Actions |
| `run_e2e` | Optional | Manual compose smoke trigger | `workflow_dispatch` input |
| `publish_images` | Optional | Manual image publish trigger | `workflow_dispatch` input |

Runtime secrets such as `JWT_SECRET`, `METRICS_SECRET`, database passwords, or deploy credentials are **not** read from the CI workflow. The smoke job generates throwaway local values for validation only.

## Run the same checks locally

Use Node 20 for the closest match to CI.

```bash
npm ci
npm run ci:verify
```

That expands to:

```bash
npm run lint --workspace backend
npm run test --workspace backend -- --ci
npm run build --workspace backend
npm run lint --workspace frontend
npm run test --workspace frontend
npm run build --workspace frontend
npm run typecheck --workspace mobile
npm run test --workspace mobile
```

## Run the smoke check locally

```bash
npm ci
docker compose up -d postgres redis mongodb
npm run build --workspace backend
cd backend
node dist/main
curl http://127.0.0.1:3000/health
```

The workflow uses these local values during smoke validation:

- Postgres: `logixflow/logixflow`
- Redis: no password on the local compose stack
- Mongo: `mongodb://logixflow:logixflow@localhost:27017/?authSource=admin`

Stop the local stack when done:

```bash
docker compose down -v
```

## Force a re-run

1. Open **Actions** in GitHub.
2. Select **CI & Publish**.
3. Choose **Re-run jobs** for an existing run, or use **Run workflow**.
4. Enable `run_e2e` for the smoke test or `publish_images` for a manual publish.

## Troubleshooting

| Symptom | Likely cause | What to check |
|---|---|---|
| `npm ci` fails | Lockfile drift or workspace dependency change | Regenerate `package-lock.json` from the repo root and re-run `npm ci` |
| `Backend checks` fails on lint | TypeScript or ESLint regression | Run `npm run lint --workspace backend` locally |
| `Frontend checks` fails on build | Type or bundling error | Run `npm run build --workspace frontend` locally |
| `Mobile checks` fails on type-check or tests | Mobile API or Vitest regression | Run `npm run typecheck --workspace mobile` and `npm run test --workspace mobile` |
| Smoke job times out on `/health` | Datastore container not healthy or backend boot failure | Inspect `docker compose ps`, backend logs, and `/health` output |
| Publish job fails | GHCR auth or image build issue | Confirm the run is on `main` or manual publish, then inspect Docker build logs |

## Notes

- Historical failed runs on `main` remain in GitHub run history until GitHub retention removes them or a maintainer deletes them manually.
- The workflow intentionally uses `npm ci` from the repo root so CI always validates the committed workspace lockfile.
