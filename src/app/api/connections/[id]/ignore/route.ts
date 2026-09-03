// Ignore / decline a connection request
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()

    const conn = await db.connection.findUnique({ where: { id } })
    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }
    if (conn.receiverId !== me.id) {
      return NextResponse.json(
        { error: 'Unauthorized: only the receiver can ignore' },
        { status: 403 }
      )
    }

    // Mark as IGNORED (so it doesn't appear again)
    await db.connection.update({
      where: { id },
      data: { status: 'IGNORED' },
    })

    return NextResponse.json({ status: 'IGNORED' })
  } catch (error) {
    console.error('Failed to ignore connection:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
