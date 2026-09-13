// GET /api/bookings — all bookings involving the logged-in user:
//   incoming (I am the guide) + outgoing (I am the tourist).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const rows = await db.guideBooking.findMany({
      where: { OR: [{ touristId: me.id }, { guideId: me.id }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        tourist: {
          select: { id: true, name: true, avatarColor: true, profilePicture: true, headline: true },
        },
        guide: {
          select: {
            id: true, name: true, avatarColor: true, profilePicture: true,
            headline: true, location: true, rating: true,
            guideHourlyRate: true, guideCurrency: true,
          },
        },
      },
    })

    const bookings = rows.map((b) => ({
      ...b,
      direction: b.guideId === me.id ? 'incoming' : 'outgoing',
    }))

    const pendingCount = bookings.filter(
      (b) => b.status === 'PENDING' && b.direction === 'incoming'
    ).length

    return NextResponse.json({ bookings, pendingCount })
  } catch (error) {
    console.error('Failed to fetch my bookings:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
