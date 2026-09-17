// DELETE /api/guides/me — stop being a guide (owner action).
//
// Flips isGuide off so the guide card disappears from the Live Zone and the
// "Become a guide" entry points come back. Guide details (languages,
// specialties, bio, rate, license) and the verification document are
// deliberately KEPT: re-registering later prefills the form and doesn't ask
// for the document again. Past bookings and reviews stay for history.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export const runtime = 'nodejs'

export async function DELETE() {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!me.isGuide) {
      return NextResponse.json({ error: 'You are not registered as a guide' }, { status: 400 })
    }

    await db.user.update({
      where: { id: me.id },
      data: {
        isGuide: false,
        guideAvailable: false, // nothing to book while unregistered
      },
      select: { id: true, isGuide: true, guideAvailable: true },
    })

    return NextResponse.json({ success: true, isGuide: false })
  } catch (error) {
    console.error('Failed to stop being a guide:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
