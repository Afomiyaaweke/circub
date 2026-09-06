import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const productName = searchParams.get('productName')?.trim() || ''
    const country = searchParams.get('country')?.trim() || ''
    const city = searchParams.get('city')?.trim() || ''
    const postId = searchParams.get('postId')?.trim() || ''
    if (!productName || !country) return NextResponse.json({ error: 'productName and country required' }, { status: 400 })
    const where: any = { productName: { contains: productName }, country: { contains: country } }
    if (city) where.city = { contains: city }
    if (postId) where.id = { not: postId }
    const posts = await db.localPricePost.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: { author: { select: { id: true, name: true, avatarColor: true, profilePicture: true, verifiedLocal: true, rating: true } } } })
    if (posts.length === 0) return NextResponse.json({ consensus: null })
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
    const priceMins = posts.map((p) => p.priceMin), priceMaxes = posts.map((p) => p.priceMax)
    const recPrices = posts.map((p) => p.recommendedPrice).filter(Boolean) as number[]
    const touristPrices = posts.map((p) => p.touristPrice).filter(Boolean) as number[]
    const avgPriceMin = avg(priceMins), avgPriceMax = avg(priceMaxes)
    const recommendedPrice = recPrices.length ? Math.round(recPrices.reduce((a, b) => a + b, 0) / recPrices.length) : null
    const avgTouristPrice = touristPrices.length ? Math.round(touristPrices.reduce((a, b) => a + b, 0) / touristPrices.length) : null
    let verdict: 'fair' | 'expensive' | 'cheap' | 'unknown' = 'unknown'
    if (recommendedPrice && avgTouristPrice) { const ratio = avgTouristPrice / recommendedPrice; verdict = ratio > 1.5 ? 'expensive' : 'fair' }
    return NextResponse.json({ consensus: { productName, country, city: city || null, currency: posts[0].currency, avgPriceMin, avgPriceMax, recommendedPrice, avgTouristPrice, reportCount: posts.length, verdict, contributingPosts: posts.map((p) => ({ id: p.id, productName: p.productName, priceMin: p.priceMin, priceMax: p.priceMax, recommendedPrice: p.recommendedPrice, helpfulCount: p.helpfulCount, createdAt: p.createdAt, author: { id: p.author.id, name: p.author.name, avatarColor: p.author.avatarColor, verifiedLocal: p.author.verifiedLocal, rating: p.author.rating } })) } })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
