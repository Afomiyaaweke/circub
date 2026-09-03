// Get messages with a specific user, and send a new message to that user
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: otherId } = await params
    const me = await getCurrentUser()

    const messages = await db.message.findMany({
      where: {
        OR: [
          { senderId: me.id, receiverId: otherId },
          { senderId: otherId, receiverId: me.id },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    // Mark received messages as read
    await db.message.updateMany({
      where: {
        senderId: otherId,
        receiverId: me.id,
        read: false,
      },
      data: { read: true },
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: receiverId } = await params
    const body = await req.json()
    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    const me = await getCurrentUser()
    if (me.id === receiverId) {
      return NextResponse.json(
        { error: 'Cannot send messages to yourself' },
        { status: 400 }
      )
    }

    const receiver = await db.user.findUnique({ where: { id: receiverId } })
    if (!receiver) {
      return NextResponse.json({ error: 'Receiver not found' }, { status: 404 })
    }

    const msg = await db.message.create({
      data: {
        senderId: me.id,
        receiverId,
        content: body.content.trim(),
      },
    })

    return NextResponse.json({ message: msg }, { status: 201 })
  } catch (error) {
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
