// Suggested users — exclude already connected / pending (for right sidebar)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
      include: { connRequested: true, connReceived: true },
    })
    if (!me) return NextResponse.json({ suggestions: [] })

    const excludeIds = new Set<string>([me.id])
    for (const c of me.connRequested) excludeIds.add(c.receiverId)
    for (const c of me.connReceived) excludeIds.add(c.requesterId)

    // IGNORED ones we don't re-suggest either
    const ignoredIds = new Set<string>([
      ...me.connRequested.filter((c) => c.status === 'IGNORED').map((c) => c.receiverId),
      ...me.connReceived.filter((c) => c.status === 'IGNORED').map((c) => c.requesterId),
    ])

    const candidates = await db.user.findMany({
      where: {
        id: {
          notIn: Array.from(excludeIds),
          // ensure ignored are also excluded (they are via excludeIds already)
        },
      },
      orderBy: { followersCount: 'desc' },
      take: 4,
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

    void ignoredIds

    return NextResponse.json({ suggestions: candidates })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
