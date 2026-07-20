# FlowLogix load / SLO smoke scripts
#
# Optional — not run on every CI push. Use locally or from a load host against
# a staging/API URL. Requires Node 20+.
#
# Targets (critical path):
#   GET  /health
#   POST /auth/login
#   GET  /boards/:id   (needs BOARD_ID + token from login)
#
# Suggested SLO starting points (adjust to your host):
#   /health     p95 < 100ms,  error rate < 0.1%
#   /auth/login p95 < 500ms,  error rate < 1%
#   /boards/:id p95 < 300ms,  error rate < 0.5%

## autocannon (Node, no extra binary)

```bash
# From repo root — install once:
npm install --prefix deploy/load autocannon --no-save

# Health (public)
npx --prefix deploy/load autocannon -c 10 -d 20 http://localhost:3000/health

# Login (replace credentials)
npx --prefix deploy/load autocannon -c 5 -d 20 \
  -m POST -H "Content-Type=application/json" \
  -b '{"email":"andries@veralogix.co.za","password":"Veralogix#2026"}' \
  http://localhost:3000/auth/login
```

Or use the helper script (reads env):

```bash
# PowerShell
$env:BASE_URL="http://localhost:3000"
$env:LOGIN_EMAIL="andries@veralogix.co.za"
$env:LOGIN_PASSWORD="Veralogix#2026"
$env:BOARD_ID="<uuid>"
node deploy/load/smoke.mjs
```

## k6 (optional)

If [k6](https://k6.io/) is installed:

```bash
BASE_URL=http://localhost:3000 \
LOGIN_EMAIL=andries@veralogix.co.za \
LOGIN_PASSWORD='Veralogix#2026' \
BOARD_ID=<uuid> \
k6 run deploy/load/k6-smoke.js
```

Do not point these at production without coordination. Never commit real passwords into scripts.
