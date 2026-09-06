import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: 'Invalid file type.' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image too large. Max 5 MB.' }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`
    let keywords = '', aiUsed = false
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()
      const response = await zai.chat.completions.createVision({
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Look at this image. If it shows a product, food, market item, or service, list 1-3 short search keywords. Just keywords separated by commas, nothing else.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ]}], thinking: { type: 'disabled' },
      })
      keywords = (response.choices?.[0]?.message?.content || '').replace(/^"|"$/g, '').trim()
      aiUsed = true
    } catch { const basename = file.name.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '').replace(/[-_]/g, ' ').replace(/\d+/g, ' ').trim(); keywords = basename || 'product' }
    return NextResponse.json({ keywords, aiUsed, raw: keywords })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Visual search failed.' }, { status: 500 })
  }
}
