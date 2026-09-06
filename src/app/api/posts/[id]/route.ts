// Delete or edit a post
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.post.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    await db.post.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.post.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const body = await req.json()
    const updates: any = {}
    if (typeof body.content === 'string') updates.content = body.content.trim()
    if (typeof body.imageUrl === 'string') updates.imageUrl = body.imageUrl || null
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    const updated = await db.post.update({
      where: { id }, data: updates,
      include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, headline: true, location: true } }, likes: true, comments: { include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, headline: true } } }, orderBy: { createdAt: 'asc' } } },
    })
    return NextResponse.json({ post: updated })
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
