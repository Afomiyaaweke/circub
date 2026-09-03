// Connections: list my accepted connections
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ connections: [] })

    const conns = await db.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: me.id }, { receiverId: me.id }],
      },
      include: {
        requester: { select: { id: true, name: true, avatarColor: true, bio: true, headline: true, location: true, postsCount: true, followersCount: true, connectionsCount: true } },
        receiver: { select: { id: true, name: true, avatarColor: true, bio: true, headline: true, location: true, postsCount: true, followersCount: true, connectionsCount: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const connections = conns.map((c) => {
      const other = c.requesterId === me.id ? c.receiver : c.requester
      return other
    })

    return NextResponse.json({ connections })
  } catch (error) {
    console.error('Failed to fetch connections:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
