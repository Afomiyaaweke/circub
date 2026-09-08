// Image / video upload.
//
// Two storage modes (selected by env vars):
//   1. Vercel Blob (production): set BLOB_READ_WRITE_TOKEN env var.
//      Uploads go to Vercel's blob storage and the returned URL is a CDN URL.
//      Required for 5,000+ concurrent users — base64 in DB doesn't scale.
//   2. Local dev fallback (default): returns a base64 data URL embedded in
//      the post row. Works on localhost without any external service.
//
// On Vercel WITHOUT BLOB_READ_WRITE_TOKEN, uploads still work (base64) but
// the DB row grows by ~33% per image, which is fine for low volume and bad
// at scale. Set BLOB_READ_WRITE_TOKEN for production.

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/session'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { allowed } = checkRateLimit(`upload:${ip}`, 30, 60000)
    if (!allowed) return NextResponse.json({ error: 'Too many uploads.' }, { status: 429 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const allTypes = [...IMAGE_TYPES, ...VIDEO_TYPES]
    if (!allTypes.includes(file.type)) return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 })

    const isVideo = VIDEO_TYPES.includes(file.type)
    // Tighter limits when using base64 (DB row grows by ~33% per image).
    // When BLOB_TOKEN is set, allow larger files.
    const maxBytes = isVideo
      ? (BLOB_TOKEN ? 50 * 1024 * 1024 : 10 * 1024 * 1024)
      : (BLOB_TOKEN ? 10 * 1024 * 1024 : 2 * 1024 * 1024)
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large. Max ${isVideo ? '50 MB (10 MB without Vercel Blob)' : '10 MB (2 MB without Vercel Blob)'}.` },
        { status: 400 }
      )
    }

    // Vercel Blob upload path — use dynamic import so the @vercel/blob
    // package is only loaded when configured (avoids bundling it for users
    // who haven't set up Blob).
    if (BLOB_TOKEN) {
      try {
        const { put } = await import('@vercel/blob')
        const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
        const blob = await put(`uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`, file, {
          access: 'public',
          addRandomSuffix: false,
          token: BLOB_TOKEN,
        })
        return NextResponse.json({
          url: blob.url,
          filename: file.name,
          size: file.size,
          isVideo,
          storage: 'blob',
        })
      } catch (e) {
        console.error('Vercel Blob upload failed, falling back to base64:', e)
        // fall through to base64
      }
    }

    // Base64 fallback (local dev or no BLOB_TOKEN)
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    return NextResponse.json({
      url: `data:${file.type};base64,${base64}`,
      filename: file.name,
      size: file.size,
      isVideo,
      storage: 'base64',
    })
  } catch (error) {
    console.error('Upload failed:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
