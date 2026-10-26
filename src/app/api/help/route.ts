// GET /api/help  - list community help-board questions (public, v213).
// POST /api/help - ask a question. Anyone can ask: logged-in users get their
// account attached (userId), visitors must leave a name + email like /contact.
// Registered members answer via POST /api/help/[id]/answers.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, checkRateLimit, sanitizeInput } from '@/lib/session'

export async function GET() {
  try {
    const questions = await db.helpQuestion.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        answers: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, authorName: true, body: true, createdAt: true },
        },
      },
    })
    return NextResponse.json(
      { questions },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Help board list failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 5 questions per minute per IP (matches /contact).
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`help:${ip}`, 5, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many questions. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const me = await getCurrentUser()
    const body = await req.json().catch(() => ({}))

    const question = sanitizeInput(body.question || '', 1000)
    if (!question || question.length < 5) {
      return NextResponse.json(
        { error: 'Please write your question (at least 5 characters).' },
        { status: 400 }
      )
    }

    // Logged-in askers carry their account; visitors must identify themselves.
    let name: string
    let email: string | null
    if (me) {
      name = me.name
      email = me.email
    } else {
      name = sanitizeInput(body.name || '', 100)
      email = sanitizeInput(body.email || '', 200).trim().toLowerCase() || null
      if (!name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: 'A valid email is required' },
          { status: 400 }
        )
      }
    }

    const saved = await db.helpQuestion.create({
      data: { name, email, question, userId: me?.id ?? null },
    })
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (error) {
    console.error('Help question failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
