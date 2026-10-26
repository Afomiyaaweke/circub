// POST /api/quests/[id]/claim - 1-Click Claim on an instant bounty quest
// (v215). Open to everyone (travelers post, local guides claim - no account
// needed, same spirit as asking on /help). The FIRST claim wins: a DB-unique
// constraint allows one active claim per quest, safe across serverless
// concurrency. On success the claimer INSTANTLY receives the poster's
// contact so the handover + payout can be arranged directly (paid on
// completion via the escrow rails shown on the board).
//
// DELETE /api/quests/[id]/claim - remove the active claim (v219). Two
// legitimate paths:
// - the CLAIMER drops their own claim (freed-up, wrong click...) - the quest
//   reopens for the next taker;
// - the POSTER removes the applicant (managing applications from the profile
//   Bounties panel or the board card).
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
      })
    } catch (e) {
      // P2002 = someone already claimed this bounty (first claim wins).
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json(
          { error: 'Already claimed - someone grabbed this bounty first.' },
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

// DELETE - claimer drops their claim, or the poster removes the applicant.
// The quest goes back to open either way (first-claim-wins can re-run).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()

    const quest = await db.quest.findUnique({
      where: { id },
      include: { claims: true },
    })
    if (!quest) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }
    const claim = quest.claims[0]
    if (!claim) {
      return NextResponse.json({ error: 'No active claim on this quest.' }, { status: 404 })
    }

    const isClaimer = !!me && claim.userId === me.id
    const isPoster = !!me && quest.userId === me.id

    // Guest path: echo back the exact credentials the claim was made with.
    let guestMatch = false
    if (!isClaimer && !isPoster) {
      const body = await req.json().catch(() => ({}))
      const name = sanitizeInput(body?.claimerName || '', 100)
      const contact = sanitizeInput(body?.claimerContact || '', 200)
      guestMatch = !!name && !!contact && claim.claimerName === name && claim.claimerContact === contact
    }

    if (!isClaimer && !isPoster && !guestMatch) {
      return NextResponse.json(
        { error: 'Only the claimer or the poster can remove this claim.' },
        { status: 403 }
      )
    }

    await db.questClaim.delete({ where: { id: claim.id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Quest claim delete failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
