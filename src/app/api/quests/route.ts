// GET /api/quests  - list instant side-hustle bounty quests (public, v215).
// POST /api/quests - post an instant quest ("I need help around Merkato").
// Anyone can post: logged-in users get their account attached (userId),
// visitors leave a name + a contact channel. The poster's contact is NEVER
// returned by this list - it is revealed only to the single winner via
// POST /api/quests/[id]/claim ("guide contacts the traveler instantly").
// v219 CLAIMER PRIVACY: the claimer's name/contact are no longer exposed to
// everyone either - the public list only carries a `claimed` boolean, a
// `claimCount` (v248: MANY users can claim the same bounty - the count shows
// on the card while the individual takers stay poster-only) plus two
// session-scoped flags (isMine = I posted this, myClaim = I claimed this) so
// the board can render the owner's Edit/Delete and the claimer's Drop claim.
// Applicant details live exclusively in GET /api/quests/mine (poster-only).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, checkRateLimit, sanitizeInput } from '@/lib/session'
import { normalizeBountyCurrency } from '@/lib/bounty-money'

export async function GET() {
  try {
    // Session-aware flags only - never claimer PII (v219 privacy contract).
    const me = await getCurrentUser()
    // v251: small first - the quest board paints from 40 rows instead of 100;
    // old quests stay reachable via the filters/board search.
    const quests = await db.quest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        claims: { select: { userId: true } },
        // v229: the poster's username (public anyway) so the deck's Chat
        // action can open a member poster's profile. Guests post without an
        // account, so this stays null for them.
        user: { select: { username: true } },
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
          bountyCurrency: q.bountyCurrency,
          posterName: q.posterName,
          posterUsername: q.user?.username ?? null,
          claimed: q.claims.length > 0,
          claimCount: q.claims.length,
          isMine: !!me && q.userId === me.id,
          myClaim: !!me && q.claims.some((c) => c.userId === me.id),
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
    // v245: the deadline is OPTIONAL - a bounty without a fixed deadline is
    // valid. Stored as '' (schema column stays non-nullable) and the card
    // hides the deadline chip when it is empty.
    const deadlineText = sanitizeInput(body.deadlineText || '', 120)
    // v253: NO min/max requirement - any amount from 0 up is a valid bounty,
    // in any of the offered currencies. Only NaN and negatives are rejected.
    const bountyUsd = Number(body.bountyUsd)
    if (!Number.isFinite(bountyUsd) || bountyUsd < 0) {
      return NextResponse.json(
        { error: 'Bounty amount must be 0 or more' },
        { status: 400 }
      )
    }
    // v253: the currency travels with the bounty - the poster picks it from
    // the form's select; unknown values fall back to USD (old rows stay valid).
    const bountyCurrency = normalizeBountyCurrency(body.bountyCurrency)
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
        bountyCurrency,
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
