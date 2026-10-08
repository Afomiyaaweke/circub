// Register a new user · supports PERSONAL and COMPANY account types
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setSessionCookie, checkRateLimit, sanitizeInput } from '@/lib/session'
import { validateUsername } from '@/lib/username'
import { CIRCUB_ROLES } from '@/lib/roles'
import { isPastRetention } from '@/lib/deactivation'

interface RegisterBody {
  accountType: 'PERSONAL' | 'COMPANY'
  // Shared
  email: string
  password: string
  // Shareable profile handle (circub.app/u/<username>) - required, unique
  username?: string
  // Personal
  name?: string
  headline?: string
  location?: string
  bio?: string
  // Contact channels (same as local price posts: phone / email / WhatsApp)
  phone?: string
  whatsapp?: string
  // Company
  companyName?: string
  companyWebsite?: string
  companySize?: string
  companyIndustry?: string
  // Optional for company: contact person name
  contactName?: string
  // Legal confirmation (sent by the register modal after the user ticks the
  // Terms of Service + Privacy Policy box); Google OAuth registration has no
  // body, so only an explicit false is rejected.
  acceptedTerms?: boolean
  // "I am joining as *" - Live Zone roles picked at sign-up (guide / vlogger /
  // local / volunteer / sales). Stored comma-separated on User.guideRoles so
  // the Live Zone join modal later opens prefilled with the same picks.
  guideRoles?: string[]
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

    // Legal gate: reject registrations that explicitly did NOT accept the
    // Terms of Service / Privacy Policy
    if (body.acceptedTerms === false) {
      return NextResponse.json(
        { error: 'You must agree to the Terms of Service and Privacy Policy' },
        { status: 400 }
      )
    }

    // Validate required
    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    // Reserved domain: demo/seed accounts live on it so the demo-content
    // cleanup can never touch a real user (see /api/seed).
    if (body.email.trim().toLowerCase().endsWith('@seed.circub.test')) {
      return NextResponse.json({ error: 'This email domain is reserved. Please use another email.' }, { status: 400 })
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
      // Deactivated accounts (v134): re-signing up with the same email works.
      // Past the 6-month retention window the account is purged on the spot
      // and registration falls through and creates a brand-new account.
      // Inside the window, the password typed into the form IS the ownership
      // proof (no email verification): a match reactivates the ORIGINAL
      // account - same id, same username, posts/followers/messages intact -
      // refreshed with the profile fields from this form. A mismatch means
      // someone else is trying to take the handle: generic 409, no hints.
      if (existing.deactivatedAt) {
        if (isPastRetention(existing.deactivatedAt)) {
          await db.user.delete({ where: { id: existing.id } })
          // fall through: the unique-email row is gone, registration proceeds
        } else {
          const owns = existing.password
            ? await bcrypt.compare(body.password, existing.password)
            : false
          if (!owns) {
            return NextResponse.json(
              { error: 'An account with this email already exists. Sign in with your password to reactivate it.' },
              { status: 409 }
            )
          }
          const reactivated = await applyRegistrationFields(existing.id, body)
          await setSessionCookie(reactivated.email)
          return NextResponse.json(
            {
              user: {
                id: reactivated.id,
                email: reactivated.email,
                name: reactivated.name,
                username: reactivated.username,
                accountType: reactivated.accountType,
                companyName: reactivated.companyName,
                headline: reactivated.headline,
                location: reactivated.location,
                guideRoles: reactivated.guideRoles ? pickedRolesOf(reactivated.guideRoles) : [],
                reactivated: true,
              },
            },
            { status: 201 }
          )
        }
      } else {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
    }

    // Username: required, normalized + validated, globally unique - it is the
    // public ID people use to find and share the profile.
    const uCheck = validateUsername(String(body.username || ''))
    if (!uCheck.ok) {
      return NextResponse.json({ error: uCheck.error }, { status: 400 })
    }
    const usernameTaken = await db.user.findUnique({
      where: { username: uCheck.username },
      select: { id: true },
    })
    if (usernameTaken) {
      return NextResponse.json(
        { error: 'That username is already taken - please pick another' },
        { status: 409 }
      )
    }

    const hashed = await bcrypt.hash(body.password, 10)

    // Live Zone roles picked at sign-up: keep only valid slugs, dedupe, store
    // comma-separated. Absent / empty / invalid-only -> left null, which the
    // rest of the app already reads as the legacy 'guide' default (Google
    // OAuth registrations have no body and land here too).
    let guideRoles: string | null = null
    if (Array.isArray(body.guideRoles)) {
      const picked = [...new Set(
        body.guideRoles
          .map((r) => String(r || '').trim().toLowerCase())
          .filter((r) => (CIRCUB_ROLES as readonly string[]).includes(r))
      )]
      if (picked.length > 0) guideRoles = picked.join(',')
    }

    // Build user record
    const userData: any = {
      email: body.email.trim().toLowerCase(),
      password: hashed,
      accountType: body.accountType,
      username: uCheck.username,
      guideRoles,
    }

    if (body.accountType === 'PERSONAL') {
      userData.name = sanitizeInput(body.name!, 100)
      userData.headline = sanitizeInput(body.headline || '', 200) || null
      userData.location = sanitizeInput(body.location || '', 200) || null
      userData.bio = sanitizeInput(body.bio || '', 2000) || null
      userData.phone = sanitizeInput(body.phone || '', 40) || null
      userData.whatsapp = sanitizeInput(body.whatsapp || '', 200) || null
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
          username: user.username,
          accountType: user.accountType,
          companyName: user.companyName,
          headline: user.headline,
          location: user.location,
          guideRoles: guideRoles ? pickedRolesOf(guideRoles) : [],
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

// Convenience for the 201 response: "local,sales" -> ['local', 'sales'].
function pickedRolesOf(raw: string): string[] {
  return raw.split(',').filter(Boolean)
}

// Reactivation of a deactivated account via re-signup (v134): refresh the
// same fields a fresh registration would set, clear the soft-off flags, and
// return the row. Everything the user accumulated before deactivating - the
// user id, the @username handle, posts, price posts, followers, following,
// likes, messages, connections - is left exactly as it was.
async function applyRegistrationFields(userId: string, body: RegisterBody) {
  const hashed = await bcrypt.hash(body.password, 10)

  let guideRoles: string | null = null
  if (Array.isArray(body.guideRoles)) {
    const picked = [...new Set(
      body.guideRoles
        .map((r) => String(r || '').trim().toLowerCase())
        .filter((r) => (CIRCUB_ROLES as readonly string[]).includes(r))
    )]
    if (picked.length > 0) guideRoles = picked.join(',')
  }

  const data: any = {
    password: hashed,
    accountType: body.accountType,
    deactivatedAt: null,
    deactivationReason: null,
    guideRoles,
  }

  if (body.accountType === 'PERSONAL') {
    data.name = sanitizeInput(body.name!, 100)
    data.headline = sanitizeInput(body.headline || '', 200) || null
    data.location = sanitizeInput(body.location || '', 200) || null
    data.bio = sanitizeInput(body.bio || '', 2000) || null
    data.phone = sanitizeInput(body.phone || '', 40) || null
    data.whatsapp = sanitizeInput(body.whatsapp || '', 200) || null
    data.isLocal = true
  } else {
    data.name = sanitizeInput(body.contactName || body.companyName!, 100)
    data.companyName = sanitizeInput(body.companyName!, 200)
    data.companyWebsite = sanitizeInput(body.companyWebsite || '', 500) || null
    data.companySize = sanitizeInput(body.companySize || '', 20) || null
    data.companyIndustry = sanitizeInput(body.companyIndustry || '', 100) || null
    data.headline = sanitizeInput(`${body.companyName!.trim()} • ${body.companyIndustry || 'Company'}`, 200)
  }

  return db.user.update({ where: { id: userId }, data })
}
