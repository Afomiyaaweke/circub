// Toggle repost (share to network) on a post. One repost per user per post.
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

    const existing = await db.postRepost.findUnique({
      where: { userId_postId: { userId: me.id, postId: id } },
    })

    if (existing) {
      await db.postRepost.delete({ where: { id: existing.id } })
      const repostsCount = await db.postRepost.count({ where: { postId: id } })
      return NextResponse.json({ reposted: false, repostsCount })
    } else {
      await db.postRepost.create({
        data: { userId: me.id, postId: id },
      })
      const repostsCount = await db.postRepost.count({ where: { postId: id } })
      return NextResponse.json({ reposted: true, repostsCount })
    }
  } catch (error) {
    console.error('Failed to toggle repost:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
