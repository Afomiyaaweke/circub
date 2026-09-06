import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const productName = searchParams.get('productName')?.trim() || ''
    const country = searchParams.get('country')?.trim() || ''
    const city = searchParams.get('city')?.trim() || ''
    if (!productName || !country) return NextResponse.json({ error: 'productName and country required' }, { status: 400 })
    const where: any = { productName: { contains: productName }, country: { contains: country } }
    if (city) where.city = { contains: city }
    const posts = await db.localPricePost.findMany({ where, orderBy: { createdAt: 'asc' } })
    if (posts.length === 0) return NextResponse.json({ history: { history: [] } })
    const now = Date.now(), DAY = 86400000
    const windows = [{ label: 'Current', minDays: 0, maxDays: 45 }, { label: '3 months ago', minDays: 45, maxDays: 120 }, { label: '6 months ago', minDays: 120, maxDays: 220 }, { label: '1 year ago', minDays: 220, maxDays: 400 }]
    const history = windows.map((w) => {
      const inWindow = posts.filter((p) => { const t = p.createdAt.getTime(); return t >= now - w.maxDays * DAY && t < now - w.minDays * DAY })
      if (inWindow.length === 0) return null
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
      const recPrices = inWindow.map((p) => p.recommendedPrice).filter(Boolean) as number[]
      return { label: w.label, priceMin: avg(inWindow.map((p) => p.priceMin)), priceMax: avg(inWindow.map((p) => p.priceMax)), recommendedPrice: recPrices.length ? Math.round(recPrices.reduce((a, b) => a + b, 0) / recPrices.length) : null, sampleCount: inWindow.length, date: inWindow[inWindow.length - 1].createdAt }
    }).filter(Boolean) as any[]
    return NextResponse.json({ history: { productName, country, city: city || null, currency: posts[0].currency, history } })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
