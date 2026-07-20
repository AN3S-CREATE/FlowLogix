# Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-20 | Daily readiness sweep treats this host as local/dev, not remote prod | No prod URL/credentials in env; compose.prod not running |
| 2026-07-20 | Do not auto-start FlowLogix compose during readiness check | ~90% host RAM; port 27017 conflict with `chat-mongodb` |
| 2026-07-20 | Remap local FlowLogix Mongo to host port 27018 | Preserve active `chat-mongodb` on 27017 |
| 2026-07-20 | Remove crash-loop Geologix-AI + exited unused containers; keep chat/whatsapp stacks | User-requested cleanup; no volume deletes |
| (repo) | Public `/health` and `/health/metrics` | Load balancers / Prometheus scrape without JWT |
| (repo) | Redis master/replica + 3 API replicas in prod compose | Failover / horizontal scale design |
| 2026-07-20 | Phase 0 readiness baseline scored 60/100; no Phase 1+ until user sign-off | Mandate: discovery-only; remediations gated on scope/weights confirmation |
| 2026-07-20 | Leave local compose running after bootstrap; stop Nest after `/health` smoke | Datastores needed for next work; Nest freed host RAM |
| 2026-07-20 | Phase 1 = docs + HTTP filter/helmet/throttle + CI mobile; defer SPA REST & audit majors | User "Apply recommended" → Quick Wins; `--force` majors too risky |
| 2026-07-20 | Phase 1 committed + mirrored to all three remotes (`bf50683`) | User explicitly requested commit+push |
| 2026-07-20 | Phase 2 = SPA JWT/REST hydrate + needsResync refetch; server mints move keys from neighbors | P1+P5; frontend never invents `positionIdx` |
| 2026-07-20 | SPA API mode opt-in via `VITE_API_URL` (demo seed otherwise) | Preserve offline demo without backend |
| 2026-07-20 | Phase 3 = sync `positionIdx`/parents + offline inserts; drop invalid keys with clocks | P7; fail-closed multi-tenant; v1 content-only clients compatible |
| 2026-07-20 | Phase 4 = Prometheus alerts + OPS.md; sync→WS after commit; sinceCheckpoint delta-pull; defer Atlaskit + npm majors | High-ROI without live prod creds; keep main shippable |
| 2026-07-20 | Phase 5 final score **92/100** (not 100); CI frontend Vitest + e2e stub; OPS cadence | Honest shortfall; small DevOps closes without staging host |
| 2026-07-20 | Phase 5b: metrics ACL, Alertmanager, optional Mongo, Atlaskit DnD, Vite8/Vitest4, load suite, HA tabletop, real CI e2e → **97/100** | Nest 11 deferred (lockfile); live HA still needs host |
| 2026-07-20 | Keep Mongo in stack; `HEALTH_REQUIRE_MONGO=false` optional gate | Probe-only today; least-breaking vs retire |
| 2026-07-20 | Protect `/health/metrics` with `METRICS_SECRET` (prod fail-closed) | `/health` stays public for LB |
| 2026-07-20 | Phase 5c: Nest 11 via `chore/nest-11` then merge to main → **99/100** | Exact pins + root overrides; clean lockfile avoids nested Nest/rxjs |
| 2026-07-20 | Express v5: set `query parser` to `extended` in `main.ts` | Preserve nested query parsing vs Express v5 default `simple` |
