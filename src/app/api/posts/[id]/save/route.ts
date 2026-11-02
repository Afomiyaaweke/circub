// Toggle "Save" (bookmark) on a community post.
// The community feed renders a Saved filter from the same rows - see
// GET /api/posts?saved=1. One save per user per post (PostSave @@unique).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const post = await db.post.findUnique({ where: { id } })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const existing = await db.postSave.findUnique({
      where: { userId_postId: { userId: me.id, postId: id } },
    })

    if (existing) {
      await db.postSave.delete({ where: { id: existing.id } })
      return NextResponse.json({ saved: false })
    } else {
      await db.postSave.create({
        data: { userId: me.id, postId: id },
      })
      return NextResponse.json({ saved: true })
    }
  } catch (error) {
    console.error('Failed to toggle save:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
