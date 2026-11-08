// POST /api/quests/[id]/claim - 1-Click Claim on an instant bounty quest
// (v215). Open to everyone (travelers post, local guides claim - no account
// needed, same spirit as asking on /help).
//
// v248 MANY TAKERS (user: "make the bounty to be clamed by many users and
// show that to the poster"): a bounty is no longer single-winner. MANY users
// can claim the same quest - every claim is its own row, the poster sees ALL
// of them (name + contact) in the profile Bounties panel, and every claimer
// INSTANTLY receives the poster's contact so the handover + payout can be
// arranged directly (paid on completion via the escrow rails on the board).
// Duplicate guards: a logged-in member can claim the same quest only once
// (DB-unique [questId, userId], safe across serverless concurrency); guests
// are matched app-side by the exact claimerName + claimerContact they used.
//
// DELETE /api/quests/[id]/claim - remove ONE claim (v219, v248). Two
// legitimate paths:
// - the CLAIMER drops their own claim (freed-up, wrong click...) - the other
//   takers are untouched;
// - the POSTER removes a specific applicant (managing applications from the
//   profile Bounties panel) - pass `claimId` in the body.
// Guests who claimed without an account can still drop by echoing back the
// exact claimerName + claimerContact they claimed with - only the claimer
// knows those, so the match is the identity check.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, checkRateLimit, sanitizeInput } from '@/lib/session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()

    // Rate limit: max 10 claims per minute per IP.
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`quest-claim:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many claims. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const claimerName = sanitizeInput(body.claimerName || '', 100)
    const claimerContact = sanitizeInput(body.claimerContact || '', 200)
    if (!claimerName || !claimerContact) {
      return NextResponse.json(
        { error: 'Your name and a contact (phone / WhatsApp / Telegram) are required to claim' },
        { status: 400 }
      )
    }

    const quest = await db.quest.findUnique({ where: { id } })
    if (!quest) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }

    // v248 duplicate guards (same quest only):
    // - a member claiming twice -> 409 (the DB unique would catch it anyway);
    // - a guest echoing the exact name+contact they already used -> 409.
    const existing = await db.questClaim.findMany({
      where: { questId: id },
      select: { userId: true, claimerName: true, claimerContact: true },
    })
    if (me && existing.some((c) => c.userId === me.id)) {
      return NextResponse.json(
        { error: 'You already claimed this bounty - find it under Profile > Bounties > Claimed.' },
        { status: 409 }
      )
    }
    if (
      !me &&
      existing.some((c) => !c.userId && c.claimerName === claimerName && c.claimerContact === claimerContact)
    ) {
      return NextResponse.json(
        { error: 'You already claimed this bounty with this name and contact.' },
        { status: 409 }
      )
    }

    try {
      const saved = await db.questClaim.create({
        data: {
          questId: id,
          claimerName,
          claimerContact,
          userId: me?.id ?? null,
        },
      })
      // Instant contact: the claimer gets the poster's channel immediately.
      return NextResponse.json({
        ok: true,
        id: saved.id,
        posterName: quest.posterName,
        posterContact: quest.contact,
        claimerName: saved.claimerName,
        // v248: how many takers the bounty now has (poster sees them all).
        claimCount: existing.length + 1,
      })
    } catch (e) {
      // P2002 = the same logged-in member claimed this quest twice.
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json(
          { error: 'You already claimed this bounty - find it under Profile > Bounties > Claimed.' },
          { status: 409 }
        )
      }
      throw e
    }
  } catch (error) {
    console.error('Quest claim failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// DELETE - claimer drops their own claim, or the poster removes a specific
// applicant. Other takers on the same bounty are never touched.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()

    const quest = await db.quest.findUnique({
      where: { id },
      include: { claims: { orderBy: { createdAt: 'asc' } } },
    })
    if (!quest) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }
    if (quest.claims.length === 0) {
      return NextResponse.json({ error: 'No active claim on this quest.' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const claimId = typeof body?.claimId === 'string' ? body.claimId : ''

    const isPoster = !!me && quest.userId === me.id

    // POSTER path: remove a SPECIFIC applicant by claimId (the profile
    // Bounties panel lists every taker with its own remove button).
    if (isPoster) {
      if (!claimId) {
        // Back-compat: without a claimId the poster's "drop" targeted the
        // only claim there was; with many takers that is ambiguous, so the
        // oldest claim (first taker) is removed and the rest stay.
        await db.questClaim.delete({ where: { id: quest.claims[0].id } })
        return NextResponse.json({ ok: true, removed: 1, remaining: quest.claims.length - 1 })
      }
      const target = quest.claims.find((c) => c.id === claimId)
      if (!target) {
        return NextResponse.json({ error: 'That applicant is not on this quest.' }, { status: 404 })
      }
      await db.questClaim.delete({ where: { id: target.id } })
      return NextResponse.json({ ok: true, removed: 1, remaining: quest.claims.length - 1 })
    }

    // CLAIMER path (logged in): drop MY claim(s) on this quest.
    if (me) {
      const mine = quest.claims.filter((c) => c.userId === me.id)
      if (mine.length > 0) {
        const ids = claimId ? mine.filter((c) => c.id === claimId).map((c) => c.id) : mine.map((c) => c.id)
        if (ids.length === 0) {
          return NextResponse.json({ error: 'That claim is not yours.' }, { status: 403 })
        }
        await db.questClaim.deleteMany({ where: { id: { in: ids } } })
        return NextResponse.json({ ok: true, removed: ids.length, remaining: quest.claims.length - ids.length })
      }
    }

    // GUEST path: echo back the exact credentials the claim was made with.
    // claimId narrows it to one row; otherwise the first exact match goes.
    const name = sanitizeInput(body?.claimerName || '', 100)
    const contact = sanitizeInput(body?.claimerContact || '', 200)
    const match = quest.claims.find(
      (c) =>
        !c.userId &&
        !!name &&
        !!contact &&
        c.claimerName === name &&
        c.claimerContact === contact &&
        (!claimId || c.id === claimId)
    )
    if (!match) {
      return NextResponse.json(
        { error: 'Only the claimer or the poster can remove this claim.' },
        { status: 403 }
      )
    }
    await db.questClaim.delete({ where: { id: match.id } })
    return NextResponse.json({ ok: true, removed: 1, remaining: quest.claims.length - 1 })
  } catch (error) {
    console.error('Quest claim delete failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
