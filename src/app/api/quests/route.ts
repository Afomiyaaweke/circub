// GET /api/quests  - list instant side-hustle bounty quests (public, v215).
// POST /api/quests - post an instant quest ("I need help around Merkato").
// Anyone can post: logged-in users get their account attached (userId),
// visitors leave a name + a contact channel. The poster's contact is NEVER
// returned by this list - it is revealed only to the single winner via
// POST /api/quests/[id]/claim ("guide contacts the traveler instantly").
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, checkRateLimit, sanitizeInput } from '@/lib/session'

export async function GET() {
  try {
    const quests = await db.quest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        claims: { select: { claimerName: true, createdAt: true } },
      },
    })
    return NextResponse.json(
      {
        quests: quests.map((q) => ({
          id: q.id,
          title: q.title,
          details: q.details,
          location: q.location,
          deadlineText: q.deadlineText,
          bountyUsd: q.bountyUsd,
          posterName: q.posterName,
          claimed: q.claims.length > 0,
          claimedBy: q.claims[0]?.claimerName ?? null,
          createdAt: q.createdAt,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Quest list failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 5 quests per minute per IP (matches /api/help).
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`quests:${ip}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many quests. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const me = await getCurrentUser()
    const body = await req.json().catch(() => ({}))

    const title = sanitizeInput(body.title || '', 200)
    if (!title || title.length < 5) {
      return NextResponse.json(
        { error: 'Please describe the help you need (at least 5 characters).' },
        { status: 400 }
      )
    }
    const location = sanitizeInput(body.location || '', 120)
    if (!location) {
      return NextResponse.json({ error: 'Location is required' }, { status: 400 })
    }
    const deadlineText = sanitizeInput(body.deadlineText || '', 120)
    if (!deadlineText) {
      return NextResponse.json({ error: 'Deadline is required' }, { status: 400 })
    }
    const bountyUsd = Number(body.bountyUsd)
    if (!Number.isFinite(bountyUsd) || bountyUsd < 0.5 || bountyUsd > 10000) {
      return NextResponse.json(
        { error: 'Bounty must be between $0.50 and $10,000' },
        { status: 400 }
      )
    }
    const details = sanitizeInput(body.details || '', 1000) || null

    // Logged-in posters carry their account; visitors must leave a name +
    // contact so a claiming guide can reach them instantly.
    const posterName = me ? me.name : sanitizeInput(body.posterName || '', 100)
    const contact = sanitizeInput(body.contact || '', 200)
    if (!posterName) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 })
    }
    if (!contact) {
      return NextResponse.json(
        { error: 'A contact (phone / WhatsApp / Telegram) is required so guides can reach you' },
        { status: 400 }
      )
    }

    const saved = await db.quest.create({
      data: {
        title,
        details,
        location,
        deadlineText,
        bountyUsd,
        posterName,
        contact,
        userId: me?.id ?? null,
      },
    })
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (error) {
    console.error('Quest create failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
