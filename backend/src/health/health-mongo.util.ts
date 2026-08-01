/**
 * Mongo is probe-only today (no domain Mongoose/collections). When
 * `HEALTH_REQUIRE_MONGO=false`, a down/skipped mongo probe does not fail the
 * overall `/health` gate — Postgres + Redis remain required.
 *
 * Default: require mongo (`true` / unset) so existing deploys keep current behaviour.
 */
export function isMongoRequiredForHealth(): boolean {
  const raw = process.env.HEALTH_REQUIRE_MONGO?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}
