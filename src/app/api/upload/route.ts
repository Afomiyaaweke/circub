import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ============================================================================
// IMAGE UPLOAD — accepts FormData 'file', returns { url } for direct use in
// <img src>. The URL is a base64 data URL persisted by the caller (e.g. the
// product image column of a price post), so it works on any host — including
// serverless/read-only filesystems where writing to public/ would be lost.
// Clients should compress before uploading (see src/lib/image-compress.ts);
// the server caps at 4 MB so the base64 payload stays within request limits.
// ============================================================================

const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use PNG, JPEG, WebP or GIF.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large. Max 4 MB.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const url = `data:${file.type};base64,${buffer.toString('base64')}`
    return NextResponse.json({ url, size: file.size, type: file.type })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 500 }
    )
  }
}
