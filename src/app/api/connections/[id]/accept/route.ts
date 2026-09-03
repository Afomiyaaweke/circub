// Accept a connection request
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const conn = await db.connection.findUnique({ where: { id } })
    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }
    if (conn.receiverId !== me.id) {
      return NextResponse.json(
        { error: 'Unauthorized: only the receiver can accept' },
        { status: 403 }
      )
    }
    if (conn.status !== 'PENDING') {
      return NextResponse.json({ error: 'Connection is not pending' }, { status: 400 })
    }

    await db.connection.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    })

    // Increment both users' connectionsCount
    await db.user.update({
      where: { id: me.id },
      data: { connectionsCount: { increment: 1 } },
    })
    await db.user.update({
      where: { id: conn.requesterId },
      data: { connectionsCount: { increment: 1 } },
    })

    return NextResponse.json({ status: 'ACCEPTED' })
  } catch (error) {
    console.error('Failed to accept connection:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
