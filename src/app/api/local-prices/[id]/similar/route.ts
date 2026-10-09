// v144: other businesses selling the SAME product - ANY city, ANY country.
// The detail modal's Compare section renders these as the automatic
// "Other businesses on circub" rows, so a price post compares itself even
// when nothing has been manually linked and even when the other business
// is in a different city.
// v149: real-world titles broke the exact-match rule (65 of 67 prod posts
// had no twin - qualifiers like "(per session)", word order, and Amharic
// spelling variants like "አበሻ ቀሚስ" vs "ሀበሻ ቀሚስ"). Rows now come back
// tiered via src/lib/product-name.ts: `near: false` = the same product
// after normalization, `near: true` = a similar item that still compares
// honestly WITH a visible "similar" mark. The response also carries
// `categoryPoints` - the same-category price grid used as the compare
// table's fallback when nothing matches the product itself, so the
// compare output is never empty again.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { productNamesMatch, productMatchKey } from '@/lib/product-name'

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

const CATEGORY_SELECT = {
  id: true,
  category: true,
  currency: true,
  priceMin: true,
  priceMax: true,
  city: true,
  country: true,
  createdAt: true,
  authorId: true,
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const self = await db.localPricePost.findUnique({
      where: { id },
      select: { productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, createdAt: true, authorId: true },
    })
    if (!self) return NextResponse.json({ similar: [], exactCount: 0, nearCount: 0, categoryPoints: [] })

    // NO name-contains prune here: with the Amharic fold a candidate may
    // share NO raw token with the title ("ሀበሻ ቀሚስ" vs "አበሻ ቀሚስ"), so any
    // LIKE filter would drop exact-normalized matches. Scan the recent
    // window and classify in JS (src/lib/product-name.ts).
    const rows = await db.localPricePost.findMany({
      where: { id: { not: id } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: SIMILAR_SELECT,
    })
    const exact: Array<typeof rows[number] & { near: boolean }> = []
    const near: Array<typeof rows[number] & { near: boolean }> = []
    for (const r of rows) {
      const m = productNamesMatch(self.productName, r.productName)
      if (m === 'exact') exact.push({ ...r, near: false })
      else if (m === 'near') near.push({ ...r, near: true })
    }
    // Newest first inside each tier, exact before near, 10 each.
    const similar = [...exact.slice(0, 10), ...near.slice(0, 10)]

    // Category grid for the compare-table fallback: same currency, same
    // (normalized) category, NOT this post - aggregated to city x month
    // cells with the author ids so the client can mark the viewer's cells.
    const catRows = await db.localPricePost.findMany({
      where: { id: { not: id }, currency: self.currency },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: CATEGORY_SELECT,
    })
    const catSelfKey = productMatchKey(self.category || '')
    const monthOf = (iso: Date) => `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, '0')}`
    const cellMap = new Map<string, { city: string; month: string; min: number; max: number; authorIds: Set<string> }>()
    for (const r of catRows) {
      if (!catSelfKey || productMatchKey(r.category || '') !== catSelfKey) continue
      if (r.currency !== self.currency) continue
      const city = (r.city && r.city.trim()) || (r.country && r.country.trim()) || 'Unknown'
      const month = monthOf(r.createdAt)
      const key = `${city}||${month}`
      const cell = cellMap.get(key)
      if (cell) {
        cell.min = Math.min(cell.min, r.priceMin)
        cell.max = Math.max(cell.max, r.priceMax)
        cell.authorIds.add(r.authorId)
      } else {
        cellMap.set(key, { city, month, min: r.priceMin, max: r.priceMax, authorIds: new Set([r.authorId]) })
      }
    }
    const categoryPoints = [...cellMap.values()]
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.city.localeCompare(b.city)))
      .slice(-120)
      .map((c) => ({ city: c.city, month: c.month, min: c.min, max: c.max, authorIds: [...c.authorIds] }))

    return NextResponse.json({
      similar,
      exactCount: exact.length,
      nearCount: near.length,
      categoryPoints,
    })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
