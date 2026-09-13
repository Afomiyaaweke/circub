// Bookings for one guide:
//   POST /api/guides/[id]/bookings — tourist creates a booking request
//   GET  /api/guides/[id]/bookings — bookings between the logged-in user and this guide
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const MAX_MESSAGE = 1000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: guideId } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (me.id === guideId) {
      return NextResponse.json({ error: 'You cannot book yourself' }, { status: 400 })
    }

    const guide = await db.user.findUnique({ where: { id: guideId } })
    if (!guide || !guide.isGuide) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))

    let date: Date | null = null
    if (body.date) {
      const d = new Date(String(body.date))
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
      }
      date = d
    }

    const days = body.days != null ? Math.max(1, Math.min(60, Math.round(Number(body.days)))) : null
    const people = body.people != null ? Math.max(1, Math.min(50, Math.round(Number(body.people)))) : null
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) || null : null

    // Guard: one open (PENDING) request per tourist per guide at a time.
    const open = await db.guideBooking.findFirst({
      where: { touristId: me.id, guideId, status: 'PENDING' },
    })
    if (open) {
      return NextResponse.json(
        { error: 'You already have a pending request with this guide' },
        { status: 409 }
      )
    }

    const booking = await db.guideBooking.create({
      data: { touristId: me.id, guideId, status: 'PENDING', date, days, people, message },
    })

    return NextResponse.json({ booking }, { status: 201 })
  } catch (error) {
    console.error('Failed to create booking:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: guideId } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // Guide viewing their own page: all incoming bookings. Tourist: only
    // bookings they themselves made with this guide.
    const isGuideSelf = me.id === guideId
    const bookings = await db.guideBooking.findMany({
      where: isGuideSelf ? { guideId: me.id } : { guideId, touristId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ bookings })
  } catch (error) {
    console.error('Failed to fetch bookings:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
