import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// ============================================================================
// MARKET GRAPH API - the data behind the market graph panel.
// Given a location (country + optional city) and an optional item query it
// aggregates REAL local price posts on circub into two chart-ready series:
//
//   items[]  - "what things cost here": top products at the picked place,
//              each with post count + min/typical/max in that item's
//              dominant currency (no fake FX - bars are labeled per currency)
//   places[] - "what this item costs elsewhere" (when q is given): the item's
//              prices per city/country, same dominant-currency rule. Without
//              q it degrades to a place overview (post counts + top item) so
//              the graph still shows the market shape before typing anything.
//
// "typical" is the median of per-post price midpoints, so one wild post
// (a cafe cup vs 1kg beans) cannot drag the number - same robust math as
// the budget planner.
// ============================================================================

interface PriceAgg {
  currency: string
  count: number
  min: number
  typical: number
  max: number
}

// Collapse one bucket of posts (same item+place or item+city) into an agg.
// The dominant currency (mode) wins; only posts in THAT currency feed the
// numbers so a mixed-currency axis can never happen.
function aggBucket(posts: Array<{ currency: string; priceMin: number; priceMax: number }>): PriceAgg | null {
  if (posts.length === 0) return null
  const byCurrency = new Map<string, number>()
  for (const p of posts) byCurrency.set(p.currency, (byCurrency.get(p.currency) || 0) + 1)
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const inCur = posts.filter((p) => p.currency === currency)
  const mids = inCur
    .map((p) => (p.priceMin + p.priceMax) / 2)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  if (mids.length === 0) return null
  const median = mids.length % 2 === 1 ? mids[(mids.length - 1) / 2] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2
  return {
    currency,
    count: inCur.length,
    min: Math.round(Math.min(...inCur.map((p) => p.priceMin)) * 100) / 100,
    max: Math.round(Math.max(...inCur.map((p) => p.priceMax)) * 100) / 100,
    typical: Math.round(median * 100) / 100,
  }
}

function placeLabel(city: string | null, country: string): string {
  return city ? `${city}, ${country}` : country
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const country = (searchParams.get('country') || '').trim().slice(0, 80)
  const city = (searchParams.get('city') || '').trim().slice(0, 80)
  const q = (searchParams.get('q') || '').trim().slice(0, 120)

  try {
    // Location filter - city always pairs with its country so "Paris" does
    // not match Paris, TX posts. No location at all = worldwide market.
    const where: Record<string, unknown> = {}
    if (country) {
      if (city) {
        where.AND = [{ country: { contains: country } }, { city: { contains: city } }]
      } else {
        where.country = { contains: country }
      }
    }
    if (q) where.productName = { contains: q }

    const posts = await db.localPricePost.findMany({
      where,
      select: {
        productName: true,
        city: true,
        country: true,
        currency: true,
        priceMin: true,
        priceMax: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 600,
    })

    // The places series is INHERENTLY cross-location ("what does this cost
    // elsewhere" is exactly the tourist question), so it ignores the place
    // filter on purpose - only the items series is scoped to the picked
    // market. Without an item query it doubles as the worldwide market
    // overview (where circub has prices at all).
    const postsForPlaces = await db.localPricePost.findMany({
      where: q ? { productName: { contains: q } } : {},
      select: {
        productName: true,
        city: true,
        country: true,
        currency: true,
        priceMin: true,
        priceMax: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 600,
    })

    // --- items[]: top products at the picked place --------------------------
    const itemBuckets = new Map<string, typeof posts>()
    for (const p of posts) {
      const name = p.productName.trim()
      if (!name) continue
      const list = itemBuckets.get(name) ?? []
      list.push(p)
      itemBuckets.set(name, list)
    }
    const items = [...itemBuckets.entries()]
      .map(([name, list]) => {
        const agg = aggBucket(list)
        return agg ? { name, ...agg } : null
      })
      .filter(
        (x): x is { name: string; currency: string; count: number; min: number; typical: number; max: number } => x !== null
      )
      // An item with a single post still charts (it IS the market so far),
      // but more-posted items come first so the graph leads with signal.
      .sort((a, b) => b.count - a.count || b.max - a.max)
      .slice(0, 8)

    // --- places[]: one item across cities, or the place overview ------------
    type PlaceRow = {
      label: string
      city: string | null
      country: string
      currency: string | null
      count: number
      min: number | null
      typical: number | null
      max: number | null
      topItem?: string
    }
    let places: PlaceRow[] = []
    const placeBuckets = new Map<string, typeof postsForPlaces>()
    for (const p of postsForPlaces) {
      const label = placeLabel(p.city, p.country)
      const list = placeBuckets.get(label) ?? []
      list.push(p)
      placeBuckets.set(label, list)
    }
    places = [...placeBuckets.entries()]
      .map(([label, list]) => {
        const first = list[0]
        if (q) {
          const agg = aggBucket(list)
          return {
            label,
            city: first.city,
            country: first.country,
            currency: agg?.currency ?? null,
            count: list.length,
            min: agg?.min ?? null,
            typical: agg?.typical ?? null,
            max: agg?.max ?? null,
          }
        }
        const itemCounts = new Map<string, number>()
        for (const p of list) itemCounts.set(p.productName, (itemCounts.get(p.productName) || 0) + 1)
        const topItem = [...itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        return {
          label,
          city: first.city,
          country: first.country,
          currency: null,
          count: list.length,
          min: null,
          typical: null,
          max: null,
          topItem,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8) as PlaceRow[]

    return NextResponse.json({
      place: country ? { city: city || null, country, label: placeLabel(city || null, country) } : null,
      query: q || null,
      items,
      places,
      placesScope: 'all-markets',
    })
  } catch (e) {
    console.error('[market-graph] failed:', e)
    return NextResponse.json({ error: 'Could not build the market graph. Try again.' }, { status: 500 })
  }
}
