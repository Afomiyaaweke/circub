// My follows - both sides of the one-way network link, for the Network tab.
// GET -> { following: [user + isFollowing: true], followers: [user + isFollowing],
//          followingCount, followersCount }
// `isFollowing` on a FOLLOWERS row says whether I follow that person back,
// so the row can offer "Follow back" instead of a bare Follow.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const USER_SUMMARY = {
  id: true,
  name: true,
  username: true,
  avatarColor: true,
  bio: true,
  headline: true,
  location: true,
  postsCount: true,
  followersCount: true,
  followingCount: true,
  connectionsCount: true,
} as const

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json({
        following: [],
        followers: [],
        followingCount: 0,
        followersCount: 0,
      })
    }

    const [made, received] = await Promise.all([
      db.follow.findMany({
        where: { followerId: me.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, following: { select: USER_SUMMARY } },
      }),
      db.follow.findMany({
        where: { followingId: me.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, follower: { select: USER_SUMMARY } },
      }),
    ])

    const iFollow = new Set(made.map((r) => r.following.id))

    return NextResponse.json({
      following: made.map((r) => ({ ...r.following, isFollowing: true, followedAt: r.createdAt })),
      followers: received.map((r) => ({
        ...r.follower,
        isFollowing: iFollow.has(r.follower.id),
        followedAt: r.createdAt,
      })),
      followingCount: me.followingCount,
      followersCount: me.followersCount,
    })
  } catch (error) {
    console.error('Failed to fetch follows:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
