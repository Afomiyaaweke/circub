'use client'

// BULK POST (v173 -> v193): publish a whole price list in one go.
// v193 "Bulk Price Post" rebuild ('make the bulk post like this', the user's
// green mobile mockup): the 3-step spreadsheet form becomes the mockup's
// sheet - a header card (back chevron, title + 'Bulk Mode' pill, ? help),
// a status strip ('N/N verified - 0 errors' + '+40 Karma' + 'Auto-tagged'),
// three tabs (Paste Text / Sheet Rows / Upload File - Paste Text first and
// default, v191 behavior kept), a parsed-source card (check circle, company
// + items badge, parsed-contacts line, View Raw toggle, two-tap trash that
// keeps v176's delete-all guard), a 'PARSED ITEMS READY' header (Quick Fill,
// Select all + Delete selected), batch chips (category / currency segmented
// ETB-Br|USD / location - each reveals its real editor), per-item CARDS
// (dashed photo box, bold name + 'Auto' badge, compact city-country-contact-
// link row, price pill with the currency suffix, X remove) with a 'Show
// remaining N items' expander, the BATCH SETTINGS & ATTRIBUTION card
// (avatar initials + shop owner name + Auto-synced) and a sticky footer:
// 'Review (N)' summary toggle + the green 'Publish N Drops Now' rocket with
// the '+40 Karma' chip inside.
// Every capability survives: the same parser endpoints, per-row photo
// upload (v178), two-tap delete all (v176), auto-clear after a fully
// successful batch (v176), shop-owner attribution (v183), currency/country
// inference (v175), TSV templates (v173) and the shared Benol example
// (v190/v191) as the placeholder + Load sample. defaults.city is now wired
// too (the API always accepted it; the UI never exposed it).
import { useEffect, useMemo, useState, useRef } from 'react'
import { Sheet, Plus, Trash2, Copy, FileUp, CheckCircle2, AlertTriangle, Sparkles, XCircle, Loader2, X, ClipboardList, UploadCloud, Zap, HelpCircle, ChevronLeft, ChevronDown, Tag, MapPin, SlidersHorizontal, Store, Eye, Rocket } from 'lucide-react'
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
import { compressImage } from '@/lib/image-compress'
import { splitLocationInput } from '@/lib/location'
import { PRICE_LIST_SAMPLE_SIMPLE } from '@/lib/price-list-example'
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

// v193: a parsed company header hints the batch category - a pharmaceutical
// / medical list (like the Benol suture post) auto-tags as biomedical so the
// 'Auto-tagged' chip is honest. Only applies while the category is still the
// untouched default ('Other') - a user's explicit choice always wins.
const AUTO_TAG_RE = /pharma|pharmaceutical|medical|clinic|hospital|drug|health|supplies/i
const AUTO_TAG_CATEGORY = 'Biomedical & Medical Supplies'

interface GridRow {
  productName: string
  price: string
  city: string
  country: string
  contact: string
  imageUrl: string
  // v193: the row came out of a parser (text / sheet / file) and shows the
  // green 'Auto' badge from the mockup; rows added by hand stay unmarked.
  auto: boolean
}

const emptyRow = (): GridRow => ({ productName: '', price: '', city: '', country: '', contact: '', imageUrl: '', auto: false })

// v191: the "Load sample" button fills from the shared example module
// (src/lib/price-list-example.ts) instead of a second local copy of the
// Benol post - one source of truth. v195: the bulk side drops the long
// Benol example entirely - the grey placeholder AND the loaded sample are
// now ONE plain line (PRICE_LIST_SAMPLE_SIMPLE, '2 liter water 60 addis
// ababa'); the company header stays only in the composer's placeholder.

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
    if (Object.values(row).some((v) => typeof v === 'string' && v.trim())) {
      row.auto = true
      rows.push(row)
    }
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

// v193: what the last parse produced - feeds the source card line
// ('Parsed from pasted text: 0911967478 - 15 items - 3 lines skipped').
interface ParseMeta {
  source: '' | 'sheet' | 'text' | 'file'
  company: string
  contacts: string[]
  ignored: number
}

const EMPTY_PARSE_META: ParseMeta = { source: '', company: '', contacts: [], ignored: 0 }

export function BulkPostModal({ open, onOpenChange, onCreated }: BulkPostModalProps) {
  const { toast } = useToast()
  const [paste, setPaste] = useState('')
  const [rows, setRows] = useState<GridRow[]>([])
  // v193: ETB is the default currency (the mockup shows 'ETB (Br)' active,
  // and the composer flipped to the same default in v192). The parse hint
  // below still switches KES/UGX/... lists away from it.
  const [currency, setCurrency] = useState('ETB')
  const [category, setCategory] = useState('Other')
  const [defCity, setDefCity] = useState('')
  const [defCountry, setDefCountry] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  // v174 source modes: text = free-form price list parsed server-side,
  // sheet = TSV/CSV grid paste (v173 behavior), file = upload docx/pdf/xlsx/csv.
  // v191: the modal OPENS on the text tab - the way users actually post
  // (pasted WhatsApp lists like the Benol example, which is the placeholder
  // they see immediately). Sheet and file stay one tap away.
  // v193: the tabs are the mockup's 'Paste Text / Sheet Rows / Upload File'.
  const [mode, setMode] = useState<'sheet' | 'text' | 'file'>('text')
  const [parsing, setParsing] = useState(false)
  const [parsedCompany, setParsedCompany] = useState('')
  // v183: the shop owner name this whole batch is sold under. Auto-filled
  // from the parsed list header (company line), editable before posting;
  // it rides defaults.ownsShop + defaults.shopOwnerName so every row in the
  // batch shows the amber Shop owner badge + the name on the card/detail.
  const [shopOwnerName, setShopOwnerName] = useState('')
  const [fileName, setFileName] = useState('')
  // v176: two-tap guard for Delete all - the first tap arms it, the second
  // (within 4s) wipes the grid. Prevents one accidental click from throwing
  // away 50 reviewed rows. v193: it lives on the source card's trash icon.
  const [deleteAllArmed, setDeleteAllArmed] = useState(false)
  // v193 presentation state (all reset when the modal closes - the component
  // stays mounted, so a reopen must start like the mockup's fresh sheet).
  const [showHelp, setShowHelp] = useState(false)
  const [viewRaw, setViewRaw] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [showCats, setShowCats] = useState(false)
  const [showLoc, setShowLoc] = useState(false)
  const [showCur, setShowCur] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selMode, setSelMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [parseMeta, setParseMeta] = useState<ParseMeta>(EMPTY_PARSE_META)

  // v193: every reopen starts clean presentation-wise (the v192 lesson -
  // the component stays mounted across a Radix close, so presentation state
  // must be reset explicitly, never left to remount luck). The DRAFT data
  // (paste, rows, defaults, attribution) intentionally survives a close,
  // exactly like it did since v173.
  useEffect(() => {
    if (open) return
    setShowHelp(false)
    setViewRaw(false)
    setShowAll(false)
    setShowCats(false)
    setShowLoc(false)
    setShowCur(false)
    setReviewOpen(false)
    setSelMode(false)
    setSelected(new Set())
    setDeleteAllArmed(false)
  }, [open])

  const problems = useMemo(() => rows.map((r) => rowProblem(r, defCountry)), [rows, defCountry])
  const readyCount = problems.filter((p) => p === null).length

  const ownerInitials = useMemo(() => {
    const words = shopOwnerName.trim().split(/\s+/).filter(Boolean)
    return words.length ? words.slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('') : ''
  }, [shopOwnerName])

  // Estimated batch value for the Review panel (ranges count their minimum).
  const totalValue = useMemo(
    () =>
      rows.reduce((acc, r) => {
        const raw = r.price.replace(/[^0-9.\-]/g, '')
        const dash = raw.indexOf('-')
        const n = dash > 0 ? Number(raw.slice(0, dash)) : Number(raw)
        return acc + (Number.isFinite(n) ? n : 0)
      }, 0),
    [rows]
  )

  const applyTemplate = (key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key]
    setPaste(`${t.header}\n${t.example}`)
    setPasteHint('Template loaded - paste your own rows under the header, or edit them in the grid after parsing.')
    setResult(null)
    setParsedCompany('')
    setShopOwnerName('')
    setParseMeta(EMPTY_PARSE_META)
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
    setShopOwnerName('')
    setParseMeta({ source: 'sheet', company: '', contacts: [], ignored: 0 })
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
    const parsedRows: { productName: unknown; price: unknown; city?: unknown }[] = Array.isArray(data?.rows) ? data.rows : []
    if (!parsedRows.length) {
      setRows([])
      setParsedCompany('')
      setShopOwnerName('')
      setParseMeta(EMPTY_PARSE_META)
      setPasteHint(
        source === 'file' && data?.fileName
          ? `No products with prices found in ${data.fileName} - scanned PDFs and photos are not readable, paste the text instead.`
          : 'No product + price lines found - each line needs a product name ending in a number, like "Vicryl 2 round ..950".'
      )
      return
    }
    const contacts: string[] = Array.isArray(data.contacts) ? data.contacts : []
    const contactStr = contacts.join(' / ')
    const company = String(data.company || '')
    setRows(
      parsedRows.map((r) => ({
        productName: String(r.productName || ''),
        price: String(r.price || ''),
        // v195: the parser's city tail ("2 liter water 60 addis ababa")
        // prefills the City cell - row cells always win over the defaults.
        city: String(r.city || ''),
        country: '',
        contact: contactStr,
        imageUrl: '',
        auto: true,
      }))
    )
    setParsedCompany(company)
    setParseMeta({ source, company, contacts, ignored: Number(data.ignored) || 0 })
    // v183: the detected company header IS the shop owner name - prefill the
    // editable input so the batch posts with a proper attribution instead of
    // a hidden "Sold by ..." description line.
    setShopOwnerName(company)
    // v193: auto-tag the batch category from the header (pharma/medical
    // lists land on Biomedical & Medical Supplies) - only while the user
    // has not chosen a category themselves.
    setCategory((prev) => (prev === 'Other' && AUTO_TAG_RE.test(company) ? AUTO_TAG_CATEGORY : prev))
    // v175: currency + country from the parse hints. The parser infers the
    // country from the contact numbers (Ethiopian phones are the one signal
    // always present in real price lists) and the currency from words like
    // "birr"; each fills the other's gap. Filling the Default country is
    // what un-sticks the Post button - it used to stay disabled (looking
    // "missing") because every parsed row lacked a country.
    // v193: ETB is now the OPENING default (v192 did the same in the
    // composer), so the hint must be allowed to confirm/switch off it too -
    // otherwise a KES list still switches but an explicit ETB parse can not.
    const hintCur = String(data.currencyHint || '') || COUNTRY_CURRENCY[String(data.countryHint || '')] || ''
    if (hintCur && CURRENCIES.includes(hintCur) && (currency === 'USD' || currency === 'ETB')) setCurrency(hintCur)
    const hintCountry = CURRENCY_COUNTRY[hintCur] || String(data.countryHint || '')
    if (hintCountry && !defCountry.trim()) setDefCountry(hintCountry)
    setPasteHint(
      `Parsed ${parsedRows.length} product${parsedRows.length !== 1 ? 's' : ''}` +
        (company ? ` from ${company}` : '') +
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
      setPasteHint('That file is over 4 MB - paste its text into the Paste Text tab instead.')
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

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx))
    setSelected((prev) => {
      const next = new Set<number>()
      prev.forEach((s) => { if (s < idx) next.add(s); else if (s > idx) next.add(s - 1) })
      return next
    })
  }

  // v193: Quick Fill - pour the batch defaults (city / country) and the
  // first parsed contact into every row cell still empty, so the cards show
  // exactly what will post instead of relying on server-side defaults.
  const quickFill = () => {
    const contact = parseMeta.contacts[0] || ''
    let filled = 0
    setRows((prev) =>
      prev.map((r) => {
        const next = { ...r }
        if (!next.city.trim() && defCity.trim()) { next.city = defCity.trim(); filled++ }
        if (!next.country.trim() && defCountry.trim()) { next.country = defCountry.trim(); filled++ }
        if (!next.contact.trim() && contact) { next.contact = contact; filled++ }
        return next
      })
    )
    toast(
      filled
        ? { title: 'Quick Fill applied', description: `${filled} empty cell${filled !== 1 ? 's' : ''} filled from the batch location and the parsed contacts.` }
        : { title: 'Nothing to fill', description: 'Every row already carries a location and a contact (or the batch defaults are empty).' }
    )
  }

  const toggleSelectAll = () => {
    if (selMode) {
      setSelMode(false)
      setSelected(new Set())
    } else {
      setSelMode(true)
      setSelected(new Set(rows.map((_, i) => i)))
    }
  }

  const deleteSelected = () => {
    const n = selected.size
    if (!n) return
    setRows((prev) => prev.filter((_, i) => !selected.has(i)))
    setSelected(new Set())
    setSelMode(false)
    setPasteHint(`${n} selected row${n !== 1 ? 's' : ''} deleted - the rest are still ready to post.`)
  }

  // v178: a real PHOTO input on every row - tap Photo, pick an image from
  // the device, it compresses (tighter than the single composer: a batch
  // carries many photos and they all ride in the same JSON post body),
  // uploads via /api/upload and lands on the row as a data URL with a
  // thumbnail preview. The mockup's dashed '+ Photo' box on every card.
  const imgFileRef = useRef<HTMLInputElement>(null)
  const [imgTarget, setImgTarget] = useState<number | null>(null)
  const [uploadingImg, setUploadingImg] = useState(false)

  const pickRowImage = (idx: number) => {
    setImgTarget(idx)
    imgFileRef.current?.click()
  }

  const onRowImagePicked = async (f?: File | null) => {
    if (!f || imgTarget == null || uploadingImg) return
    const target = imgTarget
    setUploadingImg(true)
    try {
      const compressed = await compressImage(f, 900, 0.72)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await authFetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      updateRow(target, { imageUrl: String(data.url || '') })
      toast({ title: 'Photo attached', description: `Row ${target + 1} will post with this photo.` })
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setUploadingImg(false)
      setImgTarget(null)
    }
  }

  // v176: delete EVERY row in one tap (two taps to confirm). Resets the
  // company banner and any post result with it - a clean slate for the
  // next batch. v193: this is the trash icon on the parsed-source card.
  const deleteAllRows = () => {
    if (!deleteAllArmed) {
      setDeleteAllArmed(true)
      window.setTimeout(() => setDeleteAllArmed(false), 4000)
      return
    }
    setDeleteAllArmed(false)
    setRows([])
    setParsedCompany('')
    setShopOwnerName('')
    setResult(null)
    setParseMeta(EMPTY_PARSE_META)
    setSelected(new Set())
    setSelMode(false)
    setPasteHint('All rows deleted - paste, parse or upload again to build a new batch.')
  }

  const submit = async () => {
    if (saving) return
    if (!readyCount) {
      toast({ title: 'Nothing ready to post', description: 'Every row needs a product name, a numeric price and a country (row or default).' })
      return
    }
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
        // v183: when the batch carries a shop owner name it is stored in its
        // own field (defaults.shopOwnerName) and rendered on the card - the
        // old "Sold by ..." description trick stays only as a fallback for a
        // cleared name, so old posts keep working and nothing double-renders.
        description: shopOwnerName.trim() ? '' : parsedCompany ? `Sold by ${parsedCompany}` : '',
      }))
    const reqBody = JSON.stringify({
      rows: payloadRows,
      defaults: {
        currency,
        category,
        postType: 'PRODUCT',
        // v193: the batch location chips expose the city default the API
        // always accepted (previously only the country default was settable).
        city: defCity.trim(),
        country: defCountry.trim(),
        // v183: naming the shop on the batch = declaring first-party
        // ownership - every posted row gets the Shop owner badge.
        ownsShop: Boolean(shopOwnerName.trim()),
        shopOwnerName: shopOwnerName.trim(),
      },
    })
    // v178: attached photos ride in the JSON body as base64 data URLs and
    // the serverless body limit is ~4.5 MB - a batch whose photos add up
    // past ~3.8 MB is stopped HERE with an explanation instead of a generic
    // network failure after the fact.
    if (reqBody.length > 3.8 * 1024 * 1024) {
      toast({
        title: 'Batch too large to send',
        description: 'The attached photos add up to more than the server accepts. Remove some row photos (tap the X on a thumbnail) or use image links instead, then post again.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/local-prices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
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
        setShopOwnerName('')
        setParseMeta(EMPTY_PARSE_META)
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

  // v193: the mockup collapses the list to three cards behind a
  // 'Show remaining N items' expander; everything else is one scroll.
  const shownRows = showAll ? rows.map((r, i) => ({ row: r, idx: i })) : rows.slice(0, 3).map((r, i) => ({ row: r, idx: i }))
  const hiddenCount = rows.length - Math.min(rows.length, 3)
  const firstContact = parseMeta.contacts[0] || ''
  const sourceLabel = parseMeta.source === 'file' ? (fileName || 'uploaded file') : parseMeta.source === 'sheet' ? 'pasted sheet rows' : 'pasted text'
  const allVerified = rows.length > 0 && readyCount === rows.length

  // __JSX_PART_B__
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 gap-0 bg-[#f6f8f7] dark:bg-background max-lg:top-0! max-lg:bottom-0! max-lg:left-0! max-lg:right-0! max-lg:translate-x-0! max-lg:translate-y-0! max-lg:w-full! max-lg:max-w-none! max-lg:h-dvh! max-lg:max-h-none! max-lg:rounded-none! max-lg:border-0!" data-testid="bulk-modal">
        <DialogHeader className="mb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={close}
              aria-label="Back"
              data-testid="bulk-back"
              className="w-8 h-8 shrink-0 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-foreground">
              Bulk Price Post
              <span title="Every row becomes its own price post" data-testid="bulk-mode-pill" className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 text-[10px] font-bold">
                <Zap className="w-3 h-3" />
                Bulk Mode
              </span>
            </DialogTitle>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              aria-label="Help"
              title="What this sheet does"
              data-testid="bulk-help"
              className={`ml-auto w-8 h-8 shrink-0 rounded-full bg-card border border-border flex items-center justify-center transition-colors ${showHelp ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <DialogDescription className={showHelp ? 'text-sm text-muted-foreground pl-[42px]' : 'hidden'}>
            Paste rows from Excel or Google Sheets, paste a messy price list, or upload a Word / PDF / Excel file - every row becomes its own price post with product, price, location, contact and an optional photo. Check everything in the cards before posting. Up to 50 rows per batch.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          {/* Status strip - the mockup's '12/12 verified - 0 errors' row with
              the reward + auto-tag chips on the right. */}
          <div className="flex items-center gap-2 flex-wrap" data-testid="bulk-statusbar">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${rows.length ? (allVerified ? 'bg-violet-500' : 'bg-amber-500') : 'bg-muted-foreground/40'}`}
              aria-hidden
            />
            <p className="text-xs font-semibold text-foreground" data-testid="bulk-status">
              {rows.length
                ? `${readyCount}/${rows.length} verified • ${rows.length - readyCount} error${rows.length - readyCount === 1 ? '' : 's'}`
                : 'Paste, upload or load a sample to begin'}
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              {readyCount > 0 && (
                <span title="A fully verified batch earns Karma" data-testid="bulk-karma-chip" className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-0.5 text-[11px] font-bold">
                  <Zap className="w-3 h-3" />
                  +40 Karma
                </span>
              )}
              {rows.length > 0 && (
                <span title="Category and contacts were auto-detected from your list" data-testid="bulk-auto-chip" className="rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-0.5 text-[11px] font-semibold">
                  Auto-tagged
                </span>
              )}
            </div>
          </div>

          {/* Source picker (v174, v193 restyle) - the mockup's three tabs:
              Paste Text first and default, then Sheet Rows, then Upload File.
              The active tab gets a white pill + the mockup's green dot. */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border w-full max-w-full" data-testid="bulk-source">
            {([
              { key: 'text', label: 'Paste Text', icon: ClipboardList, testid: 'bulk-source-text' },
              { key: 'sheet', label: 'Sheet Rows', icon: Sheet, testid: 'bulk-source-sheet' },
              { key: 'file', label: 'Upload File', icon: UploadCloud, testid: 'bulk-source-file' },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setMode(t.key)}
                data-testid={t.testid}
                className={`flex-1 h-8 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  mode === t.key ? 'bg-card shadow-sm text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {mode === t.key && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" aria-hidden />}
              </button>
            ))}
          </div>

          {/* Step 1 - get the rows in */}
          <div className="space-y-2" data-testid="bulk-paste-section">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {mode === 'sheet' && 'Paste your sheet rows or pick a template'}
                {mode === 'text' && 'Paste the price list text - any format'}
                {mode === 'file' && 'Upload a Word, PDF, Excel or CSV file'}
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
                  : PRICE_LIST_SAMPLE_SIMPLE}
                className="font-mono text-xs min-h-[150px] bg-card"
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
                <FileUp className="w-7 h-7 text-violet-600" />
                <p className="text-sm font-medium text-foreground">{fileName || 'Drop a file here, or choose one'}</p>
                <p className="text-xs text-muted-foreground">Word (.docx), PDF, Excel (.xlsx / .xls) or CSV up to 4 MB - read in memory, never stored.</p>
                <label className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-violet-700 text-white text-xs font-semibold cursor-pointer hover:bg-violet-800 transition-colors">
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
                <Button type="button" onClick={mode === 'sheet' ? doParse : doParseText} disabled={parsing} className="h-8 gap-1.5 rounded-full bg-violet-700 hover:bg-violet-800 text-white" data-testid="bulk-parse">
                  <UploadCloud className="w-3.5 h-3.5" /> {parsing ? 'Parsing...' : mode === 'sheet' ? 'Parse rows' : 'Parse & preview'}
                </Button>
              )}
              {mode === 'text' && (
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-full" onClick={() => setPaste(PRICE_LIST_SAMPLE_SIMPLE)} data-testid="bulk-sample" title="Load the sample line to try the parser">
                  <Sparkles className="w-3.5 h-3.5" /> Load sample
                </Button>
              )}
              {pasteHint && <p className="text-xs text-muted-foreground flex-1 min-w-[200px]" data-testid="bulk-paste-hint">{pasteHint}</p>}
            </div>
          </div>

          {/* Parsed source card + the ready items (v193) */}
          {rows.length > 0 && (
            <div className="space-y-3" data-testid="bulk-grid-section">
              {/* Source card - check circle, company + items badge, the
                  parsed contacts line, View Raw, two-tap trash. */}
              <div className="rounded-2xl bg-card border border-border shadow-sm p-3 flex items-center gap-3" data-testid="bulk-source-card">
                <span className="w-9 h-9 shrink-0 rounded-full bg-violet-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-violet-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground truncate">{parseMeta.company || fileName || 'Parsed list'}</p>
                    <span className="shrink-0 rounded-md bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-bold">
                      {rows.length} items
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Parsed from {sourceLabel}: {firstContact || 'no contacts detected'} • {rows.length} item{rows.length !== 1 ? 's' : ''}
                    {parseMeta.ignored ? ` • ${parseMeta.ignored} line${parseMeta.ignored !== 1 ? 's' : ''} skipped` : ''}
                  </p>
                </div>
                {paste.trim() && (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-full shrink-0" onClick={() => setViewRaw((v) => !v)} data-testid="bulk-view-raw-toggle" title={viewRaw ? 'Hide the raw pasted text' : 'Show the raw text this list was parsed from'}>
                    {viewRaw ? 'Hide Raw' : 'View Raw'}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={deleteAllRows}
                  data-testid="bulk-delete-all"
                  title={deleteAllArmed ? 'Tap again to delete all' : 'Delete every row in the batch'}
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${deleteAllArmed ? 'bg-destructive/10 text-destructive border border-destructive/40' : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'}`}
                >
                  {deleteAllArmed ? <XCircle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
              {viewRaw && paste.trim() && (
                <pre data-testid="bulk-view-raw" className="rounded-xl bg-muted/50 border border-border p-3 text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{paste}</pre>
              )}

              {/* Items header - count pill, Quick Fill, Select all (+ the
                  red Delete selected chip once a selection exists). */}
              <div className="flex items-center gap-2 flex-wrap" data-testid="bulk-items-header">
                <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">Parsed items ready</p>
                <span className="rounded-full border border-violet-300 bg-violet-50 text-violet-700 px-2 py-0.5 text-[10px] font-bold">
                  {rows.length} items
                </span>
                <div className="ml-auto flex items-center gap-2 text-xs">
                  <button type="button" onClick={quickFill} data-testid="bulk-quick-fill" className="font-bold text-violet-600 hover:text-violet-700" title="Fill every empty city / country / contact from the batch settings and the parsed contacts">
                    Quick Fill
                  </button>
                  <span className="text-border" aria-hidden>|</span>
                  <button type="button" onClick={toggleSelectAll} data-testid="bulk-select-all" className="text-muted-foreground hover:text-foreground font-semibold">
                    {selMode ? 'Deselect all' : 'Select all'}
                  </button>
                  {selected.size > 0 && (
                    <button type="button" onClick={deleteSelected} data-testid="bulk-delete-selected" className="rounded-full border border-destructive/40 bg-destructive/10 text-destructive px-2.5 py-0.5 text-[11px] font-bold hover:bg-destructive/20">
                      Delete selected ({selected.size})
                    </button>
                  )}
                </div>
              </div>

              {/* Batch chips - category, currency, location. Each chip opens
                  its real editor underneath; nothing is decorative. */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-muted-foreground font-medium">Batch:</span>
                <button
                  type="button"
                  onClick={() => setShowCats((v) => !v)}
                  data-testid="bulk-category-chip"
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 h-7 font-semibold transition-colors ${showCats || category !== 'Other' ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-card border-border text-foreground hover:border-violet-300'}`}
                  title="Pick the batch category (applies to every row)"
                >
                  <Tag className="w-3 h-3" />
                  {category}
                </button>
                <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5" data-testid="bulk-currency-chip" role="group" aria-label="Batch currency">
                  {(['ETB', 'USD'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      data-testid={c === 'ETB' ? 'bulk-cur-etb' : 'bulk-cur-usd'}
                      className={`px-2.5 h-6 rounded-full text-[11px] font-bold transition-all ${currency === c ? 'bg-violet-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {c === 'ETB' ? 'ETB (Br)' : 'USD'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCur((v) => !v)}
                    data-testid="bulk-cur-more"
                    title="More currencies"
                    className={`px-2 h-6 rounded-full text-[11px] font-bold transition-all ${showCur || !['ETB', 'USD'].includes(currency) ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    ⋯
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLoc((v) => !v)}
                  data-testid="bulk-location-chip"
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 h-7 font-semibold transition-colors ${showLoc || defCity.trim() || defCountry.trim() ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-card border-border text-foreground hover:border-violet-300'}`}
                  title="Set the batch location every row falls back to"
                >
                  <MapPin className="w-3 h-3" />
                  {defCity.trim() || defCountry.trim()
                    ? [defCity.trim(), defCountry.trim()].filter(Boolean).join(', ')
                    : 'Set location'}
                </button>
              </div>
              {showCats && (
                <CategorySelect
                  value={category}
                  onChange={setCategory}
                  mainTestid="bulk-category-main"
                  subTestid="bulk-category"
                  triggerClassName="h-8 text-xs"
                />
              )}
              {showCur && (
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-8 text-xs" data-testid="bulk-currency"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {showLoc && (
                <div className="flex items-center gap-1.5 flex-wrap" data-testid="bulk-location-editors">
                  <Input value={defCity} onChange={(e) => setDefCity(e.target.value)} className="h-8 text-xs w-[calc(50%-0.75rem)] sm:w-40 bg-card" placeholder="e.g. Addis Ababa" data-testid="bulk-default-city" />
                  <span className="hidden sm:inline text-muted-foreground text-xs">,</span>
                  <Input value={defCountry} onChange={(e) => setDefCountry(e.target.value)} className="h-8 text-xs w-[calc(50%-0.75rem)] sm:w-40 bg-card" placeholder="e.g. Ethiopia" data-testid="bulk-default-country" />
                  <p className="text-[11px] text-muted-foreground w-full">Applies to every row left empty - row cells always win.</p>
                </div>
              )}

              {/* Item cards - the mockup's dashed photo box, bold name +
                  Auto badge, compact location/contact row, price pill, X. */}
              <div className="space-y-2" data-testid="bulk-grid">
                {shownRows.map(({ row, idx }) => (
                  <div key={idx} className="rounded-2xl bg-card border border-border p-3 flex flex-wrap items-start gap-2.5" data-testid="bulk-row">
                    {selMode && (
                      <input
                        type="checkbox"
                        aria-label={`Select row ${idx + 1}`}
                        checked={selected.has(idx)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(idx)
                            else next.delete(idx)
                            return next
                          })
                        }
                        className="mt-1 w-4 h-4 accent-violet-600 shrink-0"
                      />
                    )}
                    {/* Photo box (pick + thumbnail + remove) */}
                    {row.imageUrl ? (
                      <span className="relative shrink-0" data-testid={`bulk-image-thumb-${idx}`}>
                        <img src={row.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-border" />
                        <button
                          type="button"
                          onClick={() => updateRow(idx, { imageUrl: '' })}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background border border-border text-muted-foreground hover:text-destructive flex items-center justify-center"
                          title="Remove this photo"
                          data-testid={`bulk-image-remove-${idx}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => pickRowImage(idx)}
                        disabled={uploadingImg}
                        data-testid={`bulk-image-pick-${idx}`}
                        title="Pick a photo for this row"
                        className="w-14 h-14 shrink-0 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 hover:border-violet-400 flex flex-col items-center justify-center gap-0.5 text-violet-700 transition-colors"
                      >
                        {uploadingImg && imgTarget === idx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span className="text-[9px] font-bold">{uploadingImg && imgTarget === idx ? '...' : 'Photo'}</span>
                      </button>
                    )}
                    <div className="flex-1 min-w-[160px] space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={row.productName}
                          onChange={(e) => updateRow(idx, { productName: e.target.value })}
                          className="h-7 flex-1 min-w-0 border-0 bg-transparent px-0 text-sm font-bold shadow-none focus-visible:ring-0"
                          placeholder="Product name"
                          data-testid={`bulk-cell-product-${idx}`}
                        />
                        {row.auto && (
                          <span className="shrink-0 rounded-full bg-violet-50 border border-violet-200 text-violet-700 px-1.5 py-0.5 text-[10px] font-bold" title="Parsed automatically - edit freely">
                            ✓ Auto
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1 sm:flex sm:items-center sm:gap-1 sm:flex-wrap">
                        <Input value={row.city} onChange={(e) => updateRow(idx, { city: e.target.value })} className="h-6 w-full sm:w-24 border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/70" placeholder="City" data-testid={`bulk-cell-city-${idx}`} />
                        <span className="hidden sm:inline text-muted-foreground/60 text-[11px]" aria-hidden>•</span>
                        <Input value={row.country} onChange={(e) => updateRow(idx, { country: e.target.value })} className="h-6 w-full sm:w-24 border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/70" placeholder="Country" data-testid={`bulk-cell-country-${idx}`} />
                        <span className="hidden sm:inline text-muted-foreground/60 text-[11px]" aria-hidden>•</span>
                        <Input value={row.contact} onChange={(e) => updateRow(idx, { contact: e.target.value })} className="h-6 w-full col-span-2 min-w-0 sm:col-span-1 sm:flex-1 sm:min-w-[110px] border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/70" placeholder="Phone / email" data-testid={`bulk-cell-contact-${idx}`} />
                        <span className="hidden sm:inline text-muted-foreground/60 text-[11px]" aria-hidden>•</span>
                        <Input
                          value={row.imageUrl.startsWith('data:') ? '' : row.imageUrl}
                          onChange={(e) => updateRow(idx, { imageUrl: e.target.value })}
                          disabled={row.imageUrl.startsWith('data:')}
                          className="h-6 w-full col-span-2 min-w-0 sm:col-span-1 sm:flex-1 sm:min-w-[90px] border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/70"
                          placeholder={row.imageUrl.startsWith('data:') ? 'Photo attached' : 'Image link'}
                          data-testid={`bulk-cell-image-${idx}`}
                        />
                      </div>
                      {problems[idx] && (
                        <p className="text-[11px] text-red-600 flex items-center gap-1" data-testid={`bulk-row-error-${idx}`}>
                          <AlertTriangle className="w-3 h-3 shrink-0" /> {problems[idx]}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <div className="flex items-center gap-1 rounded-lg border border-border bg-background pl-2 pr-1.5 h-9">
                        <Input
                          value={row.price}
                          onChange={(e) => updateRow(idx, { price: e.target.value })}
                          className="w-16 text-right border-0 bg-transparent p-0 h-7 text-sm font-bold shadow-none focus-visible:ring-0"
                          placeholder="0"
                          data-testid={`bulk-cell-price-${idx}`}
                        />
                        <span className="text-[10px] font-bold text-muted-foreground">{currency}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="w-7 h-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"
                        title="Delete this row"
                        data-testid={`bulk-remove-row-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hidden shared per-row photo picker (v178) */}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                ref={imgFileRef}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  void onRowImagePicked(f)
                }}
              />

              {/* Expander + Add row */}
              {rows.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  data-testid="bulk-show-more"
                  className="w-full h-9 rounded-xl bg-muted/60 border border-border text-xs font-semibold text-foreground flex items-center justify-center gap-1.5 hover:bg-muted transition-colors"
                >
                  {showAll ? 'Show less' : `Show remaining ${hiddenCount} item${hiddenCount !== 1 ? 's' : ''}`}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
                </button>
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-full" onClick={() => setRows((prev) => [...prev, emptyRow()])} data-testid="bulk-add-row">
                  <Plus className="w-3 h-3 mr-1" /> Add row
                </Button>
                <p className="text-[11px] text-muted-foreground">Tap the trash on the card above to delete all {rows.length} rows.</p>
              </div>
            </div>
          )}

          {/* Batch settings & attribution (v183/v193) */}
          <div className="rounded-2xl bg-card border border-border shadow-sm p-4 space-y-3" data-testid="bulk-defaults">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">Batch settings &amp; attribution</p>
              <span className="ml-auto text-[11px] font-bold text-violet-600" title="These settings auto-apply to every row you leave empty">
                Auto-synced
              </span>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-full bg-violet-100 flex items-center justify-center text-sm font-extrabold text-violet-700 overflow-hidden" data-testid="bulk-owner-avatar" title={shopOwnerName.trim() || 'No shop attribution'}>
                {ownerInitials || <Store className="w-4 h-4 text-violet-600" />}
              </span>
              <div className="flex-1 min-w-0">
                <Input
                  id="bulk-shop-owner-name"
                  value={shopOwnerName}
                  onChange={(e) => setShopOwnerName(e.target.value)}
                  className="h-7 border-0 bg-transparent px-0 text-sm font-bold shadow-none focus-visible:ring-0"
                  placeholder="Benol pharma plc"
                  data-testid="bulk-shop-owner-name"
                />
                <p className="text-[11px] text-muted-foreground truncate" data-testid="bulk-shop-owner-hint">
                  {shopOwnerName.trim()
                    ? `Every row will post as first-party stock from ${shopOwnerName.trim()} with the Shop owner badge.`
                    : 'Shop owner name - auto-filled from the list header. Leave empty to post without a shop attribution (no badge).'}
                </p>
              </div>
            </div>
            {rows.length > 0 && readyCount === 0 && !saving && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium" data-testid="bulk-submit-hint">
                Nothing is postable yet - fix the red row errors above, usually by filling the batch location (tap Set location) or each row&apos;s Country cell. The Publish button turns on as soon as one row is ready.
              </p>
            )}
            {result && (
              <div className="rounded-lg border border-border bg-background p-2.5 text-xs space-y-1" data-testid="bulk-result">
                <p className="font-medium text-violet-700 dark:text-violet-400 flex items-center gap-1.5">
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

          {/* Review summary (the footer's Review (N) toggle) */}
          {reviewOpen && rows.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-4 text-xs space-y-1.5" data-testid="bulk-review-panel">
              <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">Review before publishing</p>
              <p className="text-muted-foreground">
                {rows.length} item{rows.length !== 1 ? 's' : ''} • {readyCount} verified • {rows.length - readyCount} with problems • {currency} • {category}
              </p>
              <p className="text-muted-foreground">
                Attribution: {shopOwnerName.trim() || 'none (shared prices, no Shop owner badge)'} • Location: {[defCity.trim(), defCountry.trim()].filter(Boolean).join(', ') || 'row cells only'}
              </p>
              <p className="text-muted-foreground">
                Estimated batch value: {totalValue.toLocaleString()} {currency} (ranges count their minimum)
              </p>
            </div>
          )}
        </div>

        {/* Sticky footer - Review (N) beside the green Publish rocket with
            the mockup's '+40 Karma' chip inside. */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 mt-6 flex items-center gap-3 min-w-0 pt-4 px-4 sm:px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 bg-background/95 backdrop-blur-sm border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReviewOpen((v) => !v)}
            disabled={!rows.length}
            data-testid="bulk-review"
            title="Show a compact summary of the batch"
            className="px-4 h-11 rounded-full font-bold gap-1.5 shrink-0"
          >
            <Eye className="w-4 h-4" />
            Review ({rows.length})
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving || !readyCount}
            className="flex-1 min-w-0 px-4 sm:px-6 h-11 rounded-full bg-violet-700 hover:bg-violet-800 text-white font-bold gap-2"
            data-testid="bulk-submit"
          >
            {saving ? (
              'Publishing...'
            ) : (
              <>
                <Rocket className="w-4 h-4 shrink-0" />
                <span className="truncate">Publish {readyCount > 0 ? `${readyCount} ${readyCount === 1 ? 'Drop' : 'Drops'} ` : ''}Now</span>
                {readyCount > 0 && (
                  <span className="hidden sm:inline rounded-full bg-card/20 px-2 py-0.5 text-[11px] font-bold shrink-0">+40 Karma →</span>
                )}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
