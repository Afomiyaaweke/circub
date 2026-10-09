// v144: other businesses selling the SAME product - ANY city, ANY country.
// The detail modal's Compare section renders these as the automatic
// "Other businesses on circub" rows, so a price post compares itself even
// when nothing has been manually linked and even when the other business
// is in a different city. Exact product-name match, case-insensitive on
// BOTH connectors: fetch with an insensitive `contains` (SQLite LIKE is
// case-insensitive, Postgres gets mode:'insensitive'), then exact-filter
// in JS - `equals` + mode is rejected by SQLite and `equals` alone is
// case-sensitive on Postgres.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { caseInsensitiveWhere } from '@/lib/search'

const SIMILAR_SELECT = {
  id: true,
  productName: true,
  currency: true,
  priceMin: true,
  priceMax: true,
  city: true,
  country: true,
  imageUrl: true,
  createdAt: true,
  author: { select: { id: true, name: true, username: true, avatarColor: true, verifiedLocal: true, idVerified: true } },
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const self = await db.localPricePost.findUnique({ where: { id }, select: { productName: true } })
    if (!self) return NextResponse.json({ similar: [] })
    const name = self.productName.trim()
    if (!name) return NextResponse.json({ similar: [] })
    const rows = await db.localPricePost.findMany({
      where: caseInsensitiveWhere({ productName: { contains: name }, id: { not: id } }),
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: SIMILAR_SELECT,
    })
    const lower = name.toLowerCase()
    const similar = rows
      .filter((r) => r.productName.trim().toLowerCase() === lower)
      .slice(0, 10)
    return NextResponse.json({ similar, count: similar.length })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
