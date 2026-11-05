import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withDbRetry } from '@/lib/db-retry'

// v239 PERF: the three real community counts the landing stats band shows,
// moved OFF the homepage render path. The homepage used to await these three
// Prisma queries before sending ANY HTML - on a cold Vercel serverless DB
// that stretched first paint to multiple seconds for every visitor. Now the
// homepage renders instantly and the band fills in from this tiny endpoint
// (which the browser + Vercel edge cache for 2 minutes; stale-while-
// revalidate keeps it fresh without ever blocking a visitor).
export async function GET() {
  try {
    // v242: under withDbRetry - transient DB blips used to zero the band.
    const [prices, people, countryRows] = await withDbRetry(() => Promise.all([
      db.localPricePost.count(),
      db.user.count(),
      db.localPricePost.findMany({ distinct: ['country'], select: { country: true } }),
    ]))
    return NextResponse.json(
      { prices, people, countries: countryRows.length },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } }
    )
  } catch {
    return NextResponse.json({ prices: 0, people: 0, countries: 0 }, { status: 200 })
  }
}
