// PATCH  /api/quests/[id] - the POSTER edits their open bounty quest (v219).
// DELETE /api/quests/[id] - the POSTER deletes their quest (claims cascade).
//
// Ownership is enforced by the session: only the account that posted the
// quest (quest.userId) may change or remove it. Guest-posted quests (no
// userId) have no owner to verify and stay unmanaged, as before.
//
// EDIT LOCK: a claimed quest's terms are frozen - the claimer accepted the
// bounty/deadline as posted, so silent edits would be unfair. Response 409
// tells the poster to remove the applicant first (from the profile Bounties
// panel or the board card) if they really need to change the terms.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, sanitizeInput } from '@/lib/session'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json({ error: 'Sign in to manage your quests.' }, { status: 401 })
    }

    const quest = await db.quest.findUnique({
      where: { id },
      include: { claims: { select: { id: true } } },
    })
    if (!quest) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }
    if (quest.userId !== me.id) {
      return NextResponse.json({ error: 'Only the poster can edit this quest.' }, { status: 403 })
    }
    if (quest.claims.length > 0) {
      return NextResponse.json(
        { error: 'This quest is claimed - its terms are locked. Remove the applicant first if you need to change them.' },
        { status: 409 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const data: {
      title?: string
      details?: string | null
      location?: string
      deadlineText?: string
      bountyUsd?: number
      contact?: string
    } = {}

    if (body.title !== undefined) {
      const title = sanitizeInput(body.title || '', 200)
      if (!title || title.length < 5) {
        return NextResponse.json(
          { error: 'Please describe the help you need (at least 5 characters).' },
          { status: 400 }
        )
      }
      data.title = title
    }
    if (body.details !== undefined) {
      const details = sanitizeInput(body.details || '', 1000)
      data.details = details || null
    }
    if (body.location !== undefined) {
      const location = sanitizeInput(body.location || '', 120)
      if (!location) {
        return NextResponse.json({ error: 'Location is required' }, { status: 400 })
      }
      data.location = location
    }
    if (body.deadlineText !== undefined) {
      const deadlineText = sanitizeInput(body.deadlineText || '', 120)
      if (!deadlineText) {
        return NextResponse.json({ error: 'Deadline is required' }, { status: 400 })
      }
      data.deadlineText = deadlineText
    }
    if (body.bountyUsd !== undefined) {
      const bountyUsd = Number(body.bountyUsd)
      if (!Number.isFinite(bountyUsd) || bountyUsd < 0.5 || bountyUsd > 10000) {
        return NextResponse.json(
          { error: 'Bounty must be between $0.50 and $10,000' },
          { status: 400 }
        )
      }
      data.bountyUsd = bountyUsd
    }
    if (body.contact !== undefined && String(body.contact).trim() !== '') {
      const contact = sanitizeInput(body.contact || '', 200)
      if (!contact) {
        return NextResponse.json({ error: 'Contact cannot be empty' }, { status: 400 })
      }
      data.contact = contact
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await db.quest.update({ where: { id }, data })
    return NextResponse.json({
      ok: true,
      quest: {
        id: updated.id,
        title: updated.title,
        details: updated.details,
        location: updated.location,
        deadlineText: updated.deadlineText,
        bountyUsd: updated.bountyUsd,
      },
    })
  } catch (error) {
    console.error('Quest update failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json({ error: 'Sign in to manage your quests.' }, { status: 401 })
    }

    const quest = await db.quest.findUnique({
      where: { id },
      select: { userId: true },
    })
    if (!quest) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }
    if (quest.userId !== me.id) {
      return NextResponse.json({ error: 'Only the poster can delete this quest.' }, { status: 403 })
    }

    // Claims cascade at the DB level; the explicit deleteMany keeps the
    // removal deterministic even if a future schema drops the cascade.
    await db.questClaim.deleteMany({ where: { questId: id } })
    await db.quest.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Quest delete failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
