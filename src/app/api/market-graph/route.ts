import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// ============================================================================
// MARKET GRAPH API - the data behind the market graph panel.
// Given a location (country + optional city) and an optional item query it
// aggregates REAL local price posts on circub into three chart-ready series:
//
//   items[]  - "what things cost here": top products at the picked place,
//              each with post count + min/typical/max in that item's
//              dominant currency (no fake FX - bars are labeled per currency)
//   places[] - "what this item costs elsewhere" (when q is given): the item's
//              prices per city/country, same dominant-currency rule. Without
//              q it degrades to a place overview (post counts + top item) so
//              the graph still shows the market shape before typing anything.
//   time     - "it was like this before, now it's like this": the queried
//              item (or the shown market's most-posted product) bucketed over
//              time as two lines - at the picked place and across all markets
//              - each in its own dominant currency. Buckets adapt to the data
//              span: <=120 days -> weeks, <=730 days -> months, else years.
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

interface TimePoint {
  period: string
  label: string
  count: number
  min: number
  typical: number
  max: number
}

// The mode currency of a set of posts - the single currency a whole time
// line is drawn in, so an axis can never mix ETB with HKD.
function dominantCurrency(rows: Array<{ currency: string }>): string | null {
  if (rows.length === 0) return null
  const byCurrency = new Map<string, number>()
  for (const p of rows) byCurrency.set(p.currency, (byCurrency.get(p.currency) || 0) + 1)
  return [...byCurrency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

// Bucket key + human label for one post timestamp (UTC, week starts Monday).
function bucketOf(value: Date | number, bucket: 'week' | 'month' | 'year'): { period: string; label: string } {
  const d = value instanceof Date ? value : new Date(value)
  if (bucket === 'year') {
    const y = String(d.getUTCFullYear())
    return { period: y, label: y }
  }
  if (bucket === 'month') {
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
    return { period, label }
  }
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  monday.setUTCHours(0, 0, 0, 0)
  const period = monday.toISOString().slice(0, 10)
  const label = `Wk of ${monday.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
  return { period, label }
}

// One full time line: keep only the dominant currency's posts, bucket them,
// median of midpoints per bucket (same robust math as everywhere else).
function timeSeries(
  rows: Array<{ createdAt: Date | number; currency: string; priceMin: number; priceMax: number }>,
  bucket: 'week' | 'month' | 'year',
): { currency: string; points: TimePoint[] } | null {
  const currency = dominantCurrency(rows)
  if (!currency) return null
  const buckets = new Map<string, { label: string; mids: number[]; min: number; max: number; count: number }>()
  for (const p of rows) {
    if (p.currency !== currency) continue
    const mid = (p.priceMin + p.priceMax) / 2
    if (!Number.isFinite(mid) || mid <= 0) continue
    const { period, label } = bucketOf(p.createdAt, bucket)
    const b = buckets.get(period) ?? { label, mids: [], min: Infinity, max: -Infinity, count: 0 }
    b.mids.push(mid)
    b.min = Math.min(b.min, p.priceMin)
    b.max = Math.max(b.max, p.priceMax)
    b.count += 1
    buckets.set(period, b)
  }
  const points = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, b]) => {
      const mids = b.mids.sort((x, y) => x - y)
      const median = mids.length % 2 === 1 ? mids[(mids.length - 1) / 2] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2
      return {
        period,
        label: b.label,
        count: b.count,
        min: Math.round(b.min * 100) / 100,
        typical: Math.round(median * 100) / 100,
        max: Math.round(b.max * 100) / 100,
      }
    })
  return points.length > 0 ? { currency, points } : null
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
        createdAt: true,
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
        createdAt: true,
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

    // --- time: the item over time - the "before vs now" line ----------------
    // No query: graph the shown market's most-posted product (or worldwide
    // most-posted when no place is shown) so the time line has a subject.
    let refItem: string | null = null
    if (!q) {
      refItem = items[0]?.name ?? null
      if (!refItem) {
        const counts = new Map<string, number>()
        for (const p of postsForPlaces) {
          const name = p.productName.trim()
          if (!name) continue
          counts.set(name, (counts.get(name) || 0) + 1)
        }
        refItem = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      }
    }

    const timeHereRows = q ? posts : posts.filter((p) => p.productName.trim() === refItem)
    const timeAllRows = q ? postsForPlaces : postsForPlaces.filter((p) => p.productName.trim() === refItem)

    let time: {
      item: string
      bucket: 'week' | 'month' | 'year'
      here: { currency: string; points: TimePoint[] } | null
      all: { currency: string; points: TimePoint[] } | null
    } | null = null
    if (q || refItem) {
      const spans = [...timeHereRows, ...timeAllRows]
        .map((p) => (p.createdAt instanceof Date ? p.createdAt.getTime() : p.createdAt))
        .filter((n) => Number.isFinite(n))
      const spanDays = spans.length > 0 ? (Math.max(...spans) - Math.min(...spans)) / 86_400_000 : 0
      const bucket = spanDays <= 120 ? 'week' : spanDays <= 730 ? 'month' : 'year'
      time = {
        item: q || refItem || '',
        bucket,
        here: timeSeries(timeHereRows, bucket),
        all: timeSeries(timeAllRows, bucket),
      }
    }

    return NextResponse.json({
      place: country ? { city: city || null, country, label: placeLabel(city || null, country) } : null,
      query: q || null,
      items,
      places,
      time,
      placesScope: 'all-markets',
    })
  } catch (e) {
    console.error('[market-graph] failed:', e)
    return NextResponse.json({ error: 'Could not build the market graph. Try again.' }, { status: 500 })
  }
}
