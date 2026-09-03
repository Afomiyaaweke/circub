// Get all users except current (MA)
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
    if (!me) return NextResponse.json({ users: [] })

    // Build set of ids already connected to me (any status)
    const connIds = new Set<string>()
    for (const c of me.connRequested) connIds.add(c.receiverId)
    for (const c of me.connReceived) connIds.add(c.requesterId)

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
      },
    })

    // Mark connection status
    // ACCEPTED: both sides connected with status=ACCEPTED
    // PENDING_OUTGOING: I requested, status=PENDING
    // PENDING_INCOMING: They requested me, status=PENDING
    const usersWithStatus = users.map((u) => {
      const acceptedTo = me.connRequested.find(
        (c) => c.receiverId === u.id && c.status === 'ACCEPTED'
      )
      const acceptedFrom = me.connReceived.find(
        (c) => c.requesterId === u.id && c.status === 'ACCEPTED'
      )
      const pendingOut = me.connRequested.find(
        (c) => c.receiverId === u.id && c.status === 'PENDING'
      )
      const pendingIn = me.connReceived.find(
        (c) => c.requesterId === u.id && c.status === 'PENDING'
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
