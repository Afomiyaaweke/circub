// Get incoming PENDING invitations to me
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ invitations: [] })

    const conns = await db.connection.findMany({
      where: {
        receiverId: me.id,
        status: 'PENDING',
      },
      include: {
        requester: {
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
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const invitations = conns.map((c) => ({
      id: c.id,
      note: c.note,
      createdAt: c.createdAt,
      user: c.requester,
    }))

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Failed to fetch invitations:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
