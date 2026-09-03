// DEPRECATED: legacy follow endpoint, redirected to connection request
// Use /api/connections/request instead for LinkedIn-style mutual connections
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const me = await getCurrentUser()
    if (me.id === targetId) {
      return NextResponse.json({ error: 'Cannot connect with yourself' }, { status: 400 })
    }

    const existing = await db.connection.findFirst({
      where: {
        OR: [
          { requesterId: me.id, receiverId: targetId },
          { requesterId: targetId, receiverId: me.id },
        ],
      },
    })

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        // Remove connection
        await db.connection.delete({ where: { id: existing.id } })
        await db.user.update({
          where: { id: me.id },
          data: { connectionsCount: { decrement: 1 } },
        })
        await db.user.update({
          where: { id: targetId },
          data: { connectionsCount: { decrement: 1 } },
        })
        return NextResponse.json({ following: false })
      }
      if (existing.status === 'PENDING') {
        // Cancel pending request
        await db.connection.delete({ where: { id: existing.id } })
        return NextResponse.json({ following: false })
      }
      // IGNORED - reset and send fresh
      await db.connection.delete({ where: { id: existing.id } })
    }

    await db.connection.create({
      data: { requesterId: me.id, receiverId: targetId, status: 'PENDING' },
    })
    return NextResponse.json({ following: true, pending: true })
  } catch (error) {
    console.error('Failed to toggle follow:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
