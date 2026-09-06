// Register a new user · supports PERSONAL and COMPANY account types
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setSessionCookie, checkRateLimit, sanitizeInput } from '@/lib/session'

interface RegisterBody {
  accountType: 'PERSONAL' | 'COMPANY'
  // Shared
  email: string
  password: string
  // Personal
  name?: string
  headline?: string
  location?: string
  bio?: string
  // Company
  companyName?: string
  companyWebsite?: string
  companySize?: string
  companyIndustry?: string
  // Optional for company: contact person name
  contactName?: string
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 5 registrations per minute per IP
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`register:${ip}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body: RegisterBody = await req.json()

    // Validate required
    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    // Validate password strength
    if (body.password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    if (!body.accountType || !['PERSONAL', 'COMPANY'].includes(body.accountType)) {
      return NextResponse.json(
        { error: 'Account type must be PERSONAL or COMPANY' },
        { status: 400 }
      )
    }
    if (body.accountType === 'PERSONAL' && !body.name?.trim()) {
      return NextResponse.json(
        { error: 'Name is required for personal accounts' },
        { status: 400 }
      )
    }
    if (body.accountType === 'COMPANY' && !body.companyName?.trim()) {
      return NextResponse.json(
        { error: 'Company name is required for company accounts' },
        { status: 400 }
      )
    }

    // Check existing
    const existing = await db.user.findUnique({
      where: { email: body.email.trim().toLowerCase() },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const hashed = await bcrypt.hash(body.password, 10)

    // Build user record
    const userData: any = {
      email: body.email.trim().toLowerCase(),
      password: hashed,
      accountType: body.accountType,
    }

    if (body.accountType === 'PERSONAL') {
      userData.name = sanitizeInput(body.name!, 100)
      userData.headline = sanitizeInput(body.headline || '', 200) || null
      userData.location = sanitizeInput(body.location || '', 200) || null
      userData.bio = sanitizeInput(body.bio || '', 2000) || null
      userData.isLocal = true
    } else {
      userData.name = sanitizeInput(body.contactName || body.companyName!, 100)
      userData.companyName = sanitizeInput(body.companyName!, 200)
      userData.companyWebsite = sanitizeInput(body.companyWebsite || '', 500) || null
      userData.companySize = sanitizeInput(body.companySize || '', 20) || null
      userData.companyIndustry = sanitizeInput(body.companyIndustry || '', 100) || null
      userData.headline = sanitizeInput(`${body.companyName!.trim()} • ${body.companyIndustry || 'Company'}`, 200)
    }

    const user = await db.user.create({ data: userData })

    // Set session cookie
    await setSessionCookie(user.email)

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          accountType: user.accountType,
          companyName: user.companyName,
          headline: user.headline,
          location: user.location,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration failed:', error)
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    )
  }
}
