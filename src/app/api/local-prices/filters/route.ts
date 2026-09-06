import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const posts = await db.localPricePost.findMany({ select: { country: true, city: true, category: true } })
    const countries = new Set<string>(), cities = new Set<string>(), categories = new Set<string>()
    for (const p of posts) { if (p.country) countries.add(p.country); if (p.city) cities.add(p.city || ''); if (p.category) categories.add(p.category) }
    cities.delete('')
    return NextResponse.json({ countries: Array.from(countries).sort(), cities: Array.from(cities).sort(), categories: Array.from(categories).sort() })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
