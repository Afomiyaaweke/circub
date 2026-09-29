// People you may know · exclude existing connections (ACCEPTED, PENDING),
// myself, and anyone blocked in EITHER direction (a block is the hard cut:
// neither side should ever see the other suggested again). Each suggestion
// carries `isFollowing` so the card can show the Follow/Following state.
// Paginated: ?offset=0&limit=8 -> { suggestions, hasMore, nextOffset } so the
// Network tab can "Load more" in pages instead of one hard take: 8.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ suggestions: [], hasMore: false, nextOffset: 0 })

    const { searchParams } = new URL(req.url)
    const offsetRaw = Number(searchParams.get('offset') || 0)
    const limitRaw = Number(searchParams.get('limit') || 8)
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(24, Math.floor(limitRaw)) : 8

    // Fetch my connections
    const myConns = await db.connection.findMany({
      where: { OR: [{ requesterId: me.id }, { receiverId: me.id }] },
    })

    const excludeIds = new Set<string>([me.id])
    for (const c of myConns) {
      if (c.requesterId === me.id) excludeIds.add(c.receiverId)
      else excludeIds.add(c.requesterId)
    }

    // Blocked in either direction is also excluded - blocking is the hard cut.
    const blocks = await db.block.findMany({
      where: { OR: [{ blockerId: me.id }, { blockedId: me.id }] },
      select: { blockerId: true, blockedId: true },
    })
    for (const b of blocks) {
      excludeIds.add(b.blockerId === me.id ? b.blockedId : b.blockerId)
    }

    // take one extra row so hasMore costs nothing extra
    const found = await db.user.findMany({
      where: { id: { notIn: Array.from(excludeIds) } },
      orderBy: { followersCount: 'desc' },
      skip: offset,
      take: limit + 1,
      select: {
        id: true,
        name: true,
        avatarColor: true,
        bio: true,
        headline: true,
        location: true,
        postsCount: true,
        followersCount: true,
        connectionsCount: true,
        isLocal: true,
        verifiedLocal: true,
        idVerified: true,
        companyName: true,
        companyIndustry: true,
      },
    })

    const hasMore = found.length > limit
    const suggestions = hasMore ? found.slice(0, limit) : found

    // For each suggestion, find mutual connections
    const allMyConns = await db.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: me.id }, { receiverId: me.id }],
      },
      select: { requesterId: true, receiverId: true },
    })
    const myConnIds = new Set(
      allMyConns.flatMap((c) =>
        c.requesterId === me.id ? [c.receiverId] : [c.requesterId]
      )
    )

    const suggestionsWithMutuals = await Promise.all(
      suggestions.map(async (s) => {
        const theirConns = await db.connection.findMany({
          where: {
            status: 'ACCEPTED',
            OR: [{ requesterId: s.id }, { receiverId: s.id }],
          },
          select: { requesterId: true, receiverId: true },
        })
        const theirConnIds = new Set(
          theirConns.flatMap((c) =>
            c.requesterId === s.id ? [c.receiverId] : [c.requesterId]
          )
        )
        const mutualCount = [...myConnIds].filter((id) =>
          theirConnIds.has(id)
        ).length
        const isFollowing = await db.follow.findUnique({
          where: {
            followerId_followingId: { followerId: me.id, followingId: s.id },
          },
          select: { id: true },
        })
        return { ...s, mutualCount, isFollowing: !!isFollowing }
      })
    )

    return NextResponse.json({
      suggestions: suggestionsWithMutuals,
      hasMore,
      nextOffset: offset + suggestions.length,
    })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
