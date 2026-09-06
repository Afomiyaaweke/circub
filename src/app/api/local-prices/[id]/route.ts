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
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const post = await db.localPricePost.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.authorId !== me.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const body = await req.json()
    const updates: any = {}
    if (typeof body.productName === 'string') updates.productName = body.productName.trim()
    if (typeof body.description === 'string') updates.description = body.description.trim() || null
    if (typeof body.country === 'string') updates.country = body.country.trim()
    if (typeof body.city === 'string') updates.city = body.city.trim() || null
    if (typeof body.neighborhood === 'string') updates.neighborhood = body.neighborhood.trim() || null
    if (typeof body.market === 'string') updates.market = body.market.trim() || null
    if (typeof body.currency === 'string') updates.currency = body.currency.trim()
    if (body.priceMin != null) updates.priceMin = Number(body.priceMin)
    if (body.priceMax != null) updates.priceMax = Number(body.priceMax)
    if (body.recommendedPrice != null) updates.recommendedPrice = Number(body.recommendedPrice)
    if (body.touristPrice != null) updates.touristPrice = Number(body.touristPrice)
    if (typeof body.localTip === 'string') updates.localTip = body.localTip.trim() || null
    if (typeof body.contactPhone === 'string') updates.contactPhone = body.contactPhone.trim() || null
    if (typeof body.contactEmail === 'string') updates.contactEmail = body.contactEmail.trim() || null
    if (typeof body.contactWhatsApp === 'string') updates.contactWhatsApp = body.contactWhatsApp.trim() || null
    if (typeof body.category === 'string') updates.category = body.category
    if (typeof body.imageUrl === 'string') updates.imageUrl = body.imageUrl || null
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    const updated = await db.localPricePost.update({ where: { id }, data: updates })
    return NextResponse.json({ post: updated })
  } catch (error) { console.error('Edit failed:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
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
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
