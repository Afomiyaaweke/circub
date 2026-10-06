// Follow / unfollow - the one-way network LINK.
// GET    = current follow state for the FollowButton
//          ({ auth, following, followersCount, isSelf }; auth:false for guests)
// POST   = follow   (idempotent; second call just returns the current state)
// DELETE = unfollow
// Unlike the LinkedIn-style /api/connections/request this needs NO approval
// from the other side. Blocking in either direction refuses it (403
// 'blocked'). Counts live on User: followersCount (theirs) + followingCount
// (mine) so profiles and the network manager can show them everywhere.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    let me: { id: string } | null = null
    try { me = await getCurrentUser() } catch {}
    if (!me || me.id === 'guest') {
      return NextResponse.json({ auth: false, following: false, followersCount: 0, isSelf: false })
    }
    const [row, target] = await Promise.all([
      db.follow.findUnique({
        where: { followerId_followingId: { followerId: me.id, followingId: targetId } },
        select: { id: true },
      }),
      db.user.findUnique({ where: { id: targetId }, select: { followersCount: true } }),
    ])
    return NextResponse.json({
      auth: true,
      following: !!row,
      followersCount: target?.followersCount ?? 0,
      isSelf: me.id === targetId,
    })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

async function blockedBetween(a: string, b: string) {
  return db.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === targetId) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
    }

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, deactivatedAt: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (await blockedBetween(me.id, targetId)) {
      return NextResponse.json({ error: 'blocked' }, { status: 403 })
    }

    const existing = await db.follow.findUnique({
      where: {
        followerId_followingId: { followerId: me.id, followingId: targetId },
      },
      select: { id: true },
    })
    if (existing) {
      // Idempotent: already following - report the current state honestly.
      const t = await db.user.findUnique({
        where: { id: targetId },
        select: { followersCount: true },
      })
      return NextResponse.json({ following: true, followersCount: t?.followersCount ?? 0 })
    }

    const [, t] = await db.$transaction([
      db.follow.create({
        data: { followerId: me.id, followingId: targetId },
      }),
      db.user.update({
        where: { id: targetId },
        data: { followersCount: { increment: 1 } },
        select: { followersCount: true },
      }),
      db.user.update({
        where: { id: me.id },
        data: { followingCount: { increment: 1 } },
      }),
    ])

    return NextResponse.json({ following: true, followersCount: t.followersCount })
  } catch (error) {
    console.error('Failed to follow:', error)
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
      return NextResponse.json({ error: 'Cannot unfollow yourself' }, { status: 400 })
    }

    const existing = await db.follow.findUnique({
      where: {
        followerId_followingId: { followerId: me.id, followingId: targetId },
      },
      select: { id: true },
    })
    if (!existing) {
      const t = await db.user.findUnique({
        where: { id: targetId },
        select: { followersCount: true },
      })
      // Idempotent: not following - report the current state honestly.
      return NextResponse.json({ following: false, followersCount: t?.followersCount ?? 0 })
    }

    const [, t] = await db.$transaction([
      db.follow.delete({ where: { id: existing.id } }),
      db.user.update({
        where: { id: targetId },
        data: { followersCount: { decrement: 1 } },
        select: { followersCount: true },
      }),
      db.user.update({
        where: { id: me.id },
        data: { followingCount: { decrement: 1 } },
      }),
    ])

    return NextResponse.json({ following: false, followersCount: t.followersCount })
  } catch (error) {
    console.error('Failed to unfollow:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
