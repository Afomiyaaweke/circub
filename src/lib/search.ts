// Case-insensitive `contains` matching that works on BOTH database connectors.
//
// WHY THIS EXISTS: production (Vercel) runs PostgreSQL, where Prisma's
// `contains` is CASE-SENSITIVE - searching "dax" does NOT match a post
// named "DAX". Local development runs SQLite, where `contains` compiles to
// SQLite's LIKE and IS case-insensitive. That asymmetry made every search
// (camera search, name search, feed search) work in dev and then "not find"
// posts that visibly exist in the production feed.
//
// SQLite additionally REJECTS the `mode: 'insensitive'` argument with a
// PrismaClientValidationError, so the fix must be conditional: add
// `mode: 'insensitive'` only when the database is NOT SQLite.

export function isSqliteDatabase(): boolean {
  const url = (process.env.DATABASE_URL || '').trim().toLowerCase()
  return url.startsWith('file:') || url.startsWith(':memory:') || url.includes(':memory=')
}

// Deep-walks a Prisma `where` object and adds `mode: 'insensitive'` to every
// string `contains` filter (Postgres only - SQLite is already case-insensitive
// and errors on `mode`). Call sites just wrap their existing where:
//   db.localPricePost.findMany({ where: caseInsensitiveWhere(where), ... })
export function caseInsensitiveWhere<T>(where: T): T {
  if (where == null || typeof where !== 'object' || isSqliteDatabase()) return where
  return addMode(where) as T
}

function addMode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(addMode)
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'contains' && typeof value === 'string') {
        out.contains = value
        out.mode = 'insensitive'
      } else {
        out[key] = addMode(value)
      }
    }
    return out
  }
  return node
}
