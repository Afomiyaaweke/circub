// Register a new user · supports PERSONAL and COMPANY account types
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setSessionCookie } from '@/lib/session'

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
    const body: RegisterBody = await req.json()

    // Validate required
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
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
      userData.name = body.name!.trim()
      userData.headline = body.headline?.trim() || null
      userData.location = body.location?.trim() || null
      userData.bio = body.bio?.trim() || null
      userData.isLocal = true // personal users can be local contributors
    } else {
      // Company account
      userData.name = body.contactName?.trim() || body.companyName!.trim()
      userData.companyName = body.companyName!.trim()
      userData.companyWebsite = body.companyWebsite?.trim() || null
      userData.companySize = body.companySize?.trim() || null
      userData.companyIndustry = body.companyIndustry?.trim() || null
      userData.headline = `${body.companyName!.trim()} • ${body.companyIndustry || 'Company'}`
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
