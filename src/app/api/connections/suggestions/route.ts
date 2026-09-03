// People you may know — exclude existing connections (ACCEPTED, PENDING) and myself
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ suggestions: [] })

    // Fetch my connections
    const myConns = await db.connection.findMany({
      where: { OR: [{ requesterId: me.id }, { receiverId: me.id }] },
    })

    const excludeIds = new Set<string>([me.id])
    for (const c of myConns) {
      if (c.requesterId === me.id) excludeIds.add(c.receiverId)
      else excludeIds.add(c.requesterId)
    }

    const suggestions = await db.user.findMany({
      where: { id: { notIn: Array.from(excludeIds) } },
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
        isLocal: true,
        verifiedLocal: true,
        companyName: true,
        companyIndustry: true,
      },
    })

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
        return { ...s, mutualCount }
      })
    )

    return NextResponse.json({ suggestions: suggestionsWithMutuals })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
