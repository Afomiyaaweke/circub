// List all conversations for current user (DM threads with other users)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ conversations: [] })

    // Get all messages involving me
    const messages = await db.message.findMany({
      where: {
        OR: [{ senderId: me.id }, { receiverId: me.id }],
      },
      orderBy: { createdAt: 'desc' },
    })

    // Group by other user
    const otherUserMap = new Map<string, { lastMessage: typeof messages[number], unreadCount: number }>()

    for (const msg of messages) {
      const otherId = msg.senderId === me.id ? msg.receiverId : msg.senderId
      const entry = otherUserMap.get(otherId)
      if (!entry) {
        otherUserMap.set(otherId, {
          lastMessage: msg,
          unreadCount: msg.receiverId === me.id && !msg.read ? 1 : 0,
        })
      } else {
        // First encountered is most recent (because of ORDER BY desc)
        if (msg.receiverId === me.id && !msg.read) {
          entry.unreadCount += 1
        }
      }
    }

    // Get other user info
    const otherIds = Array.from(otherUserMap.keys())
    const users = await db.user.findMany({
      where: { id: { in: otherIds } },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        bio: true,
        headline: true,
        location: true,
      },
    })

    const conversations = users.map((u) => ({
      user: u,
      lastMessage: otherUserMap.get(u.id)!.lastMessage,
      unreadCount: otherUserMap.get(u.id)!.unreadCount,
    }))

    // Sort by last message time (most recent first)
    conversations.sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() -
        new Date(a.lastMessage.createdAt).getTime()
    )

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Failed to fetch conversations:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
