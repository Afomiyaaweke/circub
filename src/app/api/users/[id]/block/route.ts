// Block / unblock - the hard cut between two people.
// POST   = block (idempotent). Blocking REMOVES any Connection row between
//          the two users (with connectionsCount adjustments when it was
//          ACCEPTED) and every Follow in BOTH directions (with the matching
//          followers/following count adjustments), then records the Block.
// DELETE = unblock. Only removes the Block row - nothing else is restored;
//          if the people want their link back they follow/connect again.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === targetId) {
      return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })
    }

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const already = await db.block.findUnique({
      where: { blockerId_blockedId: { blockerId: me.id, blockedId: targetId } },
      select: { id: true },
    })

    if (!already) {
      // Snapshot the links BEFORE deleting them so the counters can be
      // adjusted by exactly what was torn down - never invented, never lost.
      const [conns, follows] = await Promise.all([
        db.connection.findMany({
          where: {
            OR: [
              { requesterId: me.id, receiverId: targetId },
              { requesterId: targetId, receiverId: me.id },
            ],
          },
          select: { id: true, status: true, requesterId: true, receiverId: true },
        }),
        db.follow.findMany({
          where: {
            OR: [
              { followerId: me.id, followingId: targetId },
              { followerId: targetId, followingId: me.id },
            ],
          },
          select: { id: true, followerId: true, followingId: true },
        }),
      ])

      await db.$transaction([
        // Tearing down follows: each side loses one from its counters.
        ...follows.map((f) =>
          db.user.update({
            where: { id: f.followerId },
            data: { followingCount: { decrement: 1 } },
          })
        ),
        ...follows.map((f) =>
          db.user.update({
            where: { id: f.followingId },
            data: { followersCount: { decrement: 1 } },
          })
        ),
        ...follows.map((f) => db.follow.delete({ where: { id: f.id } })),
        // Tearing down connections: an ACCEPTED link counted for BOTH sides.
        ...conns
          .filter((c) => c.status === 'ACCEPTED')
          .flatMap((c) => [
            db.user.update({
              where: { id: c.requesterId },
              data: { connectionsCount: { decrement: 1 } },
            }),
            db.user.update({
              where: { id: c.receiverId },
              data: { connectionsCount: { decrement: 1 } },
            }),
          ]),
        ...conns.map((c) => db.connection.delete({ where: { id: c.id } })),
        db.block.create({
          data: { blockerId: me.id, blockedId: targetId },
        }),
      ])
    }

    const blockedCount = await db.block.count({ where: { blockerId: me.id } })
    return NextResponse.json({ blocked: true, blockedCount })
  } catch (error) {
    console.error('Failed to block:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === targetId) {
      return NextResponse.json({ error: 'Cannot unblock yourself' }, { status: 400 })
    }

    await db.block.deleteMany({
      where: { blockerId: me.id, blockedId: targetId },
    })

    const blockedCount = await db.block.count({ where: { blockerId: me.id } })
    return NextResponse.json({ blocked: false, blockedCount })
  } catch (error) {
    console.error('Failed to unblock:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
