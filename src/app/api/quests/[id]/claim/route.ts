// POST /api/quests/[id]/claim - 1-Click Claim on an instant bounty quest
// (v215). Open to everyone (travelers post, local guides claim - no account
// needed, same spirit as asking on /help). The FIRST claim wins: a DB-unique
// constraint allows one active claim per quest, safe across serverless
// concurrency. On success the claimer INSTANTLY receives the poster's
// contact so the handover + payout can be arranged directly (paid on
// completion via the escrow rails shown on the board).
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
