// Trending categories - computed from real local price posts + product counts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Aggregate trends from real local price posts (the community price database)
    const localPosts = await db.localPricePost.findMany({
      select: { category: true, country: true, city: true },
    })

    // Aggregate from old-style Product records too (still in use for some legacy tabs)
    const products = await db.product.findMany({
      select: { category: true, country: true },
    })

    // Count by category, country, city
    const categoryCount: Record<string, number> = {}
    const countryCount: Record<string, number> = {}
    const cityCount: Record<string, number> = {}

    for (const p of localPosts) {
      if (p.category) categoryCount[p.category] = (categoryCount[p.category] || 0) + 1
      if (p.country) countryCount[p.country] = (countryCount[p.country] || 0) + 1
      if (p.city) cityCount[p.city] = (cityCount[p.city] || 0) + 1
    }
    for (const p of products) {
      if (p.category) categoryCount[p.category] = (categoryCount[p.category] || 0) + 1
      if (p.country) countryCount[p.country] = (countryCount[p.country] || 0) + 1
    }

    const categories = Object.entries(categoryCount)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
    const countries = Object.entries(countryCount)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Combine real categories + countries + cities
    const trends: { label: string; count: number }[] = [...categories, ...countries].slice(0, 8)

    return NextResponse.json({ trends })
  } catch (error) {
    console.error('Failed to fetch trending:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
