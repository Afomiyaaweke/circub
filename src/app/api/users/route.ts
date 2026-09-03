// Get all users except current (MA)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const users = await db.user.findMany({
      where: { email: { not: 'ma@socialcircle.app' } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        bio: true,
        postsCount: true,
        followersCount: true,
        likesCount: true,
      },
    })

    // Get current user's follows
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
      include: { followsFrom: true },
    })
    const followingIds = new Set(me?.followsFrom.map((f) => f.followeeId) || [])

    const usersWithFollowStatus = users.map((u) => ({
      ...u,
      isFollowing: followingIds.has(u.id),
    }))

    return NextResponse.json({ users: usersWithFollowStatus })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
