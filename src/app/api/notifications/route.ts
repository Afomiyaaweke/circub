// v179: business link / unlink notifications.
// GET    - my newest notifications + unread count (drives the header bell).
// POST   - mark all (or specific ids) as read - fired when the bell panel opens.
// DELETE - clear my whole notification list.
// The bell polls GET every 30s while signed in; the payload stays small
// (actor chip + type + product snapshot, capped at 30 rows).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const NOTIF_SELECT = {
  id: true,
  type: true,
  message: true,
  postName: true,
  postId: true,
  otherPostId: true,
  read: true,
  createdAt: true,
  actor: {
    select: { id: true, name: true, username: true, avatarColor: true, profilePicture: true, accountType: true, companyName: true },
  },
}

export async function GET(_req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me || me.id === 'guest') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: NOTIF_SELECT,
      }),
      db.notification.count({ where: { userId: me.id, read: false } }),
    ])
    return NextResponse.json({ notifications: rows, unreadCount: unread })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// POST { ids?: string[] } - mark everything (or the given rows) as read.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me || me.id === 'guest') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string') : []
    await db.notification.updateMany({
      where: { userId: me.id, ...(ids.length > 0 ? { id: { in: ids } } : {}) },
      data: { read: true },
    })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

// DELETE - clear the whole list for me.
export async function DELETE() {
  try {
    const me = await getCurrentUser()
    if (!me || me.id === 'guest') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    await db.notification.deleteMany({ where: { userId: me.id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
