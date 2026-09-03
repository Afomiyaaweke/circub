// Suggested users (top users by followers, not already followed)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
      include: { followsFrom: true },
    })
    if (!me) return NextResponse.json({ suggestions: [] })

    const followingIds = new Set(me.followsFrom.map((f) => f.followeeId))
    followingIds.add(me.id)

    const candidates = await db.user.findMany({
      where: { id: { notIn: Array.from(followingIds) } },
      orderBy: { followersCount: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        avatarColor: true,
        bio: true,
        postsCount: true,
        followersCount: true,
      },
    })

    return NextResponse.json({ suggestions: candidates })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
