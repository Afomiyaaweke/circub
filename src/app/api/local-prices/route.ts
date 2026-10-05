import { NextRequest, NextResponse } from 'next/server'
import { CATEGORY_ALIASES } from '@/lib/categories'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeInput } from '@/lib/session'
import { caseInsensitiveWhere } from '@/lib/search'
import { isValidGps } from '@/lib/location'

// Cache the public feed list for 30s on the CDN/edge, allow serving stale
// for up to 60s while revalidating in the background. With 5,000 concurrent
// users this collapses repeated identical queries into a single DB hit.
// Per-user `myVote` is computed from the logged-in user - the CDN cache is
// still safe because the response body is per-user, but the cache layer
// (Vercel Edge) treats each cookie-distinct request as a separate entry.
function cacheHeaders() {
  return {
    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const country = searchParams.get('country')?.trim() || ''
    const city = searchParams.get('city')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''
    const sort = searchParams.get('sort') || 'recent'
    const search = searchParams.get('search')?.trim() || ''
    // authorId: "my listings" view on the Instagram-style profile tab
    const authorId = searchParams.get('authorId')?.trim() || ''
    const where: any = {}
    if (authorId) where.authorId = authorId
    if (country) where.country = { contains: country }
    if (city) where.city = { contains: city }
    if (category && category !== 'All categories') {
      // New umbrella categories also match legacy short names still in old posts
      const aliases = CATEGORY_ALIASES[category]
      where.category = aliases?.length ? { in: [category, ...aliases] } : category
    }
    if (search) where.OR = [{ productName: { contains: search } }, { description: { contains: search } }, { localTip: { contains: search } }, { market: { contains: search } }, { neighborhood: { contains: search } }]
    let orderBy: any = { createdAt: 'desc' }
    if (sort === 'popular') orderBy = { helpfulCount: 'desc' }
    let me: any = null
    try { const s = await getCurrentUser(); if (s) me = await db.user.findUnique({ where: { id: s.id }, include: { localPriceVotes: true } }) } catch {}
    // _count.linksA/linksB -> the "N links" chip on each card (symmetric
    // PricePostLink rows; every link touches exactly one of the two sides).
    const posts = await db.localPricePost.findMany({ where: caseInsensitiveWhere(where), orderBy, include: { author: { select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, idVerified: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } }, votes: true, _count: { select: { linksA: true, linksB: true } } }, take: 100 })
    const result = posts.map((p) => {
      const myVote = me ? (p.votes.find((v) => v.userId === me.id)?.voteType as any) || null : null
      const { linksA, linksB } = (p as any)._count || { linksA: 0, linksB: 0 }
      return { ...p, author: { ...p.author, expertiseTags: p.author.expertiseTags ? p.author.expertiseTags.split(',').filter(Boolean) : [] }, myVote, linksCount: (linksA || 0) + (linksB || 0) }
    })
    return NextResponse.json({ posts: result }, { headers: cacheHeaders() })
  } catch (error) { console.error('Failed:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.productName || !body.country || !body.currency || body.priceMin == null || body.priceMax == null)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    // Optional GPS pin - validated + rounded to 6 decimals (~0.1 m precision).
    const gpsLat = body.latitude != null ? Number(body.latitude) : null
    const gpsLng = body.longitude != null ? Number(body.longitude) : null
    const hasGps = gpsLat != null && gpsLng != null
    if (hasGps && !isValidGps(gpsLat, gpsLng))
      return NextResponse.json({ error: 'Invalid GPS coordinates' }, { status: 400 })
    const updates: any = { localPostCount: { increment: 1 } }
    if (!me.isLocal) updates.isLocal = true
    const post = await db.localPricePost.create({
      data: {
        postType: body.postType || 'PRODUCT',
        productName: sanitizeInput(body.productName, 200),
        description: sanitizeInput(body.description || '', 2000) || null,
        country: sanitizeInput(body.country, 100),
        city: sanitizeInput(body.city || '', 100) || null,
        neighborhood: sanitizeInput(body.neighborhood || '', 100) || null,
        market: sanitizeInput(body.market || '', 100) || null,
        latitude: hasGps ? Math.round(gpsLat * 1e6) / 1e6 : null,
        longitude: hasGps ? Math.round(gpsLng * 1e6) / 1e6 : null,
        currency: sanitizeInput(body.currency, 10),
        priceMin: Number(body.priceMin),
        priceMax: Number(body.priceMax),
        recommendedPrice: body.recommendedPrice ? Number(body.recommendedPrice) : null,
        touristPrice: body.touristPrice ? Number(body.touristPrice) : null,
        personalPrice: body.personalPrice ? Number(body.personalPrice) : null,
        localTip: sanitizeInput(body.localTip || '', 2000) || null,
        contactPhone: sanitizeInput(body.contactPhone || '', 50) || null,
        contactEmail: sanitizeInput(body.contactEmail || '', 200) || null,
        contactWhatsApp: sanitizeInput(body.contactWhatsApp || '', 200) || null,
        // Shop ownership declaration - strict boolean, no string leakage
        ownsShop: body.ownsShop === true || body.ownsShop === 'true',
        category: body.category || 'Other',
        imageUrl: body.imageUrl || null,
        // v122: marketplace details from the unified composer - what the
        // price refers to ("50 / kg") and the pack size. Nullable, so every
        // pre-v122 post and every SERVICE post stays exactly as it was.
        unit: sanitizeInput(body.unit || '', 20) || null,
        quantity: sanitizeInput(body.quantity || '', 40) || null,
        authorId: me.id,
      },
      include: { author: { select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, idVerified: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } } },
    })
    await db.user.update({ where: { id: me.id }, data: updates })
    // v122 "mix the country product post and the price post": a PRODUCT
    // price post IS a product listing now. Every published PRODUCT post
    // automatically gets a Product twin (linked via Product.localPricePostId)
    // so the item appears on the profile/marketplace without a second form.
    // The twin carries the unit + pack size and a representative price (the
    // midpoint of the local range). Best-effort: a twin failure never blocks
    // the price post itself - exactly like the story below.
    let product: Record<string, unknown> | null = null
    if (post.postType !== 'SERVICE' && body.makeProduct !== false) {
      try {
        const mid = Math.round(((Number(post.priceMin) + Number(post.priceMax)) / 2) * 100) / 100
        product = await db.product.create({
          data: {
            name: post.productName,
            quantity: post.quantity || '',
            country: post.country,
            currency: post.currency,
            price: mid,
            unit: post.unit,
            description: post.description,
            imageUrl: post.imageUrl,
            category: post.category,
            authorId: me.id,
            localPricePostId: post.id,
          },
        })
        await db.user.update({ where: { id: me.id }, data: { postsCount: { increment: 1 } } })
      } catch (e) { console.error('Twin product creation failed (post kept):', e) }
    }
    // "Make it story while posting a new price": the composer sends
    // alsoStory (default true) and the new price is IMMEDIATELY shared as a
    // 24-hour story banner - the whole feed sees it in the stories strip.
    // Best-effort: a story failure never blocks the price post itself.
    let story: Record<string, unknown> | null = null
    if (body.alsoStory === true) {
      try {
        const now = new Date()
        const dupe = await db.story.findUnique({ where: { pricePostId: post.id } })
        if (!dupe) {
          const priceBit = `${post.currency} ${post.priceMin}${post.priceMin !== post.priceMax ? '-' + post.priceMax : ''}`
          story = await db.story.create({
            data: {
              imageUrl: post.imageUrl,
              caption: `${post.productName} · ${priceBit}`.slice(0, 300),
              authorId: me.id,
              pricePostId: post.id,
              createdAt: now,
              expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            },
          })
        }
      } catch { /* story is additive - never blocks the post */ }
    }
    return NextResponse.json({ post, story, product }, { status: 201 })
  } catch (error) { console.error('Failed:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
