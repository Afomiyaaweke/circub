// Get all users except current — with connection status
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ users: [] })

    // Fetch my connections separately (getCurrentUser doesn't include)
    const myConns = await db.connection.findMany({
      where: {
        OR: [{ requesterId: me.id }, { receiverId: me.id }],
      },
    })

    // Build set of ids already connected to me (any status)
    const connIds = new Set<string>()
    for (const c of myConns) {
      if (c.requesterId === me.id) connIds.add(c.receiverId)
      else connIds.add(c.requesterId)
    }

    const users = await db.user.findMany({
      where: { id: { not: me.id } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        bio: true,
        headline: true,
        location: true,
        postsCount: true,
        followersCount: true,
        likesCount: true,
        connectionsCount: true,
        isLocal: true,
        verifiedLocal: true,
        companyName: true,
        companyIndustry: true,
      },
    })

    // Mark connection status
    const usersWithStatus = users.map((u) => {
      const acceptedTo = myConns.find(
        (c) => c.requesterId === me.id && c.receiverId === u.id && c.status === 'ACCEPTED'
      )
      const acceptedFrom = myConns.find(
        (c) => c.receiverId === me.id && c.requesterId === u.id && c.status === 'ACCEPTED'
      )
      const pendingOut = myConns.find(
        (c) => c.requesterId === me.id && c.receiverId === u.id && c.status === 'PENDING'
      )
      const pendingIn = myConns.find(
        (c) => c.receiverId === me.id && c.requesterId === u.id && c.status === 'PENDING'
      )

      return {
        ...u,
        isConnected: !!(acceptedTo || acceptedFrom),
        hasPendingRequest: !!(pendingOut || pendingIn),
      }
    })

    return NextResponse.json({ users: usersWithStatus })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
