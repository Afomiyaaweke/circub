// GET|POST /api/cleanup/deactivated?code=<SECRET>
//
// Hard-delete every account that has been deactivated for longer than the
// 6-month retention window (src/lib/deactivation.ts). Deletion cascades to
// ALL of the user's data - posts, local price posts, products, likes,
// comments, votes, follows, connections, blocks, messages, bookings,
// verification docs - because every User relation in the schema is declared
// with onDelete: Cascade.
//
// Called by the Vercel cron defined in vercel.json (daily 03:00 UTC), and
// safe to call manually. The same expiry is ALSO enforced lazily: login and
// register purge an expired account the moment its owner (or a stranger)
// touches the email. This endpoint exists so accounts nobody ever comes back
// for do not sit in the database forever.
//
// The code mirrors the /api/seed protection: a shared secret in the query
// string keeps random crawlers from mass-deleting users.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { RETENTION_MS } from '@/lib/deactivation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CLEANUP_CODE = 'circub-cleanup-p4m6w9'

async function run(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (code !== CLEANUP_CODE) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cutoff = new Date(Date.now() - RETENTION_MS)
  const { count } = await db.user.deleteMany({
    where: { deactivatedAt: { not: null, lt: cutoff } },
  })

  return NextResponse.json({
    ok: true,
    mode: 'deactivated-cleanup',
    retentionMonths: 6,
    cutoff: cutoff.toISOString(),
    deletedUsers: count,
  })
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
