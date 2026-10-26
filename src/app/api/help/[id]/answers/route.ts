// POST /api/help/[id]/answers - a REGISTERED member answers a help-board
// question (v213). This is the "registered people help them" half of the
// help board: asking is open to everyone, answering requires an account so
// every answer is attributable and removable.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, checkRateLimit, sanitizeInput } from '@/lib/session'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json(
        { error: 'Log in to help answer' },
        { status: 401 }
      )
    }

    // Rate limit: max 10 answers per minute per IP.
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`help-answer:${ip}`, 10, 60000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many answers. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const text = sanitizeInput(body.body || '', 2000)
    if (!text || text.length < 2) {
      return NextResponse.json(
        { error: 'Please write your answer.' },
        { status: 400 }
      )
    }

    const question = await db.helpQuestion.findUnique({ where: { id } })
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const saved = await db.helpAnswer.create({
      data: {
        questionId: id,
        userId: me.id,
        authorName: me.name,
        body: text,
      },
    })
    return NextResponse.json({
      ok: true,
      id: saved.id,
      authorName: saved.authorName,
    })
  } catch (error) {
    console.error('Help answer failed:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
