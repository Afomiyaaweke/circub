// GET /api/quests/mine - PRIVATE bounty management feed (v219).
// Auth required. Two owner-scoped views in one response:
//
// - `posted`:  quests I posted, each with ALL of its applicants IN FULL
//              (v248: a bounty can be claimed by MANY users) - every taker's
//              claimerName + claimerContact + when. This is the ONLY place
//              claimer contact details ever leave the server, and only to the
//              poster ("on profile a place to manage applicants" - the user's
//              "my escort place"). The first taker is ALSO mirrored in the
//              legacy `claim` field so older clients keep working.
// - `claimed`: quests I claimed, each with the poster's name + contact so the
//              claimer can always re-reach the poster after a reload (the
//              claim response revealed it once; this keeps it available).
//
// Everyone else gets 401. No endpoint may ever mix these into the public list.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const [posted, myClaims] = await Promise.all([
      db.quest.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          claims: {
            select: {
              id: true,
              claimerName: true,
              claimerContact: true,
              createdAt: true,
              user: { select: { id: true, name: true, username: true } },
            },
          },
        },
      }),
      db.questClaim.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          quest: {
            select: {
              id: true,
              title: true,
              location: true,
              deadlineText: true,
              bountyUsd: true,
              bountyCurrency: true,
              askTypes: true,
              posterName: true,
              contact: true,
              createdAt: true,
            },
          },
        },
      }),
    ])

    return NextResponse.json(
      {
        posted: posted.map((q) => ({
          id: q.id,
          title: q.title,
          details: q.details,
          location: q.location,
          deadlineText: q.deadlineText,
          bountyUsd: q.bountyUsd,
          bountyCurrency: q.bountyCurrency,
          askTypes: q.askTypes,
          posterName: q.posterName,
          contact: q.contact,
          createdAt: q.createdAt,
          // v248: EVERY taker, oldest first - the poster's applicant inbox.
          claims: q.claims.map((c) => ({
            id: c.id,
            claimerName: c.claimerName,
            claimerContact: c.claimerContact,
            createdAt: c.createdAt,
            claimerUser: c.user
              ? { id: c.user.id, name: c.user.name, username: c.user.username }
              : null,
          })),
          claim: q.claims[0]
            ? {
                id: q.claims[0].id,
                claimerName: q.claims[0].claimerName,
                claimerContact: q.claims[0].claimerContact,
                createdAt: q.claims[0].createdAt,
                claimerUser: q.claims[0].user
                  ? { id: q.claims[0].user.id, name: q.claims[0].user.name, username: q.claims[0].user.username }
                  : null,
              }
            : null,
        })),
        claimed: myClaims.map((c) => ({
          id: c.quest.id,
          title: c.quest.title,
          location: c.quest.location,
          deadlineText: c.quest.deadlineText,
          bountyUsd: c.quest.bountyUsd,
          bountyCurrency: c.quest.bountyCurrency,
          askTypes: c.quest.askTypes,
          posterName: c.quest.posterName,
          posterContact: c.quest.contact,
          claimedAt: c.createdAt,
          createdAt: c.quest.createdAt,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Quest mine failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
