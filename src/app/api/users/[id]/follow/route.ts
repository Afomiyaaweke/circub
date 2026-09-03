// Follow / unfollow a user
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params

    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (me.id === targetId) {
      return NextResponse.json(
        { error: 'Cannot follow yourself' },
        { status: 400 }
      )
    }

    const target = await db.user.findUnique({ where: { id: targetId } })
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    const existing = await db.follow.findUnique({
      where: {
        followerId_followeeId: { followerId: me.id, followeeId: targetId },
      },
    })

    if (existing) {
      // Unfollow
      await db.follow.delete({ where: { id: existing.id } })
      await db.user.update({
        where: { id: targetId },
        data: { followersCount: { decrement: 1 } },
      })
      return NextResponse.json({ following: false })
    } else {
      // Follow
      await db.follow.create({
        data: { followerId: me.id, followeeId: targetId },
      })
      await db.user.update({
        where: { id: targetId },
        data: { followersCount: { increment: 1 } },
      })
      return NextResponse.json({ following: true })
    }
  } catch (error) {
    console.error('Failed to toggle follow:', error)
    return NextResponse.json(
      { error: 'Failed to toggle follow' },
      { status: 500 }
    )
  }
}
