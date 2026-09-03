// Get outgoing PENDING requests (requests I sent that haven't been accepted)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ pending: [] })

    const conns = await db.connection.findMany({
      where: {
        requesterId: me.id,
        status: 'PENDING',
      },
      include: {
        receiver: {
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

    const pending = conns.map((c) => ({
      id: c.id,
      note: c.note,
      createdAt: c.createdAt,
      user: c.receiver,
    }))

    return NextResponse.json({ pending })
  } catch (error) {
    console.error('Failed to fetch pending requests:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
