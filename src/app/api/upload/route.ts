import { NextRequest, NextResponse } from 'next/server'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    const allTypes = [...IMAGE_TYPES, ...VIDEO_TYPES]
    if (!allTypes.includes(file.type)) return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 })
    const isVideo = VIDEO_TYPES.includes(file.type)
    const maxBytes = isVideo ? 25 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > maxBytes) return NextResponse.json({ error: `File too large. Max ${isVideo ? '25 MB' : '2 MB'}.` }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    return NextResponse.json({ url: `data:${file.type};base64,${base64}`, filename: file.name, size: file.size, isVideo })
  } catch (error) {
    console.error('Upload failed:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
