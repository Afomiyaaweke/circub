import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const post = await db.localPricePost.findUnique({ where: { id }, include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } }, votes: true } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    let me: any = null
    try { const s = await getCurrentUser(); if (s) me = await db.user.findUnique({ where: { id: s.id }, include: { localPriceVotes: true } }) } catch {}
    const myVote = me ? (post.votes.find((v) => v.userId === me.id)?.voteType as any) || null : null
    return NextResponse.json({ post: { ...post, author: { ...post.author, expertiseTags: post.author.expertiseTags ? post.author.expertiseTags.split(',').filter(Boolean) : [] }, myVote } })
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.localPricePost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    await db.localPricePost.delete({ where: { id } })
    await db.user.update({ where: { id: me.id }, data: { localPostCount: { decrement: 1 } } })
    return NextResponse.json({ success: true })
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
