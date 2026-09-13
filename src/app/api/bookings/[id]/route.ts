// PATCH /api/bookings/[id] — status transitions.
//   guide:   PENDING -> ACCEPTED | DECLINED ; ACCEPTED -> COMPLETED (+reply)
//   tourist: PENDING -> CANCELLED
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const GUIDE_ACTIONS = new Set(['ACCEPTED', 'DECLINED', 'COMPLETED'])
const TOURIST_ACTIONS = new Set(['CANCELLED'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const booking = await db.guideBooking.findUnique({ where: { id } })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const isGuide = booking.guideId === me.id
    const isTourist = booking.touristId === me.id
    if (!isGuide && !isTourist) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const action = String(body.status || '').toUpperCase()
    const reply = typeof body.reply === 'string' ? body.reply.trim().slice(0, 1000) || null : null

    let status: string
    if (isGuide && GUIDE_ACTIONS.has(action)) {
      // Validate transition
      if (action === 'ACCEPTED' && booking.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only pending requests can be accepted' }, { status: 400 })
      }
      if ((action === 'DECLINED' && booking.status !== 'PENDING') ||
          (action === 'COMPLETED' && booking.status !== 'ACCEPTED')) {
        return NextResponse.json({ error: `Cannot ${action.toLowerCase()} a ${booking.status.toLowerCase()} booking` }, { status: 400 })
      }
      status = action
    } else if (isTourist && TOURIST_ACTIONS.has(action)) {
      if (booking.status !== 'PENDING' && booking.status !== 'ACCEPTED') {
        return NextResponse.json({ error: 'Only pending or accepted bookings can be cancelled' }, { status: 400 })
      }
      status = action
    } else {
      return NextResponse.json({ error: 'Invalid action for this user' }, { status: 400 })
    }

    const updated = await db.guideBooking.update({
      where: { id },
      data: { status, ...(reply !== null ? { reply } : {}) },
    })

    return NextResponse.json({ booking: updated })
  } catch (error) {
    console.error('Failed to update booking:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
