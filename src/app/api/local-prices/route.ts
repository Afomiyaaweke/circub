import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const country = searchParams.get('country')?.trim() || ''
    const city = searchParams.get('city')?.trim() || ''
    const category = searchParams.get('category')?.trim() || ''
    const sort = searchParams.get('sort') || 'recent'
    const search = searchParams.get('search')?.trim() || ''
    const where: any = {}
    if (country) where.country = { contains: country }
    if (city) where.city = { contains: city }
    if (category && category !== 'All categories') where.category = category
    if (search) where.OR = [{ productName: { contains: search } }, { description: { contains: search } }, { localTip: { contains: search } }, { market: { contains: search } }, { neighborhood: { contains: search } }]
    let orderBy: any = { createdAt: 'desc' }
    if (sort === 'popular') orderBy = { helpfulCount: 'desc' }
    let me: any = null
    try { const s = await getCurrentUser(); if (s) me = await db.user.findUnique({ where: { id: s.id }, include: { localPriceVotes: true } }) } catch {}
    const posts = await db.localPricePost.findMany({ where, orderBy, include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } }, votes: true }, take: 100 })
    const result = posts.map((p) => {
      const myVote = me ? (p.votes.find((v) => v.userId === me.id)?.voteType as any) || null : null
      return { ...p, author: { ...p.author, expertiseTags: p.author.expertiseTags ? p.author.expertiseTags.split(',').filter(Boolean) : [] }, myVote }
    })
    return NextResponse.json({ posts: result })
  } catch (error) { console.error('Failed:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.productName || !body.country || !body.currency || body.priceMin == null || body.priceMax == null)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const updates: any = { localPostCount: { increment: 1 } }
    if (!me.isLocal) updates.isLocal = true
    const post = await db.localPricePost.create({
      data: { postType: body.postType || 'PRODUCT', productName: body.productName.trim(), description: body.description?.trim() || null, country: body.country.trim(), city: body.city?.trim() || null, neighborhood: body.neighborhood?.trim() || null, market: body.market?.trim() || null, currency: body.currency.trim(), priceMin: Number(body.priceMin), priceMax: Number(body.priceMax), recommendedPrice: body.recommendedPrice ? Number(body.recommendedPrice) : null, touristPrice: body.touristPrice ? Number(body.touristPrice) : null, personalPrice: body.personalPrice ? Number(body.personalPrice) : null, localTip: body.localTip?.trim() || null, category: body.category || 'Other', imageUrl: body.imageUrl || null, authorId: me.id },
      include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, isLocal: true, verifiedLocal: true, rating: true, helpfulVotes: true, localPostCount: true, headline: true, location: true, expertiseTags: true } } },
    })
    await db.user.update({ where: { id: me.id }, data: updates })
    return NextResponse.json({ post }, { status: 201 })
  } catch (error) { console.error('Failed:', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
