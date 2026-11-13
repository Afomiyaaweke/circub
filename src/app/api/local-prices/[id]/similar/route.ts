// v144: other businesses selling the SAME product - ANY city, ANY country.
// The detail modal's Compare section renders these as the automatic
// "Other businesses on circubAwd" rows, so a price post compares itself even
// when nothing has been manually linked and even when the other business
// is in a different city.
// v149: real-world titles broke the exact-match rule (65 of 67 prod posts
// had no twin - qualifiers like "(per session)", word order, and Amharic
// spelling variants like "አበሻ ቀሚስ" vs "ሀበሻ ቀሚስ"). Rows now come back
// tiered via src/lib/product-name.ts: `near: false` = the same product
// after normalization, `near: true` = a similar item that still compares
// honestly WITH a visible "similar" mark.
// v262: `categoryPoints` (the whole-category fallback grid) is GONE - the
// user asked for related-only comparison ("if is bag make it bag only or
// coffee only coffee"), and mixing every same-category post into one grid
// put incomparable prices (25 vs 75-11000 "bag") side by side. The detail
// modal now compares exact + near-name posts only, and this endpoint stops
// paying for a second 300-row scan on every detail open.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { productNamesMatch } from '@/lib/product-name'

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
  // v158: votes ride on the auto rows too - the compare shows what each
  // business has earned.
  helpfulCount: true,
  author: { select: { id: true, name: true, username: true, avatarColor: true, verifiedLocal: true, idVerified: true } },
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const self = await db.localPricePost.findUnique({
      where: { id },
      select: { productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, createdAt: true, authorId: true },
    })
    if (!self) return NextResponse.json({ similar: [], exactCount: 0, nearCount: 0 })

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

    return NextResponse.json({
      similar,
      exactCount: exact.length,
      nearCount: near.length,
    })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
