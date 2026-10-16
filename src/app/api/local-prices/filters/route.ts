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
    const byCountry = new Map<string, Set<string>>()
    const orphanCities = new Set<string>()
    for (const p of posts) {
      const k = (p.country || '').trim()
      const c = (p.city || '').trim()
      if (c) cities.add(c)
      if (k) {
        if (!byCountry.has(k)) byCountry.set(k, new Set())
        if (c) byCountry.get(k)!.add(c)
      } else if (c) {
        orphanCities.add(c)
      }
    }
    const locations = Array.from(byCountry.entries())
      .map(([country, set]) => ({ country, cities: Array.from(set).sort((a, b) => a.localeCompare(b)) }))
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
