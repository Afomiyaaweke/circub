// Stories: 24-hour photo posts (Instagram-style) - list active + create
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const STORY_TTL_MS = 24 * 60 * 60 * 1000

// GET /api/stories - every active (non-expired) story with its author,
// oldest-first so the client can group per author chronologically.
// Expired stories are swept opportunistically on every read.
export async function GET() {
  try {
    const now = new Date()
    // Opportunistic cleanup - keeps the table small without a cron job.
    db.story.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {})
    const stories = await db.story.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } } },
      take: 200,
    })
    return NextResponse.json({ stories })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST /api/stories - create a story from an uploaded image (data URL).
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === 'guest') return NextResponse.json({ error: 'Sign up to post stories' }, { status: 401 })
    const body = await req.json()
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
    if (!imageUrl) return NextResponse.json({ error: 'An image is required' }, { status: 400 })
    // Stories accept the same data-URL payloads the upload endpoint returns
    // (and plain http(s) URLs too, so shared/CDN images also work).
    if (!/^(data:image\/|https?:\/\/)/.test(imageUrl)) {
      return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
    }
    const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 300) : null
    const now = new Date()
    const story = await db.story.create({
      data: { imageUrl, caption: caption || null, authorId: me.id, createdAt: now, expiresAt: new Date(now.getTime() + STORY_TTL_MS) },
      include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, verifiedLocal: true, isLocal: true, idVerified: true } } },
    })
    return NextResponse.json({ story }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
