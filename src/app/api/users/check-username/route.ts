// GET /api/users/check-username?u=<handle>[&exclude=<userId>]
// Public availability probe for the shareable profile handle.
// Used live by the sign-up modal and Edit profile. Only reveals whether a
// handle is free — no user data is returned.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateUsername } from '@/lib/username'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('u') || ''
    const exclude = req.nextUrl.searchParams.get('exclude') || ''
    const check = validateUsername(raw)
    if (!check.ok) {
      return NextResponse.json({ available: false, error: check.error })
    }
    const taken = await db.user.findUnique({ where: { username: check.username }, select: { id: true } })
    const available = !taken || (exclude && taken.id === exclude)
    return NextResponse.json({ available, username: check.username })
  } catch (error) {
    console.error('check-username failed:', error)
    return NextResponse.json({ available: false, error: 'Check failed' }, { status: 500 })
  }
}
