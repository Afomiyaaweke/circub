// Suggested users · exclude already connected / pending (for right sidebar)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ suggestions: [] })

    // Fetch my connections separately (getCurrentUser doesn't include)
    const myConns = await db.connection.findMany({
      where: { OR: [{ requesterId: me.id }, { receiverId: me.id }] },
    })

    const excludeIds = new Set<string>([me.id])
    for (const c of myConns) {
      if (c.requesterId === me.id) excludeIds.add(c.receiverId)
      else excludeIds.add(c.requesterId)
    }

    const candidates = await db.user.findMany({
      where: {
        id: { notIn: Array.from(excludeIds) },
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
        isLocal: true,
        verifiedLocal: true,
        companyName: true,
        companyIndustry: true,
      },
    })

    return NextResponse.json({ suggestions: candidates })
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
