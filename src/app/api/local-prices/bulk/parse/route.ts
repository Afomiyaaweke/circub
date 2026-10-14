import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { parsePriceListText } from '@/lib/price-list-parser'

// BULK PARSE (v174): the smart half of bulk posting. Turns a messy price
// list - pasted text, a Word document, a PDF, an Excel sheet or a CSV - into
// structured rows the bulk grid can preview BEFORE anything is posted.
//
// POST /api/local-prices/bulk/parse
//   - JSON body { text } for the "price list text" mode, or
//   - multipart/form-data with a `file` field (.docx / .pdf / .xlsx / .xls /
//     .csv / .txt, up to 4 MB) for the upload mode.
//
// Returns { source, kind, fileName, company, contacts, rows[], currencyHint,
// ignored, totalLines }. Parsing is in-memory only - uploaded files are never
// stored. Auth required: parsing on behalf of a signed-in poster.

const MAX_FILE_BYTES = 4 * 1024 * 1024

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
    let source: 'text' | 'file' = 'text'
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
      text = String(body?.text || '')
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
