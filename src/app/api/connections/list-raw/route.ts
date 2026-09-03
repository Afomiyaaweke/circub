// Raw connections list (with connection IDs) for UI to find/remove
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ connections: [] })

    const conns = await db.connection.findMany({
      where: {
        OR: [{ requesterId: me.id }, { receiverId: me.id }],
      },
      select: {
        id: true,
        requesterId: true,
        receiverId: true,
        status: true,
      },
    })

    return NextResponse.json({ connections: conns })
  } catch (error) {
    console.error('Failed to fetch raw connections:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
