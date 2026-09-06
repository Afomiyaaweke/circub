import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const voteType = body.voteType as 'HELPFUL' | 'NOT_ACCURATE'
    if (!voteType || !['HELPFUL', 'NOT_ACCURATE'].includes(voteType)) return NextResponse.json({ error: 'Invalid vote type' }, { status: 400 })
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.localPricePost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    const existing = await db.localPriceVote.findUnique({ where: { userId_postId: { userId: me.id, postId: id } } })
    if (existing) {
      if (existing.voteType === voteType) {
        await db.localPriceVote.delete({ where: { id: existing.id } })
        if (voteType === 'HELPFUL') await db.localPricePost.update({ where: { id }, data: { helpfulCount: { decrement: 1 } } })
        else await db.localPricePost.update({ where: { id }, data: { notAccurateCount: { decrement: 1 } } })
        return NextResponse.json({ vote: null })
      } else {
        await db.localPriceVote.update({ where: { id: existing.id }, data: { voteType } })
        if (voteType === 'HELPFUL') await db.localPricePost.update({ where: { id }, data: { helpfulCount: { increment: 1 }, notAccurateCount: { decrement: 1 } } })
        else await db.localPricePost.update({ where: { id }, data: { helpfulCount: { decrement: 1 }, notAccurateCount: { increment: 1 } } })
        return NextResponse.json({ vote: voteType })
      }
    }
    await db.localPriceVote.create({ data: { userId: me.id, postId: id, voteType } })
    if (voteType === 'HELPFUL') { await db.localPricePost.update({ where: { id }, data: { helpfulCount: { increment: 1 } } }); await db.user.update({ where: { id: post.authorId }, data: { helpfulVotes: { increment: 1 } } }) }
    else await db.localPricePost.update({ where: { id }, data: { notAccurateCount: { increment: 1 } } })
    return NextResponse.json({ vote: voteType })
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
