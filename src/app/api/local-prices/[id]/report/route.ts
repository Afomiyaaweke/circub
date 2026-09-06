import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

const REPORT_TYPES = ['INCORRECT_PRICE', 'OUTDATED', 'FAKE_POST', 'WRONG_LOCATION', 'SELLER_PROMOTION', 'SPAM']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const reportType = body.reportType as string
    if (!reportType || !REPORT_TYPES.includes(reportType)) return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.localPricePost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    const existing = await db.localPriceReport.findUnique({ where: { userId_postId: { userId: me.id, postId: id } } })
    if (existing) return NextResponse.json({ error: 'Already reported' }, { status: 400 })
    await db.localPriceReport.create({ data: { userId: me.id, postId: id, reportType, note: body.note || null } })
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
