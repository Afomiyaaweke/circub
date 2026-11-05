import { PrismaClient } from '@prisma/client'

// Prisma client singleton - critical for Vercel serverless.
//
// On Vercel, every function invocation may create a new Node process. If
// we don't reuse the client across hot reloads within the same instance,
// we exhaust the DB connection pool. The globalThis trick lets dev mode
// reuse one client across hot reloads, while serverless gets a fresh
// client per cold start (which is fine - Prisma + Postgres handle this).
//
// Scaling notes (5,000 concurrent users target):
// - log: ['error'] in prod (no query logging - saves CPU)
// - connection_limit is set via DATABASE_URL (?connection_limit=10 on Postgres)
// - For Neon/Supabase/Vercel Postgres, use pooled connection string (port 6543 / pg_bouncer)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isProd = process.env.NODE_ENV === 'production'

// v243: serverless Postgres connection cap. Every warm function instance
// holds its own Prisma pool; without a per-instance cap, a burst of warm
// instances exhausts the database's connection limit and EVERY endpoint
// starts 500ing in a sustained window (the recurring prod "DB flip"). The
// limit rides on the DATABASE_URL itself when the env var doesn't already
// carry one. SQLite (local dev) URLs are left untouched - the params are
// Postgres-only and would break the file:// URL. The REAL fix on the Vercel
// side is pointing DATABASE_URL at the provider's POOLED endpoint (Neon:
// the -pooler host / port 6543); this cap is the in-code safety net.
function withServerlessPool(url?: string): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return url
  if (url.includes('connection_limit=')) return url
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=5&pool_timeout=20'
}

const datasourceUrl = withServerlessPool(process.env.DATABASE_URL)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error'] : ['query', 'error', 'warn'],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  })

if (!isProd) globalForPrisma.prisma = db
