import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================================
// v117: PROFILE IMAGE ROUTE - serves a user's profile picture at a REAL URL.
//
// Same reason as /api/local-prices/[id]/image: avatars uploaded through
// /api/upload are base64 data: URLs, which social crawlers cannot fetch.
// The shared public profile page (/u/<username>) points its og:image HERE
// so WhatsApp / X / Telegram / Facebook link previews show the person's
// actual photo. Only the public profile picture is exposed - never email,
// never verification documents (those stay behind GET /api/verification).
// ============================================================================

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await db.user.findUnique({ where: { id }, select: { profilePicture: true } })
    const url = user?.profilePicture
    if (!url) return new NextResponse('Not found', { status: 404 })

    if (url.startsWith('data:')) {
      const m = DATA_URL_RE.exec(url)
      if (!m) return new NextResponse('Not found', { status: 404 })
      const mime = m[1] && m[1].startsWith('image/') ? m[1] : 'image/jpeg'
      const payload = m[2]
        ? Buffer.from(m[3], 'base64')
        : Buffer.from(decodeURIComponent(m[3]), 'utf-8')
      if (payload.length === 0) return new NextResponse('Not found', { status: 404 })
      return new NextResponse(new Uint8Array(payload), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      })
    }

    const target = url.startsWith('/') ? new URL(url, _req.url) : new URL(url)
    return NextResponse.redirect(target, { status: 307, headers: { 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return new NextResponse('Failed', { status: 500 })
  }
}
