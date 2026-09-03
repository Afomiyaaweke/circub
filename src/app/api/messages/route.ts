// Get all messages involving current user (raw list)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ messages: [] })

    const messages = await db.message.findMany({
      where: {
        OR: [{ senderId: me.id }, { receiverId: me.id }],
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
