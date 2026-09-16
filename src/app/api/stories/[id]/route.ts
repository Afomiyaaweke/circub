// Delete one of your own stories
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const story = await db.story.findUnique({ where: { id } })
    if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })
    if (story.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    await db.story.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
