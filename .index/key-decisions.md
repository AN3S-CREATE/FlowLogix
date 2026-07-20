# Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-20 | Daily readiness sweep treats this host as local/dev, not remote prod | No prod URL/credentials in env; compose.prod not running |
| 2026-07-20 | Do not auto-start FlowLogix compose during readiness check | ~90% host RAM; port 27017 conflict with `chat-mongodb` |
| (repo) | Public `/health` and `/health/metrics` | Load balancers / Prometheus scrape without JWT |
| (repo) | Redis master/replica + 3 API replicas in prod compose | Failover / horizontal scale design |
