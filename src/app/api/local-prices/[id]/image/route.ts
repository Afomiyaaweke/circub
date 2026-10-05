import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================================
// v117: SHARE IMAGE ROUTE - serves a price post's photo at a REAL URL.
//
// Why this exists: uploaded photos are stored as base64 data: URLs (see
// /api/upload - survives serverless read-only filesystems). Social crawlers
// (WhatsApp, Facebook, X, Telegram, iMessage) cannot fetch data: URLs, so an
// og:image pointing at the data URL shows nothing in the shared link preview.
// The per-post OG metadata (page.tsx generateMetadata) points HERE instead:
// we decode the stored data URL and serve the raw bytes with the right
// content-type, so every share of /?post=<id> shows the post's own photo.
//
// Seed/external photos (already real URLs) get a redirect to their location.
// No auth: this is the exact surface social crawlers fetch anonymously.
// ============================================================================

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const post = await db.localPricePost.findUnique({ where: { id }, select: { imageUrl: true } })
    const url = post?.imageUrl
    if (!url) return new NextResponse('Not found', { status: 404 })

    // Uploaded photo (base64 data URL) -> decode and serve the bytes.
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
          // Immutable content (the data URL never changes for a given post
          // image) - a day of edge/browser caching keeps repeat shares fast.
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      })
    }

    // Already a real URL: /seed-images/x.jpg (relative) or https://... -
    // redirect crawlers straight to it.
    const target = url.startsWith('/') ? new URL(url, _req.url) : new URL(url)
    return NextResponse.redirect(target, { status: 307, headers: { 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return new NextResponse('Failed', { status: 500 })
  }
}
