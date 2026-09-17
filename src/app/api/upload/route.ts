import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ============================================================================
// MEDIA UPLOAD — accepts FormData 'file', returns { url } for direct use in
// <img>/<video>. The URL is a base64 data URL persisted by the caller (post
// imageUrl, avatar, product image, story, guide document), so it works on any
// host — including serverless/read-only filesystems where writing to public/
// would be lost.
//
// Clients should compress before uploading (src/lib/image-compress.ts for
// images, compressVideo for clips) so the follow-up JSON request that stores
// the data URL stays under the ~4.5 MB serverless body limit. As a rule of
// thumb: keep the compressed FILE at or under ~3 MB so its base64 form
// (× 4/3) plus the rest of the payload still fits.
// ============================================================================

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_VIDEO_BYTES = 30 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const isImage = IMAGE_TYPES.includes(file.type)
    const isVideo = VIDEO_TYPES.includes(file.type)
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: 'Invalid file type. Use PNG, JPEG, WebP, GIF or HEIC images, or MP4/WebM/MOV videos.' },
        { status: 400 }
      )
    }

    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: isVideo ? 'Video too large. Max 30 MB — trim the clip or pick a shorter one.' : 'Image too large. Max 4 MB.' },
        { status: 400 }
      )
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
