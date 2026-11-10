import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { extractReceipt, type ReceiptData } from '@/lib/ai-backends'

// RECEIPT PARSE (v258): "post with receipt". The price composer's Receipt
// button sends a photo of a store receipt here; the vision chain reads it
// and returns EVERY piece of information on the slip - merchant, date,
// currency and every line item with qty / unit price / line total - so the
// composer can fill the price-list rows from the picture. Nothing is posted
// by this endpoint: the client shows the rows for review first, and
// publishing still goes through the same bulk contract the composer already
// uses (confirm before post).
//
// POST /api/receipt/parse  - multipart/form-data with a `file` field
//   (image/*, up to 6 MB - the client compresses phone photos first).
// Returns 200 { merchant, date, currency, items[], total } or an error.
// Auth required: parsing on behalf of a signed-in poster (the composer is
// behind the sign-in gate since v257).

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_IMAGE_BYTES = 6 * 1024 * 1024

// Receipt photos are the heaviest client action after the scan - one per-IP
// rolling window, same shape the /api/scan limiter uses but tighter.
const RATE_LIMIT = { windowMs: 60_000, max: 10 }
const rateBuckets = new Map<string, number[]>()
let lastRateSweep = 0

function clientIpFrom(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  if (now - lastRateSweep > 300_000) {
    lastRateSweep = now
    for (const [k, ts] of rateBuckets) {
      const kept = ts.filter((t) => now - t < RATE_LIMIT.windowMs)
      if (kept.length === 0) rateBuckets.delete(k)
      else rateBuckets.set(k, kept)
    }
  }
  const arr = rateBuckets.get(ip) || []
  const recent = arr.filter((t) => now - t < RATE_LIMIT.windowMs)
  if (recent.length >= RATE_LIMIT.max) {
    const oldest = Math.min(...recent)
    return { ok: false, retryAfterSec: Math.ceil((RATE_LIMIT.windowMs - (now - oldest)) / 1000) }
  }
  recent.push(now)
  rateBuckets.set(ip, recent)
  return { ok: true, retryAfterSec: 0 }
}

function fileToDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const ip = clientIpFrom(req)
  const rl = checkRateLimit(ip)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many receipt reads - try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Send the receipt photo as multipart form-data with a `file` field.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing receipt photo - send it as the `file` field.' }, { status: 400 })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Receipt photo too large - 6 MB max after compression.' }, { status: 413 })
  }
  const mime = file.type || 'image/jpeg'
  if (!mime.startsWith('image/')) {
    return NextResponse.json({ error: 'That file is not an image - a receipt photo is needed.' }, { status: 415 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let receipt: ReceiptData
  try {
    receipt = await extractReceipt(fileToDataUrl(buf, mime))
  } catch (e) {
    const msg = String((e as Error)?.message || e)
    console.warn('[receipt/parse] extraction failed:', msg.slice(0, 200))
    // detail: which providers failed and why - the client surfaces a short
    // version and support can diagnose blind spots without server logs.
    return NextResponse.json(
      {
        error: 'Could not read the receipt - try a clearer, well-lit photo, or type the items with Bulk post instead.',
        detail: msg.slice(0, 500),
      },
      { status: 502 }
    )
  }

  if (!receipt.items.length) {
    return NextResponse.json(
      { error: 'No line items found on that photo - make sure the whole receipt is flat, in frame and readable.', ...receipt },
      { status: 422 }
    )
  }

  return NextResponse.json(receipt)
}
