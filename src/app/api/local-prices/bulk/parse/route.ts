import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { parsePriceListText } from '@/lib/price-list-parser'

// BULK PARSE (v174): the smart half of bulk posting. Turns a messy price
// list - pasted text, a Word document, a PDF, an Excel sheet or a CSV - into
// structured rows the bulk grid can preview BEFORE anything is posted.
//
// POST /api/local-prices/bulk/parse
//   - JSON body { text } for the "price list text" mode,
//   - JSON body { url } for the v256 "from link" mode (a public Telegram
//     channel post via t.me/s/..., a published/linked Google Sheet, or any
//     public web page with a price list), or
//   - multipart/form-data with a `file` field (.docx / .pdf / .xlsx / .xls /
//     .csv / .txt, up to 4 MB) for the upload mode.
//
// Returns { source, kind, fileName, company, contacts, rows[], currencyHint,
// ignored, totalLines }. Parsing is in-memory only - uploaded files and
// fetched pages are never stored. Auth required: parsing on behalf of a
// signed-in poster.

const MAX_FILE_BYTES = 4 * 1024 * 1024
// v256: a fetched page is read in memory only - 2 MB of HTML/text is far
// more than any real price list needs.
const MAX_URL_BYTES = 2 * 1024 * 1024
const URL_TIMEOUT_MS = 8000

// v256 LINK MODE - SSRF guard: only public http(s) URLs are fetchable.
// Loopback, private ranges, link-local and dotless/internal hostnames are
// rejected before any request leaves the server.
function isFetchableUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const h = u.hostname.toLowerCase()
    if (!h || !h.includes('.')) return null
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return null
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null
    if (h.startsWith('[') && (h === '[::1]' || h.startsWith('[fe80:') || h.startsWith('[fc') || h.startsWith('[fd'))) return null
    return u
  } catch {
    return null
  }
}

// Google Sheets: an /edit link needs the export endpoint to come back as
// CSV (works for any sheet shared as "anyone with the link"). The gid stays
// so a specific tab can be targeted; #gid=... fragments count too.
function canonicalFetchUrl(u: URL): URL {
  const m = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/)
  if (u.hostname === 'docs.google.com' && m) {
    const gid = u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1] || '0'
    const out = new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/export`)
    out.searchParams.set('format', 'csv')
    out.searchParams.set('gid', gid)
    return out
  }
  return u
}

// Strip HTML down to the text the price-list parser can read: script/style
// and the head go away, block tags become newlines, entities are decoded.
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#\d+;/g, ' ')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

async function fetchTextFromUrl(raw: string): Promise<{ text: string; kind: string; host: string }> {
  const parsed = isFetchableUrl(raw)
  if (!parsed) {
    throw Object.assign(new Error('That link is not fetchable - use a public http(s) link (Telegram channel post, published Google Sheet, or web page)'), { status: 400 })
  }
  const u = canonicalFetchUrl(parsed)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), URL_TIMEOUT_MS)
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CircubPriceBot/1.0; +https://circubawd.vercel.app)',
        'Accept': 'text/html, text/plain, text/csv, */*',
      },
    })
    if (!res.ok) {
      throw Object.assign(new Error(`The link answered ${res.status} - private Telegram chats and login-walled pages cannot be read; paste the message text instead`), { status: 422 })
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    const raw2 = await res.text()
    const text = raw2.length > MAX_URL_BYTES ? raw2.slice(0, MAX_URL_BYTES) : raw2
    const kind = ct.includes('html') ? 'url-html' : ct.includes('csv') ? 'url-csv' : 'url-text'
    return { text: ct.includes('html') ? htmlToText(text) : text, kind, host: u.hostname }
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw Object.assign(new Error('The link took too long to answer (8s timeout) - paste the text instead'), { status: 504 })
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function extractTextFromFile(file: File): Promise<{ text: string; kind: string }> {
  const name = (file.name || '').toLowerCase()
  const buf = Buffer.from(await file.arrayBuffer())

  if (name.endsWith('.pdf')) {
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: true })
    return { text: text || '', kind: 'pdf' }
  }

  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const res = await mammoth.extractRawText({ buffer: buf })
    return { text: res.value || '', kind: 'docx' }
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'buffer' })
    let text = ''
    for (const sheetName of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName])
      if (csv.trim()) text += (text ? '\n' : '') + csv
    }
    return { text, kind: name.endsWith('.xls') ? 'xls' : 'xlsx' }
  }

  // .csv / .txt and any unknown extension: try it as raw text.
  return { text: buf.toString('utf8'), kind: name.endsWith('.csv') ? 'csv' : 'txt' }
}

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const ct = req.headers.get('content-type') || ''
    let text = ''
    let source: 'text' | 'file' | 'url' = 'text'
    let kind = 'text'
    let fileName = ''

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null)
      const file = form?.get('file')
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const f = file as File
        if (f.size > MAX_FILE_BYTES) {
          return NextResponse.json({ error: 'File is larger than 4 MB - paste the text instead' }, { status: 413 })
        }
        try {
          const ex = await extractTextFromFile(f)
          text = ex.text
          kind = ex.kind
          source = 'file'
          fileName = f.name.slice(0, 200)
        } catch {
          return NextResponse.json(
            { error: 'Could not read that file - if it is a scanned PDF or a photo, paste the text instead' },
            { status: 422 }
          )
        }
      } else {
        text = String(form?.get('text') || '')
      }
    } else {
      const body = await req.json().catch(() => null)
      // v256: { url } - fetch a public Telegram channel post, a shared
      // Google Sheet, or any web page and parse it like pasted text.
      const rawUrl = String(body?.url || '').trim()
      if (rawUrl) {
        try {
          const ex = await fetchTextFromUrl(rawUrl)
          text = ex.text
          kind = ex.kind
          source = 'url'
          fileName = ex.host
        } catch (e) {
          const status = (e as { status?: number }).status || 500
          return NextResponse.json({ error: (e as Error).message }, { status })
        }
      } else {
        text = String(body?.text || '')
      }
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'Nothing to parse - the file had no readable text (scanned PDFs and photos are not readable)' },
        { status: 400 }
      )
    }

    const parsed = parsePriceListText(text)
    return NextResponse.json({ source, kind, fileName, ...parsed })
  } catch (error) {
    console.error('Bulk parse failed:', error)
    return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
  }
}
