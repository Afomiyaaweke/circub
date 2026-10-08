// Deactivation retention policy (v134): a deactivated account is remembered
// for 6 months, during which the owner can sign back in with the same email +
// password (no email verification) or re-register with the same email - the
// ORIGINAL account is reactivated, so posts, followers and messages survive.
// After the 6-month window the account is deleted completely (hard delete -
// every User relation in the schema has onDelete: Cascade).

export const RETENTION_MONTHS = 6
// 6 months ~= 183 days. Calendar-exact would need per-month math; a fixed
// 183-day window is predictable, documented and close enough for retention.
export const RETENTION_MS = 183 * 24 * 60 * 60 * 1000

/** True when the account was deactivated more than RETENTION_MS ago. */
export function isPastRetention(deactivatedAt: Date | string | null | undefined): boolean {
  if (!deactivatedAt) return false
  const t = deactivatedAt instanceof Date ? deactivatedAt.getTime() : new Date(deactivatedAt).getTime()
  return Date.now() - t >= RETENTION_MS
}

/** Human-readable reactivation window end, e.g. "2026-04-06". */
export function retentionEndsAt(deactivatedAt: Date | string): string {
  const t = deactivatedAt instanceof Date ? deactivatedAt.getTime() : new Date(deactivatedAt).getTime()
  return new Date(t + RETENTION_MS).toISOString().slice(0, 10)
}
