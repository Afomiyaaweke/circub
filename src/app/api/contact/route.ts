// POST /api/contact — store a "Send Us a Message" submission from the /contact page.
// Rate limited, sanitized, persisted to the ContactMessage table.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, sanitizeInput } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 5 messages per minute per IP (matches register/login limits)
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`contact:${ip}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many messages. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => ({}))

    const name = sanitizeInput(body.name || '', 100)
    const email = sanitizeInput(body.email || '', 200).trim().toLowerCase()
    const subject = sanitizeInput(body.subject || '', 200)
    const message = sanitizeInput(body.message || '', 4000)

    // Validate required fields
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const saved = await db.contactMessage.create({
      data: {
        name,
        email,
        subject: subject || null,
        message,
      },
    })

    return NextResponse.json({ ok: true, id: saved.id })
  } catch (error) {
    console.error('Failed to store contact message:', error)
    return NextResponse.json(
      { error: 'Failed to send your message. Please try again.' },
      { status: 500 }
    )
  }
}
