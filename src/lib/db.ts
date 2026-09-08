import { PrismaClient } from '@prisma/client'

// Prisma client singleton — critical for Vercel serverless.
//
// On Vercel, every function invocation may create a new Node process. If
// we don't reuse the client across hot reloads within the same instance,
// we exhaust the DB connection pool. The globalThis trick lets dev mode
// reuse one client across hot reloads, while serverless gets a fresh
// client per cold start (which is fine — Prisma + Postgres handle this).
//
// Scaling notes (5,000 concurrent users target):
// - log: ['error'] in prod (no query logging — saves CPU)
// - connection_limit is set via DATABASE_URL (?connection_limit=10 on Postgres)
// - For Neon/Supabase/Vercel Postgres, use pooled connection string (port 6543 / pg_bouncer)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isProd = process.env.NODE_ENV === 'production'

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error'] : ['query', 'error', 'warn'],
  })

if (!isProd) globalForPrisma.prisma = db
