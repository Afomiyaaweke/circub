'use client'

// BULK POST (v173): publish a whole spreadsheet of prices in one go.
// Paste rows straight from Excel / Google Sheets (TSV) or type them into the
// grid - every row becomes its own local price post with product, price,
// location, contact and (optionally) an image URL.
import { useMemo, useState } from 'react'
import { Sheet, Plus, Trash2, Copy, Upload, CheckCircle2, AlertTriangle } from 'lucide-react'
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

interface BulkPostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const CURRENCIES = ['USD', 'ETB', 'KES', 'UGX', 'MYR', 'EUR', 'INR', 'CNY', 'GBP', 'AED', 'NGN', 'TZS', 'RWF', 'GHS', 'ZAR', 'CAD']
const CATEGORIES = ['Food & Groceries', 'Services', 'Electronics', 'Clothing & Fashion', 'Home & Furniture', 'Health & Beauty', 'Transport', 'Other']

interface GridRow {
  productName: string
  price: string
  city: string
  country: string
  contact: string
  imageUrl: string
}

const emptyRow = (): GridRow => ({ productName: '', price: '', city: '', country: '', contact: '', imageUrl: '' })

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

  const problems = useMemo(() => rows.map((r) => rowProblem(r, defCountry)), [rows, defCountry])
  const readyCount = problems.filter((p) => p === null).length

  const applyTemplate = (key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key]
    setPaste(`${t.header}\n${t.example}`)
    setPasteHint('Template loaded - paste your own rows under the header, or edit them in the grid after parsing.')
    setResult(null)
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

  const updateRow = (idx: number, patch: Partial<GridRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx))

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
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 gap-0" data-testid="bulk-modal">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sheet className="w-5 h-5 text-primary" />
            Bulk post from a spreadsheet
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Paste rows from Excel or Google Sheets - every row becomes its own price post with product, price, location, contact and (optional) image. Up to 50 rows per batch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1 - paste / template */}
          <div className="space-y-2" data-testid="bulk-paste-section">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">1. Pick a template or paste your rows</p>
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
            </div>
            <Textarea
              data-testid="bulk-paste-input"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Product\tPrice\tCity\tContact\tImage URL\nCoffee beans 1kg\t12\tAddis Ababa\t+251911000000\t\nHandwoven basket\t25\tAddis Ababa\t+251911000000\t'}
              className="font-mono text-xs min-h-[110px] bg-card"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" onClick={doParse} className="h-8 gap-1.5" data-testid="bulk-parse">
                <Upload className="w-3.5 h-3.5" /> Parse rows
              </Button>
              {pasteHint && <p className="text-xs text-muted-foreground flex-1 min-w-[200px]" data-testid="bulk-paste-hint">{pasteHint}</p>}
            </div>
          </div>

          {/* Step 2 - grid */}
          {rows.length > 0 && (
            <div className="space-y-2" data-testid="bulk-grid-section">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">2. Check the rows</p>
              <div className="overflow-x-auto rounded-lg border border-border" data-testid="bulk-grid">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[minmax(140px,2fr)_90px_minmax(110px,1.4fr)_minmax(110px,1.4fr)_minmax(130px,1.6fr)_minmax(150px,2fr)_36px] gap-1.5 px-2 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Product *</span><span>Price *</span><span>City</span><span>Country</span><span>Contact</span><span>Image URL</span><span />
                  </div>
                  {rows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[minmax(140px,2fr)_90px_minmax(110px,1.4fr)_minmax(110px,1.4fr)_minmax(130px,1.6fr)_minmax(150px,2fr)_36px] gap-1.5 px-2 py-1 items-center border-t border-border" data-testid="bulk-row">
                      <Input value={row.productName} onChange={(e) => updateRow(idx, { productName: e.target.value })} className="h-8 text-xs" placeholder="Product name" data-testid={`bulk-cell-product-${idx}`} />
                      <Input value={row.price} onChange={(e) => updateRow(idx, { price: e.target.value })} className="h-8 text-xs" placeholder="12 or 12-15" data-testid={`bulk-cell-price-${idx}`} />
                      <Input value={row.city} onChange={(e) => updateRow(idx, { city: e.target.value })} className="h-8 text-xs" placeholder="City" data-testid={`bulk-cell-city-${idx}`} />
                      <Input value={row.country} onChange={(e) => updateRow(idx, { country: e.target.value })} className="h-8 text-xs" placeholder="Country" data-testid={`bulk-cell-country-${idx}`} />
                      <Input value={row.contact} onChange={(e) => updateRow(idx, { contact: e.target.value })} className="h-8 text-xs" placeholder="Phone / email" data-testid={`bulk-cell-contact-${idx}`} />
                      <Input value={row.imageUrl} onChange={(e) => updateRow(idx, { imageUrl: e.target.value })} className="h-8 text-xs" placeholder="https:// (optional)" data-testid={`bulk-cell-image-${idx}`} />
                      <button onClick={() => removeRow(idx)} className="w-7 h-7 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center" title="Remove this row" data-testid={`bulk-remove-row-${idx}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {problems[idx] && (
                        <p className="col-span-7 text-[11px] text-red-600 flex items-center gap-1 -mt-0.5" data-testid={`bulk-row-error-${idx}`}>
                          <AlertTriangle className="w-3 h-3 shrink-0" /> {problems[idx]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRows((prev) => [...prev, emptyRow()])} data-testid="bulk-add-row">
                <Plus className="w-3 h-3 mr-1" /> Add row
              </Button>
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
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs" data-testid="bulk-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
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
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={close}>Close</Button>
                <Button
                  type="button"
                  onClick={submit}
                  disabled={saving || !readyCount}
                  className="h-8 gap-1.5"
                  data-testid="bulk-submit"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {saving ? 'Posting...' : `Post ${readyCount || 'all'} as ${readyCount === 1 ? 'post' : 'posts'}`}
                </Button>
              </div>
            </div>
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
