'use client'

// BULK POST (v173 -> v176): publish a whole spreadsheet of prices in one go.
// v176: DELETE is now as visible as POST - every row carries a labeled
// Delete button (the old icon-only trash was unfindable, the user asked for
// "delete and post"), a two-tap Delete all wipes the whole draft, and a
// fully successful batch auto-clears the grid so the same rows can never be
// posted twice by accident.
// Three ways in: paste rows straight from Excel / Google Sheets (TSV), paste
// a messy free-form price list (WhatsApp style: emoji bullets, dotted prices,
// bare phone lines - parsed server-side by /api/local-prices/bulk/parse), or
// upload a Word / PDF / Excel / CSV file and have it parsed for you. Every
// source lands in the same editable grid so the user reviews and corrects
// everything BEFORE anything is posted.
import { useMemo, useState } from 'react'
import { Sheet, Plus, Trash2, Copy, Upload, CheckCircle2, AlertTriangle, FileText, FileUp, Sparkles, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/auth-fetch'
import { splitLocationInput } from '@/lib/location'
import { CategorySelect } from './category-select'

interface BulkPostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const CURRENCIES = ['USD', 'ETB', 'KES', 'UGX', 'MYR', 'EUR', 'INR', 'CNY', 'GBP', 'AED', 'NGN', 'TZS', 'RWF', 'GHS', 'ZAR', 'CAD']

// v175: a currency owned by exactly ONE country tells us the country - a
// parsed price list in birr is Ethiopian, in KES Kenyan, and so on. Filling
// the Default country automatically is what un-sticks the Post button: it
// used to stay disabled (looking "missing") because every parsed row lacked
// a country. Ambiguous currencies (USD, EUR) are deliberately absent.
const CURRENCY_COUNTRY: Record<string, string> = {
  ETB: 'Ethiopia',
  KES: 'Kenya',
  UGX: 'Uganda',
  TZS: 'Tanzania',
  RWF: 'Rwanda',
  GHS: 'Ghana',
  NGN: 'Nigeria',
  ZAR: 'South Africa',
  MYR: 'Malaysia',
  INR: 'India',
  CNY: 'China',
  GBP: 'United Kingdom',
  AED: 'United Arab Emirates',
  CAD: 'Canada',
}

// The inverse: a country inferable from the phones picks its own currency
// so a parsed Ethiopian list lands on ETB without the user touching it.
const COUNTRY_CURRENCY: Record<string, string> = {
  Ethiopia: 'ETB',
  Kenya: 'KES',
  Uganda: 'UGX',
  Tanzania: 'TZS',
  Rwanda: 'RWF',
  Ghana: 'GHS',
  Nigeria: 'NGN',
  'South Africa': 'ZAR',
  'United Arab Emirates': 'AED',
  India: 'INR',
  China: 'CNY',
  'United Kingdom': 'GBP',
  Canada: 'CAD',
  Malaysia: 'MYR',
}

interface GridRow {
  productName: string
  price: string
  city: string
  country: string
  contact: string
  imageUrl: string
}

const emptyRow = (): GridRow => ({ productName: '', price: '', city: '', country: '', contact: '', imageUrl: '' })

// Sample price list (text mode) - the real-world shape this parses: a
// company header, audience banners, emoji bullet rows with dotted prices
// and bare phone-number contact lines. Loads in one tap so parsing can be
// tried in seconds.
const SAMPLE = `✨✨Benol pharmaceutical plc
Big discount for
📞 Wholesales
📞 Clinics and Hospitals

👉 Vicryl 2 round ..950
👉 Vicryl 2/0 round ..950
👉 Vicryl 3 round..950
👉 Vicryl 3/0 cutting..950
👉 Vicryl 5/0 cutting...1250
👉 Vicryl 6/0 round..1250
👉 Prolene 2/0 round..3400
👉 Prolene 3/0 round..3400
👉 Prolene 4/0 round..3400
👉 Prolene 5/0 round..3400
👉 Prolene 6/0 round..3400
👉 Nylon 9/0...6200
👉 Nylon 10/0..6200
👉 Silk 0 round..620
👉 Silk 1 cutting..550

With fast delivery 🚚🚚🚚
Contact
📞 0911967478
📞 0973555577
📞 0999111110`

// Two paste templates - the column layout a user copies into their sheet.
// The Simple template covers the everyday case; the Full template adds
// currency and country columns for mixed-country price lists.
const TEMPLATES: Record<string, { header: string; example: string }> = {
  simple: {
    header: ['Product', 'Price', 'City', 'Contact', 'Image URL'].join('\t'),
    example: ['Coffee beans 1kg', '12', 'Addis Ababa', '+251911000000', ''].join('\t'),
  },
  full: {
    header: ['Product', 'Price', 'Currency', 'City', 'Country', 'Contact', 'Image URL'].join('\t'),
    example: ['Coffee beans 1kg', '350', 'ETB', 'Addis Ababa', 'Ethiopia', '+251911000000', ''].join('\t'),
  },
}

// Header detection: a pasted first line counts as a header when at least one
// cell matches a known column word. Anything unrecognized is ignored, so a
// sheet with extra columns (notes, stock...) still pastes cleanly.
const HEADER_WORDS: Record<string, string[]> = {
  productName: ['product', 'product name', 'item', 'item name', 'name', 'goods'],
  price: ['price', 'cost', 'price range', 'amount'],
  currency: ['currency'],
  location: ['location', 'place'],
  city: ['city', 'town'],
  country: ['country'],
  contact: ['contact', 'phone', 'contact info', 'whatsapp', 'email', 'telephone'],
  imageUrl: ['image', 'image url', 'photo', 'photo url', 'img', 'picture', 'image link', 'photo link'],
}

type ColKey = keyof typeof HEADER_WORDS

// Minimal CSV line splitter (comma, double-quote aware) for pastes that are
// not tab-separated. TSV stays the primary path - both Excel and Google
// Sheets copy as TSV.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function parsePaste(text: string): { rows: GridRow[]; mapped: boolean } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return { rows: [], mapped: false }
  const isTsv = lines[0].includes('\t')
  const cells = lines.map((l) => (isTsv ? l.split('\t').map((c) => c.trim()) : splitCsvLine(l).map((c) => c.trim())))

  // Try header detection on the first line.
  const first = cells[0].map((c) => c.toLowerCase().replace(/[:*]/g, '').trim())
  const map: (ColKey | null)[] = first.map((cell) => {
    for (const [key, words] of Object.entries(HEADER_WORDS)) {
      if (words.includes(cell)) return key as ColKey
    }
    return null
  })
  const hasHeader = map.some(Boolean)

  const dataLines = hasHeader ? cells.slice(1) : cells
  const colMap: (ColKey | null)[] = hasHeader
    ? map
    : // Default (Simple template) order: Product, Price, City, Contact, Image URL
      ['productName', 'price', 'city', 'contact', 'imageUrl'] as ColKey[]

  const rows: GridRow[] = []
  for (const line of dataLines) {
    const row = emptyRow()
    line.forEach((cell, idx) => {
      const key = colMap[idx]
      if (!key || !cell) return
      if (key === 'productName') row.productName = cell
      else if (key === 'price') row.price = cell
      else if (key === 'contact') row.contact = cell
      else if (key === 'imageUrl') row.imageUrl = cell
      else if (key === 'city') row.city = cell
      else if (key === 'country') row.country = cell
      else if (key === 'currency' || key === 'location') {
        // A combined "Location" column reads "City, Country" (or just a
        // country name) - split the same way the single composer does.
        const parts = splitLocationInput(cell)
        if (parts.city && !row.city) row.city = parts.city
        if (parts.country && !row.country) row.country = parts.country
      }
    })
    if (Object.values(row).some((v) => v.trim())) rows.push(row)
  }
  return { rows: rows.slice(0, 50), mapped: hasHeader }
}

// A contact cell maps by shape: an @ is an email, "wa:"/"whatsapp:" marks a
// WhatsApp number, everything else is a phone number. Keys are the API's
// contact field names so the payload can spread them straight in.
function contactOf(cell: string): { contactPhone?: string; contactEmail?: string; contactWhatsApp?: string } {
  const v = cell.trim()
  if (!v) return {}
  if (v.includes('@')) return { contactEmail: v }
  const lower = v.toLowerCase()
  if (lower.startsWith('wa:') || lower.startsWith('whatsapp:')) return { contactWhatsApp: v.split(':')[1]?.trim() || v }
  return { contactPhone: v }
}

function rowProblem(row: GridRow, defCountry: string): string | null {
  if (!row.productName.trim()) return 'Product name is required'
  const raw = row.price.replace(/[^0-9.\-]/g, '')
  if (!raw) return 'Price must be a number'
  const dash = raw.indexOf('-')
  if (dash > 0) {
    const min = Number(raw.slice(0, dash))
    const max = Number(raw.slice(dash + 1))
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return 'Price range must be min-max'
  } else {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return 'Price must be a number'
  }
  if (!row.country.trim() && !defCountry) return 'Country is required (row or default below)'
  return null
}

interface BulkResult {
  count: number
  failedCount: number
  failed: { row: number; error: string }[]
}

export function BulkPostModal({ open, onOpenChange, onCreated }: BulkPostModalProps) {
  const { toast } = useToast()
  const [paste, setPaste] = useState('')
  const [rows, setRows] = useState<GridRow[]>([])
  const [currency, setCurrency] = useState('USD')
  const [category, setCategory] = useState('Other')
  const [defCountry, setDefCountry] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  // v174 source modes: sheet = TSV/CSV grid paste (v173 behavior), text =
  // free-form price list parsed server-side, file = upload docx/pdf/xlsx/csv.
  const [mode, setMode] = useState<'sheet' | 'text' | 'file'>('sheet')
  const [parsing, setParsing] = useState(false)
  const [parsedCompany, setParsedCompany] = useState('')
  const [fileName, setFileName] = useState('')
  // v176: two-tap guard for Delete all - the first tap arms it, the second
  // (within 4s) wipes the grid. Prevents one accidental click from throwing
  // away 50 reviewed rows.
  const [deleteAllArmed, setDeleteAllArmed] = useState(false)

  const problems = useMemo(() => rows.map((r) => rowProblem(r, defCountry)), [rows, defCountry])
  const readyCount = problems.filter((p) => p === null).length

  const applyTemplate = (key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key]
    setPaste(`${t.header}\n${t.example}`)
    setPasteHint('Template loaded - paste your own rows under the header, or edit them in the grid after parsing.')
    setResult(null)
    setParsedCompany('')
  }

  const copyTemplate = async (key: keyof typeof TEMPLATES) => {
    try {
      await navigator.clipboard.writeText(`${TEMPLATES[key].header}\n${TEMPLATES[key].example}`)
      toast({ title: 'Template copied', description: 'Paste it into Excel or Google Sheets, fill your rows, then copy the whole table back here.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Your browser blocked the clipboard - select the text in the box and copy manually.' })
    }
  }

  const doParse = () => {
    const { rows: parsed, mapped } = parsePaste(paste)
    setParsedCompany('')
    if (!parsed.length) {
      setPasteHint('Nothing recognizable in the paste - each line needs at least a product and a price.')
      setRows([])
      return
    }
    setRows(parsed)
    setResult(null)
    setPasteHint(
      mapped
        ? `Detected a header row - ${parsed.length} row${parsed.length !== 1 ? 's' : ''} loaded with columns mapped by name.`
        : `No header found - read as Product, Price, City, Contact, Image URL - ${parsed.length} row${parsed.length !== 1 ? 's' : ''} loaded.`
    )
  }

  // v174: fill the grid from a parsed price list (text or file). The grid is
  // the PREVIEW - nothing is posted until the user checks it and submits.
  const applyParsed = (data: any, source: 'text' | 'file') => {
    const parsedRows: { productName: unknown; price: unknown }[] = Array.isArray(data?.rows) ? data.rows : []
    if (!parsedRows.length) {
      setRows([])
      setParsedCompany('')
      setPasteHint(
        source === 'file' && data?.fileName
          ? `No products with prices found in ${data.fileName} - scanned PDFs and photos are not readable, paste the text instead.`
          : 'No product + price lines found - each line needs a product name ending in a number, like "Vicryl 2 round ..950".'
      )
      return
    }
    const contacts: string[] = Array.isArray(data.contacts) ? data.contacts : []
    const contactStr = contacts.join(' / ')
    setRows(
      parsedRows.map((r) => ({
        productName: String(r.productName || ''),
        price: String(r.price || ''),
        city: '',
        country: '',
        contact: contactStr,
        imageUrl: '',
      }))
    )
    setParsedCompany(String(data.company || ''))
    // v175: currency + country from the parse hints. The parser infers the
    // country from the contact numbers (Ethiopian phones are the one signal
    // always present in real price lists) and the currency from words like
    // "birr"; each fills the other's gap. Filling the Default country is
    // what un-sticks the Post button - it used to stay disabled (looking
    // "missing") because every parsed row lacked a country.
    const hintCur = String(data.currencyHint || '') || COUNTRY_CURRENCY[String(data.countryHint || '')] || ''
    if (hintCur && currency === 'USD') setCurrency(hintCur)
    const hintCountry = CURRENCY_COUNTRY[hintCur] || String(data.countryHint || '')
    if (hintCountry && !defCountry.trim()) setDefCountry(hintCountry)
    setPasteHint(
      `Parsed ${parsedRows.length} product${parsedRows.length !== 1 ? 's' : ''}` +
        (data.company ? ` from ${data.company}` : '') +
        (contacts.length ? ` - ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} detected` : '') +
        (data.currencyHint ? ` - prices look like ${data.currencyHint}` : '') +
        (data.ignored ? ` - ${data.ignored} line${data.ignored !== 1 ? 's' : ''} skipped` : '') +
        '. Check the rows below before posting.'
    )
    setResult(null)
  }

  const doParseText = async () => {
    if (parsing) return
    if (!paste.trim()) {
      setPasteHint('Paste the price list text first - products with prices, contact numbers, a company header, any format.')
      return
    }
    setParsing(true)
    try {
      const res = await authFetch('/api/local-prices/bulk/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: paste }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not parse the text')
      applyParsed(data, 'text')
    } catch (e) {
      toast({ title: 'Parse failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  const onFilePicked = async (f?: File | null) => {
    if (!f || parsing) return
    if (f.size > 4 * 1024 * 1024) {
      setFileName(f.name)
      setPasteHint('That file is over 4 MB - paste its text into the Price list text tab instead.')
      return
    }
    setFileName(f.name)
    setParsing(true)
    setPasteHint(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await authFetch('/api/local-prices/bulk/parse', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not read that file')
      applyParsed(data, 'file')
    } catch (e) {
      setPasteHint((e as Error).message)
      toast({ title: 'Could not read the file', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setParsing(false)
    }
  }

  const updateRow = (idx: number, patch: Partial<GridRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx))

  // v176: delete EVERY row in one tap (two taps to confirm). Resets the
  // company banner and any post result with it - a clean slate for the
  // next batch.
  const deleteAllRows = () => {
    if (!deleteAllArmed) {
      setDeleteAllArmed(true)
      window.setTimeout(() => setDeleteAllArmed(false), 4000)
      return
    }
    setDeleteAllArmed(false)
    setRows([])
    setParsedCompany('')
    setResult(null)
    setPasteHint('All rows deleted - paste, parse or upload again to build a new batch.')
  }

  const submit = async () => {
    if (saving) return
    if (!readyCount) {
      toast({ title: 'Nothing ready to post', description: 'Every row needs a product name, a numeric price and a country (row or default).' })
      return
    }
    setSaving(true)
    try {
      const payloadRows = rows
        .map((r) => ({ row: r, problem: rowProblem(r, defCountry) }))
        .filter((x) => x.problem === null)
        .map(({ row: r }) => ({
          productName: r.productName.trim(),
          price: r.price.trim(),
          city: r.city.trim(),
          country: r.country.trim() || defCountry.trim(),
          ...contactOf(r.contact),
          imageUrl: r.imageUrl.trim(),
          description: parsedCompany ? `Sold by ${parsedCompany}` : '',
        }))
      const res = await authFetch('/api/local-prices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: payloadRows,
          defaults: { currency, category, postType: 'PRODUCT', country: defCountry.trim() },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Bulk post failed')
      setResult({ count: data.count || 0, failedCount: data.failedCount || 0, failed: data.failed || [] })
      // v176: when the WHOLE batch landed, clear the grid - the posted rows
      // are live on the feed now and keeping them in the grid made a second
      // tap of Post duplicate the entire batch. A partial failure keeps the
      // rows so the failed ones (now easy to spot and Delete) can be fixed.
      if (!(data.failedCount > 0)) {
        setRows([])
        setPaste('')
        setFileName('')
        setParsedCompany('')
        setPasteHint('Batch posted - the grid is cleared. Paste, parse or upload the next list to post another batch.')
      }
      toast({
        title: `${data.count} price${data.count !== 1 ? 's' : ''} posted`,
        description: data.failedCount ? `${data.failedCount} row${data.failedCount !== 1 ? 's' : ''} could not be posted - see the details in the dialog.` : 'The whole batch is live on the feed.',
      })
      onCreated()
    } catch (e) {
      toast({ title: 'Bulk post failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl sm:max-w-4xl sm:max-h-[92vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 gap-0 max-lg:top-0! max-lg:bottom-0! max-lg:left-0! max-lg:right-0! max-lg:translate-x-0! max-lg:translate-y-0! max-lg:w-full! max-lg:max-w-none! max-lg:h-dvh! max-lg:max-h-none! max-lg:rounded-none! max-lg:border-0!" data-testid="bulk-modal">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sheet className="w-5 h-5 text-primary" />
            Bulk post from a spreadsheet
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Paste rows from Excel or Google Sheets, paste a messy price list, or upload a Word / PDF / Excel file - every row becomes its own price post with product, price, location, contact and (optional) image. Check everything in the preview grid before posting. Up to 50 rows per batch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Source picker (v174) */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border w-fit max-w-full" data-testid="bulk-source">
            <button type="button" onClick={() => setMode('sheet')} data-testid="bulk-source-sheet" className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${mode === 'sheet' ? 'bg-background shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              <Sheet className="w-3.5 h-3.5" /> Sheet rows
            </button>
            <button type="button" onClick={() => setMode('text')} data-testid="bulk-source-text" className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${mode === 'text' ? 'bg-background shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              <FileText className="w-3.5 h-3.5" /> Price list text
            </button>
            <button type="button" onClick={() => setMode('file')} data-testid="bulk-source-file" className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${mode === 'file' ? 'bg-background shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
              <FileUp className="w-3.5 h-3.5" /> Upload file
            </button>
          </div>

          {/* Step 1 - get the rows in */}
          <div className="space-y-2" data-testid="bulk-paste-section">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {mode === 'sheet' && '1. Pick a template or paste your rows'}
                {mode === 'text' && '1. Paste the price list text - any format'}
                {mode === 'file' && '1. Upload a Word, PDF, Excel or CSV file'}
              </p>
              {mode === 'sheet' && (
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyTemplate('simple')} data-testid="bulk-template-simple">
                    Simple template
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyTemplate('full')} data-testid="bulk-template-full">
                    Full template
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copyTemplate('full')} data-testid="bulk-template-copy" title="Copy the template to the clipboard">
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                </div>
              )}
            </div>
            {mode !== 'file' && (
              <Textarea
                data-testid="bulk-paste-input"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={mode === 'sheet'
                  ? 'Product\tPrice\tCity\tContact\tImage URL\nCoffee beans 1kg\t12\tAddis Ababa\t+251911000000\t\nHandwoven basket\t25\tAddis Ababa\t+251911000000\t'
                  : 'Any format works - bullet lists, dotted prices, phone lines, a company header. For example:\n\nBenol pharmaceutical plc\n👉 Vicryl 2 round ..950\n👉 Silk 1 cutting..550\nContact\n0911967478'}
                className="font-mono text-xs min-h-[110px] bg-card"
              />
            )}
            {mode === 'file' && (
              <div
                data-testid="bulk-file-drop"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  void onFilePicked(e.dataTransfer.files?.[0])
                }}
                className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 flex flex-col items-center justify-center gap-2 text-center"
              >
                <FileUp className="w-7 h-7 text-primary" />
                <p className="text-sm font-medium text-foreground">{fileName || 'Drop a file here, or choose one'}</p>
                <p className="text-xs text-muted-foreground">Word (.docx), PDF, Excel (.xlsx / .xls) or CSV up to 4 MB - read in memory, never stored.</p>
                <label className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium cursor-pointer hover:bg-primary/90 transition-colors">
                  {parsing ? 'Reading file...' : 'Choose file'}
                  <input
                    type="file"
                    accept=".docx,.pdf,.xlsx,.xls,.csv,.txt"
                    className="hidden"
                    data-testid="bulk-file-input"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      void onFilePicked(f)
                    }}
                  />
                </label>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {mode !== 'file' && (
                <Button type="button" onClick={mode === 'sheet' ? doParse : doParseText} disabled={parsing} className="h-8 gap-1.5" data-testid="bulk-parse">
                  <Upload className="w-3.5 h-3.5" /> {parsing ? 'Parsing...' : mode === 'sheet' ? 'Parse rows' : 'Parse & preview'}
                </Button>
              )}
              {mode === 'text' && (
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setPaste(SAMPLE)} data-testid="bulk-sample" title="Load a real-world sample price list to try the parser">
                  <Sparkles className="w-3.5 h-3.5" /> Load sample
                </Button>
              )}
              {pasteHint && <p className="text-xs text-muted-foreground flex-1 min-w-[200px]" data-testid="bulk-paste-hint">{pasteHint}</p>}
            </div>
          </div>

          {/* Step 2 - grid */}
          {rows.length > 0 && (
            <div className="space-y-2" data-testid="bulk-grid-section">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Check the rows before posting</p>
              <div className="overflow-x-auto rounded-lg border border-border" data-testid="bulk-grid">
                {/* Desktop (lg+): the spreadsheet grid. Mobile + tablet (< lg):
                    the same rows stack as labeled cards - no horizontal
                    scrolling, every field full width with its own label. */}
                <div className="min-w-0 lg:min-w-[760px]">
                  <div className="hidden lg:grid grid-cols-[minmax(140px,2fr)_90px_minmax(110px,1.4fr)_minmax(110px,1.4fr)_minmax(130px,1.6fr)_minmax(150px,2fr)_64px] gap-1.5 px-2 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Product *</span><span>Price *</span><span>City</span><span>Country</span><span>Contact</span><span>Image URL</span><span>Delete</span>
                  </div>
                  {rows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-1.5 px-2 py-2 lg:py-1 lg:items-center border-t border-border lg:grid-cols-[minmax(140px,2fr)_90px_minmax(110px,1.4fr)_minmax(110px,1.4fr)_minmax(130px,1.6fr)_minmax(150px,2fr)_64px]" data-testid="bulk-row">
                      <div>
                        <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product *</span>
                        <Input value={row.productName} onChange={(e) => updateRow(idx, { productName: e.target.value })} className="h-8 text-xs" placeholder="Product name" data-testid={`bulk-cell-product-${idx}`} />
                      </div>
                      <div>
                        <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price *</span>
                        <Input value={row.price} onChange={(e) => updateRow(idx, { price: e.target.value })} className="h-8 text-xs" placeholder="12 or 12-15" data-testid={`bulk-cell-price-${idx}`} />
                      </div>
                      <div>
                        <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">City</span>
                        <Input value={row.city} onChange={(e) => updateRow(idx, { city: e.target.value })} className="h-8 text-xs" placeholder="City" data-testid={`bulk-cell-city-${idx}`} />
                      </div>
                      <div>
                        <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Country</span>
                        <Input value={row.country} onChange={(e) => updateRow(idx, { country: e.target.value })} className="h-8 text-xs" placeholder="Country" data-testid={`bulk-cell-country-${idx}`} />
                      </div>
                      <div>
                        <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</span>
                        <Input value={row.contact} onChange={(e) => updateRow(idx, { contact: e.target.value })} className="h-8 text-xs" placeholder="Phone / email" data-testid={`bulk-cell-contact-${idx}`} />
                      </div>
                      <div>
                        <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Image URL</span>
                        <Input value={row.imageUrl} onChange={(e) => updateRow(idx, { imageUrl: e.target.value })} className="h-8 text-xs" placeholder="https:// (optional)" data-testid={`bulk-cell-image-${idx}`} />
                      </div>
                      <button onClick={() => removeRow(idx)} className="h-7 px-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 text-[11px] font-medium flex items-center justify-center gap-1 whitespace-nowrap justify-self-start" title="Delete this row" data-testid={`bulk-remove-row-${idx}`}>
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                      {problems[idx] && (
                        <p className="col-span-full text-[11px] text-red-600 flex items-center gap-1 -mt-0.5" data-testid={`bulk-row-error-${idx}`}>
                          <AlertTriangle className="w-3 h-3 shrink-0" /> {problems[idx]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRows((prev) => [...prev, emptyRow()])} data-testid="bulk-add-row">
                  <Plus className="w-3 h-3 mr-1" /> Add row
                </Button>
                {rows.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={deleteAllRows} data-testid="bulk-delete-all" title="Delete every row in the grid" className={`h-7 text-xs gap-1.5 ${deleteAllArmed ? 'border-destructive bg-destructive/10 text-destructive font-semibold' : 'text-destructive/80 hover:text-destructive hover:bg-destructive/10'}`}>
                    {deleteAllArmed ? <XCircle className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                    {deleteAllArmed ? 'Tap again to delete all' : 'Delete all'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step 3 - defaults + submit */}
          <div className="space-y-3 p-3 rounded-xl bg-muted/40 border border-border" data-testid="bulk-defaults">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3. Defaults for empty cells, then post</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Currency</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-8 text-xs" data-testid="bulk-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Category</label>
                <CategorySelect
                  value={category}
                  onChange={setCategory}
                  mainTestid="bulk-category-main"
                  subTestid="bulk-category"
                  triggerClassName="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Default country (rows without one)</label>
                <Input value={defCountry} onChange={(e) => setDefCountry(e.target.value)} className="h-8 text-xs" placeholder="e.g. Ethiopia" data-testid="bulk-default-country" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <p className="text-xs text-muted-foreground" data-testid="bulk-status">
                {rows.length ? `${readyCount} of ${rows.length} row${rows.length !== 1 ? 's' : ''} ready to post` : 'Parse or add rows to begin'}
              </p>
              <div className="flex flex-wrap items-center gap-2 max-lg:w-full">
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={close}>Close</Button>
                <Button
                  type="button"
                  onClick={submit}
                  disabled={saving || !readyCount}
                  className="h-9 px-4 gap-1.5 text-sm font-semibold max-lg:basis-full max-lg:justify-center"
                  data-testid="bulk-submit"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Posting...' : `Post ${readyCount || 'all'} as ${readyCount === 1 ? 'post' : 'posts'}`}
                </Button>
              </div>
            </div>
            {rows.length > 0 && readyCount === 0 && !saving && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium" data-testid="bulk-submit-hint">
                Nothing is postable yet - fix the red row errors above, usually by filling the Default country here (or each row&apos;s Country cell). The Post button turns on as soon as one row is ready.
              </p>
            )}
            {result && (
              <div className="rounded-lg border border-border bg-card p-2.5 text-xs space-y-1" data-testid="bulk-result">
                <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {result.count} price{result.count !== 1 ? 's' : ''} posted - they are live on the feed now.
                </p>
                {result.failedCount > 0 && (
                  <div className="text-red-600 space-y-0.5">
                    {result.failed.map((f) => (
                      <p key={f.row}>{f.row}: {f.error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
