// My block list - the management side of blocking.
// GET -> { blocked: [{ id, name, username, avatarColor, headline, location,
//                     blockedAt }] }
// The Network tab (Profile -> Network) renders this as the Blocked users
// card, each row with its Unblock control.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ blocked: [] })

    const rows = await db.block.findMany({
      where: { blockerId: me.id },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarColor: true,
            headline: true,
            location: true,
          },
        },
      },
    })

    return NextResponse.json({
      blocked: rows.map((r) => ({ ...r.blocked, blockedAt: r.createdAt })),
      blockedCount: rows.length,
    })
  } catch (error) {
    console.error('Failed to fetch blocked users:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
