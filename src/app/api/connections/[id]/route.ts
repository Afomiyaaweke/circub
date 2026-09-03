// Remove a connection (DELETE)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
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
    if (conn.requesterId !== me.id && conn.receiverId !== me.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const wasAccepted = conn.status === 'ACCEPTED'

    await db.connection.delete({ where: { id } })

    if (wasAccepted) {
      // Decrement both users' connectionsCount
      await db.user.update({
        where: { id: conn.requesterId },
        data: { connectionsCount: { decrement: 1 } },
      })
      await db.user.update({
        where: { id: conn.receiverId },
        data: { connectionsCount: { decrement: 1 } },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove connection:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
