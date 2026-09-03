// Send a connection request (POST)
// Body: { receiverId: string, note?: string }
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { receiverId, note } = body

    if (!receiverId) {
      return NextResponse.json({ error: 'receiverId required' }, { status: 400 })
    }

    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (me.id === receiverId) {
      return NextResponse.json({ error: 'Cannot connect with yourself' }, { status: 400 })
    }

    const target = await db.user.findUnique({ where: { id: receiverId } })
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Check if any connection already exists (any direction, any status)
    const existing = await db.connection.findFirst({
      where: {
        OR: [
          { requesterId: me.id, receiverId },
          { requesterId: receiverId, receiverId: me.id },
        ],
      },
    })

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return NextResponse.json({ error: 'Already connected', status: 'ACCEPTED' })
      }
      if (existing.status === 'PENDING') {
        // If the request was sent by the other user (incoming pending), accept it instead of duplicating
        if (existing.receiverId === me.id) {
          await db.connection.update({
            where: { id: existing.id },
            data: { status: 'ACCEPTED' },
          })
          await db.user.update({
            where: { id: me.id },
            data: { connectionsCount: { increment: 1 } },
          })
          await db.user.update({
            where: { id: receiverId },
            data: { connectionsCount: { increment: 1 } },
          })
          return NextResponse.json({ status: 'ACCEPTED' })
        }
        return NextResponse.json({ error: 'Request already pending', status: 'PENDING' })
      }
      // If previously IGNORED, delete and create fresh
      await db.connection.delete({ where: { id: existing.id } })
    }

    const conn = await db.connection.create({
      data: {
        requesterId: me.id,
        receiverId,
        status: 'PENDING',
        note: note || null,
      },
    })

    return NextResponse.json({ status: 'PENDING', connectionId: conn.id })
  } catch (error) {
    console.error('Failed to send connection request:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
