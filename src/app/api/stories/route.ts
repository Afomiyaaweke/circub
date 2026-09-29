// Stories: 24-hour posts (Instagram-style) - list active + create.
// Two kinds share this table: photo stories (uploaded image, created from
// the profile tab) and PRICE stories (auto-shared when a new price post is
// published - they may have no image, the client renders a price banner).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const STORY_TTL_MS = 24 * 60 * 60 * 1000

// GET /api/stories - every active (non-expired) story with its author and,
// for price stories, the price post it was shared from (oldest-first so the
// client can group per author chronologically). Expired stories are swept
// opportunistically on every read.
export async function GET() {
  try {
    const now = new Date()
    // Opportunistic cleanup - keeps the table small without a cron job.
    db.story.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {})
    const stories = await db.story.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } },
        pricePost: { select: { id: true, productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, imageUrl: true } },
      },
      take: 200,
    })
    return NextResponse.json({ stories })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/stories - create a story either from an uploaded image (data
// URL) or from an existing price post (pricePostId - the story shares that
// price like a banner for 24h).
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === 'guest') return NextResponse.json({ error: 'Sign up to post stories' }, { status: 401 })
    const body = await req.json()
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
    const pricePostId = typeof body.pricePostId === 'string' ? body.pricePostId.trim() : ''
    if (!imageUrl && !pricePostId) return NextResponse.json({ error: 'An image or a price post is required' }, { status: 400 })
    // Photo stories accept the same data-URL payloads the upload endpoint
    // returns (and plain http(s) URLs too, so shared/CDN images also work).
    if (imageUrl && !/^(data:image\/|https?:\/\/)/.test(imageUrl)) {
      return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
    }
    const now = new Date()
    const expiresAt = new Date(now.getTime() + STORY_TTL_MS)
    let created
    if (pricePostId) {
      const pp = await db.localPricePost.findUnique({ where: { id: pricePostId } })
      if (!pp) return NextResponse.json({ error: 'Price post not found' }, { status: 404 })
      // Idempotent: a price post gets ONE live story even if the publish
      // flow fires twice.
      const dupe = await db.story.findUnique({ where: { pricePostId } })
      if (dupe) return NextResponse.json({ story: dupe })
      const priceBit = `${pp.currency} ${pp.priceMin}${pp.priceMin !== pp.priceMax ? '-' + pp.priceMax : ''}`
      created = await db.story.create({
        data: { imageUrl: pp.imageUrl, caption: `${pp.productName} · ${priceBit}`.slice(0, 300), authorId: me.id, pricePostId, createdAt: now, expiresAt },
        include: {
          author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } },
          pricePost: { select: { id: true, productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, imageUrl: true } },
        },
      })
    } else {
      const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 300) : null
      created = await db.story.create({
        data: { imageUrl, caption: caption || null, authorId: me.id, createdAt: now, expiresAt },
        include: {
          author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } },
          pricePost: { select: { id: true, productName: true, category: true, currency: true, priceMin: true, priceMax: true, city: true, country: true, imageUrl: true } },
        },
      })
    }
    return NextResponse.json({ story: created }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
