// Toggle like on a post
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await db.user.findUnique({
      where: { email: 'ma@socialcircle.app' },
    })
    if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const post = await db.post.findUnique({ where: { id } })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const existing = await db.postLike.findUnique({
      where: { userId_postId: { userId: me.id, postId: id } },
    })

    if (existing) {
      await db.postLike.delete({ where: { id: existing.id } })
      return NextResponse.json({ liked: false })
    } else {
      await db.postLike.create({
        data: { userId: me.id, postId: id },
      })
      return NextResponse.json({ liked: true })
    }
  } catch (error) {
    console.error('Failed to toggle like:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
