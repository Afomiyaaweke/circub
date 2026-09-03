// Trending categories - computed from product counts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const products = await db.product.findMany({
      select: { category: true, country: true },
    })

    // Count by category
    const categoryCount: Record<string, number> = {}
    const countryCount: Record<string, number> = {}
    for (const p of products) {
      categoryCount[p.category] = (categoryCount[p.category] || 0) + 1
      countryCount[p.country] = (countryCount[p.country] || 0) + 1
    }

    // Fallback trends if too few products
    const fallbackCategories = [
      { label: 'Coffee', count: 18 },
      { label: 'Spices', count: 12 },
      { label: 'Tea', count: 9 },
      { label: 'Seafood', count: 6 },
      { label: 'Textiles', count: 4 },
    ]
    const fallbackCountries = [
      { label: 'Ethiopia', count: 8 },
      { label: 'India', count: 7 },
      { label: 'Madagascar', count: 5 },
      { label: 'Sri Lanka', count: 4 },
      { label: 'Japan', count: 3 },
    ]

    const categories = Object.entries(categoryCount)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    const countries = Object.entries(countryCount)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const trends =
      categories.length >= 3
        ? [...categories, ...countries].slice(0, 8)
        : [...fallbackCategories, ...fallbackCountries]

    return NextResponse.json({ trends })
  } catch (error) {
    console.error('Failed to fetch trending:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
