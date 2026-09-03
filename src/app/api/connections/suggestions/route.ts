// People you may know — exclude existing connections (ACCEPTED, PENDING) and myself
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
      include: {
        connRequested: true,
        connReceived: true,
      },
    })
    if (!me) return NextResponse.json({ suggestions: [] })

    // Collect all user IDs already connected (any status) to me
    const excludeIds = new Set<string>([me.id])
    for (const c of me.connRequested) excludeIds.add(c.receiverId)
    for (const c of me.connReceived) excludeIds.add(c.requesterId)

    // Find users not in excludeIds, optionally exclude IGNORED previous invites
    const ignoredTargets = me.connRequested
      .filter((c) => c.status === 'IGNORED')
      .map((c) => c.receiverId)
    const ignoredRequesters = me.connReceived
      .filter((c) => c.status === 'IGNORED')
      .map((c) => c.requesterId)

    const suggestions = await db.user.findMany({
      where: {
        id: { notIn: Array.from(excludeIds) },
        // Don't re-suggest people who ignored / were ignored
        NOT: {
          id: { in: [...ignoredTargets, ...ignoredRequesters] },
        },
      },
      orderBy: { followersCount: 'desc' },
      take: 8,
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
      },
    })

    // For each suggestion, find mutual connections (count of common ACCEPTED connections)
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
        return { ...s, mutualCount }
      })
    )

    return NextResponse.json({ suggestions: suggestionsWithMutuals })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
