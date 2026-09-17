// Login with email + password
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setSessionCookie, checkRateLimit } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 10 login attempts per minute per IP
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`login:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const email = body.email?.trim().toLowerCase()
    const password = body.password

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.password) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Deactivated accounts cannot sign back in - the message tells the owner
    // exactly how to reactivate (checked AFTER the password check so the
    // account's existence/status is never leaked to non-owners).
    if (user.deactivatedAt) {
      return NextResponse.json(
        { error: 'This account has been deactivated. Email support@tenetbid.com to reactivate it.' },
        { status: 403 }
      )
    }

    await setSessionCookie(user.email)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accountType: user.accountType,
        companyName: user.companyName,
        headline: user.headline,
        location: user.location,
      },
    })
  } catch (error) {
    console.error('Login failed:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
