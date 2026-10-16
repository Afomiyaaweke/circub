import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const posts = await db.localPricePost.findMany({ select: { country: true, city: true, category: true } })
    const countries = new Set<string>(), cities = new Set<string>(), categories = new Set<string>()
    for (const p of posts) { if (p.country) countries.add(p.country); if (p.city) cities.add(p.city || ''); if (p.category) categories.add(p.category) }
    cities.delete('')
    // v184: ONE location dropdown in the feed pill - the UI needs cities
    // GROUPED under their real countries, not two flat lists. Build the
    // mapping from the actual (country, city) pairs on live posts so a city
    // always renders inside the country it truly belongs to; countries with
    // no city (country-only posts) keep appearing as empty groups.
    // v185: real-world data is messy - prod carries 'ethiopia', 'Ethiopia'
    // AND 'ኢትዮጵያ' as separate country strings. Inside ONE dropdown that
    // reads as three Ethopias, so group CASE-INSENSITIVELY (display the
    // most-posted casing; cities dedupe the same way). Picking the merged
    // row is still safe: the feed API wraps its where in
    // caseInsensitiveWhere, so country=Ethiopia matches 'ethiopia' posts
    // on both Postgres and SQLite. Genuinely different strings stay
    // separate ('Ethiopia, Addis Ababa', 'ኢትዮጵያ', 'Addis Ababa'-as-country).
    const byCountry = new Map<string, { counts: Map<string, number>; cities: Map<string, Map<string, number>> }>()
    const orphanCities = new Set<string>()
    const topCase = (m: Map<string, number>) =>
      Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    for (const p of posts) {
      const k = (p.country || '').trim()
      const c = (p.city || '').trim()
      if (c) cities.add(c)
      if (k) {
        const key = k.toLowerCase()
        let g = byCountry.get(key)
        if (!g) { g = { counts: new Map(), cities: new Map() }; byCountry.set(key, g) }
        g.counts.set(k, (g.counts.get(k) || 0) + 1)
        if (c) {
          const ck = c.toLowerCase()
          let cm = g.cities.get(ck)
          if (!cm) { cm = new Map(); g.cities.set(ck, cm) }
          cm.set(c, (cm.get(c) || 0) + 1)
        }
      } else if (c) {
        orphanCities.add(c)
      }
    }
    const locations = Array.from(byCountry.values())
      .map((g) => ({ country: topCase(g.counts), cities: Array.from(g.cities.values()).map((cm) => topCase(cm)).sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.country.localeCompare(b.country))
    return NextResponse.json(
      {
        countries: Array.from(countries).sort(),
        cities: Array.from(cities).sort(),
        categories: Array.from(categories).sort(),
        locations,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
    )
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
