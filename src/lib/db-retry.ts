// v240: retry helper for TRANSIENT database failures.
//
// The production database runs on serverless Postgres. When the compute
// instance is cold (or the connection pool is warming up) the first queries
// can fail with Prisma P1001/P1002/P2024/P2034 or raw connection/timeout
// errors. Before this helper those failures surfaced as a bare 500
// "Login failed" / "Registration failed" - and a real user retrying in a
// loop then tripped the login rate limit, which read as "sign in is broken".
// The auth routes now retry transient failures briefly (250ms / 500ms) so a
// cold-start blip self-heals inside the same request.
//
// Only genuinely transient shapes are retried. Validation errors, unique
// violations (P2002) and everything else rethrow immediately.

const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P2024', 'P2034'])

const TRANSIENT_MESSAGE =
  /timed?\s?out|timeout|connect(ion)?\s*(error|refused|closed|reset)|unavailable|overloaded|too many connections|opening has been disabled/i

export function isTransientDbError(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  if (code && TRANSIENT_CODES.has(code)) return true
  const msg = String((e as { message?: string })?.message || '')
  return TRANSIENT_MESSAGE.test(msg)
}

export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isTransientDbError(error) || attempt === attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastError
}
