'use client'

import { useState, useRef, useEffect } from 'react'
import { X, MapPin, Lightbulb, Camera, Sparkles, FileText, Loader2, ListX, Rocket, ChevronDown, ChevronLeft, Zap, Sheet, ReceiptText } from 'lucide-react'
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
import { identifyPhoto, type IdentifyCompareResult } from '@/lib/photo-identify'
import { CATEGORIES, matchCategoryLoose } from '@/lib/categories'
import { CategorySelect } from './category-select'
import { MEASURE_UNITS } from '@/lib/product-units'
import { joinLocationParts, splitLocationInput } from '@/lib/location'
import { PRICE_LIST_EXAMPLE } from '@/lib/price-list-example'
import { ComparePreview } from './compare-preview'
// v256: the full bulk poster opens FROM the price composer - the "Bulk post"
// button in the header. Text, sheet rows, file upload or a fetched link.
import { BulkPostModal } from './bulk-post-modal'

// Optional values carried over from the camera-search results panel - when
// the AI identifies a product from a picture, "Post this product" opens this
// modal with everything it can fill in already set.
export interface CreatePricePostPrefill {
  productName?: string
  description?: string
  category?: string
  currency?: string
  priceMin?: number | string
  priceMax?: number | string
  country?: string
  city?: string
  imageUrl?: string
  // v259: the FEED's receipt place hands the picked slip photo straight
  // over - the composer starts the parse chain the moment it opens, no
  // second tap on an in-composer button. Survives the v257 sign-in gate
  // (the File rides in pendingPostRef until the user is back).
  receiptFile?: File
}

interface CreatePricePostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  prefill?: CreatePricePostPrefill | null
}

const CURRENCIES = ['USD', 'ETB', 'KES', 'UGX', 'MYR', 'EUR', 'INR', 'CNY', 'JPY', 'GBP', 'AUD', 'NGN', 'TZS', 'RWF', 'GHS', 'HKD', 'AED', 'ZAR', 'CAD', 'SGD', 'THB', 'EGP', 'MAD']

// v192: the Draft button stores the half-filled form on THIS device so a
// dropped post is never lost. Restored from the banner on the next open.
const DRAFT_KEY = 'circub:quick-price-draft'
// CATEGORIES (full flat alphabetical list) now lives in @/lib/categories -
// the single source shared by every picker and filter.

// v189: same currency inference the bulk poster uses (v175) - a parsed price
// list whose contact numbers are Ethiopian gets ETB as the default currency
// when the list itself does not name one ("birr" etc). Ambiguous currencies
// (USD, EUR) are deliberately absent.
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

// One parsed row of the pasted price list (the /bulk/parse endpoint's shape).
interface ParsedListRow {
  productName: string
  price: string
}

export function CreatePricePostModal({ open, onOpenChange, onCreated, prefill }: CreatePricePostModalProps) {
  const [postType, setPostType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT')
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  // v123: ONE location input - "City, Country" separated by a comma
  // ("Addis Ababa, Ethiopia"). Parsed back into the API's separate
  // city/country columns on save.
  const [location, setLocation] = useState('')
  // v189 columns the API still takes - v247 removed their inputs from the
  // flow (user: "make the location input remove the rest"), they simply
  // stay empty and the payload shape is unchanged.
  const [neighborhood, setNeighborhood] = useState('')
  const [market, setMarket] = useState('')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  // v192: the composer is an Ethiopian-market flow first - the unit toggle
  // starts on ETB. The full 23-currency list stays one tap
  // away ("⋯" pill / auto-revealed when the currency is neither ETB nor USD).
  const [currency, setCurrency] = useState('ETB')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [localTip, setLocalTip] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactWhatsApp, setContactWhatsApp] = useState('')
  // Does the poster OWN the shop/business this price belongs to? Owners get
  // a "Shop owner" badge on the published post - travelers know the price
  // comes first-hand from the business itself.
  const [ownsShop, setOwnsShop] = useState(false)
  const [shopOwnerName, setShopOwnerName] = useState('')
  // v189: "Price list text" - paste a whole price list (WhatsApp style) and
  // the SAME parser the bulk post uses pulls out every product + price line.
  // One parsed row just fills the form; several parsed rows publish as
  // several separate price posts (through the bulk endpoint) on Publish.
  const [priceListText, setPriceListText] = useState('')
  const [parsingList, setParsingList] = useState(false)
  const [listRows, setListRows] = useState<ParsedListRow[]>([])
  const [listHint, setListHint] = useState<string | null>(null)
  // v258: POST WITH RECEIPT - the Receipt button takes a receipt photo and
  // the vision chain reads EVERY line on it (merchant, date, currency, each
  // item with its price). The rows land in the SAME review list as the
  // pasted price list and publish through the SAME bulk contract, so the
  // user confirms every row before anything posts.
  const receiptRef = useRef<HTMLInputElement | null>(null)
  const [receiptBusy, setReceiptBusy] = useState(false)
  // "Make it story while posting a new price": ON by default - publishing
  // also shares the price as a 24h story banner in the feed's stories strip.
  const [alsoStory, setAlsoStory] = useState(true)
  // v122: marketplace details from the unified composer. unit '' = 'each'
  // (no suffix); quantity '' = not set. Both ride along to the auto-created
  // product listing.
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('Other')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  // v256: the full bulk poster (paste text / sheet rows / upload / link)
  // opens on top of the composer from the header "Bulk post" button.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [compareResult, setCompareResult] = useState<IdentifyCompareResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // v247 AI PROFORMA (user: "make the proforma like only the ai"): the
  // composer is a conversation, not a form wall. The assistant asks ONE
  // question at a time - where, what, how much - each answer lands in the
  // SAME state handleSave posts, and the last step is a review card with
  // the publish button. 1 = where, 2 = what, 3 = price, 4 = review.
  const [askStep, setAskStep] = useState(1)
  // Presentation state kept from v192: the initial-asking-price reveal and
  // the full currency list reveal.
  const [showAsk, setShowAsk] = useState(false) // "+ Edit ask" reveals the initial-asking-price input
  const [showAllCur, setShowAllCur] = useState(false) // '⋯' reveals the full currency list
  const [detailsOpen, setDetailsOpen] = useState(false) // the "Optional details" collapsible on the review card
  const [draftAvailable, setDraftAvailable] = useState(false)
  const [draftTs, setDraftTs] = useState<string | null>(null)

  // Apply the camera-search prefill each time the modal OPENS with one -
  // user edits stay intact while the modal stays open; closing resets.
  useEffect(() => {
    if (!open || !prefill) return
    if (prefill.productName) setProductName(prefill.productName)
    if (prefill.description) setDescription(prefill.description)
    if (prefill.category && CATEGORIES.includes(prefill.category)) setCategory(prefill.category)
    if (prefill.currency && CURRENCIES.includes(prefill.currency)) setCurrency(prefill.currency)
    if (prefill.priceMin !== undefined && prefill.priceMin !== '') setPriceMin(String(prefill.priceMin))
    if (prefill.priceMax !== undefined && prefill.priceMax !== '') setPriceMax(String(prefill.priceMax))
    // Camera-search prefill still knows city + country separately - join
    // them into the single "City, Country" input.
    if (prefill.country || prefill.city) setLocation(joinLocationParts(prefill.city, prefill.country))
    if (prefill.imageUrl) setImageUrl(prefill.imageUrl)
  }, [open, prefill])

  // The conversation STARTS on the first question that is not already
  // answered (camera prefill drops the user straight at the review card
  // when it filled everything; a restored draft lands on the first gap).
  useEffect(() => {
    if (!open) return
    if (!prefill) {
      // No prefill: a manual reopen after the modal stayed mounted keeps
      // whatever the user answered - land on the first unanswered question.
      setAskStep(!location.trim() ? 1 : !productName.trim() ? 2 : !(priceMin.trim() || priceMax.trim()) ? 3 : 4)
      return
    }
    const loc = Boolean(prefill.city || prefill.country) || location.trim() !== ''
    const name = Boolean(prefill.productName) || productName.trim() !== ''
    const price = (prefill.priceMin !== undefined && prefill.priceMin !== '') || (prefill.priceMax !== undefined && prefill.priceMax !== '') || priceMin.trim() !== '' || priceMax.trim() !== ''
    setAskStep(loc && name && price ? 4 : loc && name ? 3 : loc ? 2 : 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  // v259: a receipt picked straight from the FEED lands here - run the same
  // parse chain as the composer's own Receipt button (upload photo, OCR every
  // line, fill the review rows). Fires once per picked file; while the chain
  // runs the composer shows its first question (where), which the user can
  // answer in parallel - the review card replaces it when the read completes.
  const handledReceiptRef = useRef<File | null>(null)
  useEffect(() => {
    if (!open || !prefill?.receiptFile) return
    if (handledReceiptRef.current === prefill.receiptFile) return
    handledReceiptRef.current = prefill.receiptFile
    void handleReceiptPick(prefill.receiptFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  // v192 Draft: when the composer OPENS, check this device for a saved
  // draft and offer it through the restore banner. Nothing auto-fills -
  // the user explicitly taps Restore.
  useEffect(() => {
    if (!open) return
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d && (d.productName || d.priceMin || d.priceMax || (Array.isArray(d.listRows) && d.listRows.length))) {
          setDraftAvailable(true)
          setDraftTs(d.ts ? new Date(d.ts).toLocaleString() : null)
          return
        }
      }
    } catch { /* corrupted draft = no banner */ }
    setDraftAvailable(false)
    setDraftTs(null)
  }, [open])

  const restoreDraft = () => {
    try {
      const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null')
      if (d) {
        if (d.postType === 'PRODUCT' || d.postType === 'SERVICE') setPostType(d.postType)
        if (typeof d.productName === 'string') setProductName(d.productName)
        if (typeof d.description === 'string') setDescription(d.description)
        if (typeof d.category === 'string' && CATEGORIES.includes(d.category)) setCategory(d.category)
        if (typeof d.currency === 'string' && CURRENCIES.includes(d.currency)) setCurrency(d.currency)
        if (typeof d.priceMin === 'string') setPriceMin(d.priceMin)
        if (typeof d.priceMax === 'string') setPriceMax(d.priceMax)
        if (typeof d.localTip === 'string') setLocalTip(d.localTip)
        if (typeof d.contactPhone === 'string') setContactPhone(d.contactPhone)
        if (typeof d.contactEmail === 'string') setContactEmail(d.contactEmail)
        if (typeof d.contactWhatsApp === 'string') setContactWhatsApp(d.contactWhatsApp)
        if (typeof d.location === 'string') setLocation(d.location)
        if (typeof d.neighborhood === 'string') setNeighborhood(d.neighborhood)
        if (typeof d.market === 'string') setMarket(d.market)
        if (typeof d.ownsShop === 'boolean') setOwnsShop(d.ownsShop)
        if (typeof d.shopOwnerName === 'string') setShopOwnerName(d.shopOwnerName)
        if (typeof d.quantity === 'string') setQuantity(d.quantity)
        if (typeof d.unit === 'string') setUnit(d.unit)
        if (typeof d.priceListText === 'string') setPriceListText(d.priceListText)
        if (Array.isArray(d.listRows)) setListRows(d.listRows)
        if (typeof d.alsoStory === 'boolean') setAlsoStory(d.alsoStory)
        // Land the conversation on the first question the draft left open.
        setAskStep(
          !(d.location || '').trim() ? 1
            : !(d.productName || '').trim() ? 2
              : !(d.priceMin || '').trim() && !(d.priceMax || '').trim() ? 3
                : 4,
        )
        toast({ title: 'Draft restored', description: 'Pick up right where you left off.' })
      }
    } catch { /* corrupted draft - ignore */ }
    window.localStorage.removeItem(DRAFT_KEY)
    setDraftAvailable(false)
  }

  const discardDraft = () => {
    try { window.localStorage.removeItem(DRAFT_KEY) } catch {}
    setDraftAvailable(false)
  }

  const saveDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
        postType, productName, description, category, currency, priceMin, priceMax,
        localTip, contactPhone, contactEmail, contactWhatsApp, location, neighborhood,
        market, ownsShop, shopOwnerName, quantity, unit, priceListText, listRows,
        alsoStory, ts: Date.now(),
      }))
      toast({ title: 'Draft saved on this device', description: 'Reopen the composer and tap Restore to continue where you left off.' })
      reset()
      onOpenChange(false)
    } catch {
      toast({ title: 'Could not save the draft', variant: 'destructive' })
    }
  }

  const reset = () => {
    setPostType('PRODUCT')
    setProductName('')
    setDescription('')
    setLocation('')
    setNeighborhood('')
    setMarket('')
    setGpsLat(null)
    setGpsLng(null)
    setCurrency('ETB')
    setPriceMin('')
    setPriceMax('')
    setLocalTip('')
    setOwnsShop(false)
    setShopOwnerName('')
    setPriceListText('')
    setListRows([])
    setListHint(null)
    setAlsoStory(true)
    setQuantity('')
    setUnit('')
    setCategory('Other')
    setImageUrl('')
    setCompareResult(null)
    setComparing(false)
    // v247 conversation state - every reopen starts on question one,
    // details collapsed, ask hidden.
    setAskStep(1)
    setShowAsk(false)
    setShowAllCur(false)
    setDetailsOpen(false)
    setDraftAvailable(false)
  }

  const handleUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    let compressed: File | Blob = file
    try {
      // Downscale first - phone photos are 2-5 MB and would bloat the DB.
      compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }
      const data = await res.json()
      setImageUrl(data.url)
      toast({ title: 'Photo added' })
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
      setUploading(false)
      return
    }
    setUploading(false)

    // Identify the product from the SAME photo and pull matching price
    // posts - the review card shows the comparison before publishing.
    // Errors are non-fatal: the photo is already uploaded.
    setComparing(true)
    try {
      const loc = splitLocationInput(location)
      const result = await identifyPhoto(compressed, { city: loc.city || null, country: loc.country || null })
      setCompareResult(result)
      // Pre-fill only EMPTY fields - never override what the user typed.
      if (!productName.trim() && result.searchTerm) setProductName(result.searchTerm)
      if (!description.trim() && result.aiDescription) setDescription(result.aiDescription)
      if (!category || category === 'Other') {
        const hit = matchCategoryLoose(result.searchTerm)
        if (hit) setCategory(hit)
      }
      if (!priceMin && !priceMax) {
        // Prefill ONLY from real posted prices (locationCompare) - the AI
        // estimate is too unreliable to type into the user's form. It still
        // shows in the comparison preview for reference.
        const range = result.locationCompare
        if (range && range.currency && CURRENCIES.includes(range.currency)) {
          setCurrency(range.currency)
          setPriceMin(String(range.min))
          setPriceMax(String(range.max))
        }
      }
    } catch { /* comparison is optional - posting continues as usual */ }
    setComparing(false)
  }

  // v189: parse the pasted price list with the SAME server parser the bulk
  // poster uses (/api/local-prices/bulk/parse - WhatsApp bullets, dotted
  // prices, company headers, phone lines). The FIRST parsed row prefills the
  // form (name, price, contacts, currency/country hints); ALL rows stay in
  // the review list - several rows publish as several separate price posts.
  const parsePriceList = async () => {
    if (parsingList) return
    if (!priceListText.trim()) {
      setListHint('Paste the price list text first - one product per line ending in its price, plus any contact numbers and a company header.')
      return
    }
    setParsingList(true)
    try {
      const res = await authFetch('/api/local-prices/bulk/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: priceListText }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not parse the text')
      const parsedRows: { productName: unknown; price: unknown }[] = Array.isArray(data?.rows) ? data.rows : []
      const mapped: ParsedListRow[] = parsedRows.map((r) => ({ productName: String(r.productName || ''), price: String(r.price ?? '') }))
      if (!mapped.length) {
        setListRows([])
        setListHint('No product + price lines found - each line needs a product name ending in a number, like "Vicryl 2 round ..950".')
        return
      }
      setListRows(mapped)
      // The first row fills the form so a one-item list behaves like a
      // normal single post (photo and the story banner still apply).
      const first = mapped[0]
      setProductName(first.productName)
      const raw = first.price.replace(/[^0-9.\-]/g, '')
      const dash = raw.indexOf('-')
      if (dash > 0) {
        setPriceMin(raw.slice(0, dash))
        setPriceMax(raw.slice(dash + 1))
      } else {
        setPriceMin(raw)
        setPriceMax('')
      }
      const contacts: string[] = Array.isArray(data.contacts) ? data.contacts : []
      for (const c of contacts) {
        const v = String(c || '').trim()
        if (!v) continue
        // v190: FUNCTIONAL updates - the loop reads stale state otherwise,
        // so a list with several phone lines (the Benol example has three)
        // ended up filling the LAST number instead of the first.
        if (v.includes('@')) setContactEmail((prev) => (prev.trim() ? prev : v))
        else setContactPhone((prev) => (prev.trim() ? prev : v))
      }
      const company = String(data.company || '')
      if (company && !shopOwnerName.trim()) setShopOwnerName(company)
      const hintCur = String(data.currencyHint || '') || COUNTRY_CURRENCY[String(data.countryHint || '')] || ''
      if (hintCur && CURRENCIES.includes(hintCur) && (currency === 'USD' || currency === 'ETB')) setCurrency(hintCur)
      const hintCountry = String(data.countryHint || '')
      if (hintCountry && !location.trim()) setLocation(hintCountry)
      setListHint(
        `Parsed ${mapped.length} product${mapped.length !== 1 ? 's' : ''}` +
          (company ? ` from ${company}` : '') +
          (contacts.length ? ` - ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} detected` : '') +
          (mapped.length > 1
            ? `. Publishing posts all ${mapped.length} as separate price posts - the location, category, currency and contacts above apply to every row.`
            : '. The first row filled the answers above - publish it as a normal single price.')
      )
    } catch (e) {
      toast({ title: 'Parse failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setParsingList(false)
    }
  }

  const removeListRow = (idx: number) => {
    setListRows((prev) => prev.filter((_, i) => i !== idx))
    if (listRows.length <= 1) setListHint(null)
  }

  // v258: POST WITH RECEIPT. The receipt photo is compressed, uploaded (it
  // becomes the post photo - proof on every published row) and sent to
  // /api/receipt/parse where the vision chain acquires ALL the information
  // from the image: merchant, date, currency and every line item. The rows
  // fill the same review list as a pasted price list - nothing posts until
  // the user hits Drop Price Now.
  const handleReceiptPick = async (file: File) => {
    if (receiptBusy) return
    setReceiptBusy(true)
    try {
      const compressed = await compressImage(file)
      const fd = new FormData()
      fd.append('file', compressed)
      // The receipt photo doubles as the post photo - same contract as the
      // manual photo box. Upload failure is non-fatal: rows can still post
      // without the proof image.
      try {
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd })
        if (upRes.ok) {
          const up = await upRes.json().catch(() => null)
          if (up?.url) setImageUrl(up.url)
        }
      } catch { /* photo is optional - the rows can still post */ }

      const res = await authFetch('/api/receipt/parse', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Could not read the receipt')
      const items: Array<{ name?: unknown; qty?: unknown; unitPrice?: unknown; lineTotal?: unknown }> = Array.isArray(data?.items) ? data.items : []
      const rows: ParsedListRow[] = items
        .map((it) => {
          const name = String(it.name || '').replace(/\s+/g, ' ').trim()
          if (!name) return null
          const rawPrice = it.lineTotal ?? it.unitPrice
          const price = rawPrice === null || rawPrice === undefined ? '' : String(rawPrice)
          // The bulk rows carry name + price only - a multi-item slip keeps
          // its quantity readable by folding it into the name ("Coffee x2").
          const qty = it.qty === null || it.qty === undefined ? '' : String(it.qty)
          const named = qty && Number(qty) > 1 && !/x\d/i.test(name) ? `${name} x${qty}` : name
          return { productName: named.slice(0, 120), price }
        })
        .filter((r): r is ParsedListRow => !!r)
      if (!rows.length) throw new Error('No line items found on that photo - make sure the whole receipt is flat, in frame and readable.')
      setListRows(rows)
      // The first item fills the answers so a one-item receipt behaves like
      // a normal single post; several items publish as separate price posts.
      const first = rows[0]
      setProductName(first.productName)
      const raw = first.price.replace(/[^0-9.\-]/g, '')
      const dash = raw.indexOf('-')
      if (dash > 0) {
        setPriceMin(raw.slice(0, dash))
        setPriceMax(raw.slice(dash + 1))
      } else if (raw) {
        setPriceMin(raw)
        setPriceMax('')
      }
      const cur = String(data?.currency || '')
      if (cur && CURRENCIES.includes(cur)) setCurrency(cur)
      const merchant = String(data?.merchant || '')
      const date = String(data?.date || '')
      if ((merchant || date) && !description.trim()) {
        setDescription(`From receipt${merchant ? ` - ${merchant}` : ''}${date ? ` - ${date}` : ''}`)
      }
      // Land the user on the REVIEW card: the receipt already answered
      // what/price/currency, so the remaining work is confirm-and-publish
      // (the review card is where the parsed rows and Optional details live).
      setAskStep(4)
      setDetailsOpen(true)
      setListHint(
        `Receipt read: ${rows.length} item${rows.length !== 1 ? 's' : ''}` +
          (merchant ? ` from ${merchant}` : '') +
          (date ? ` dated ${date}` : '') +
          '. Review the rows below - remove anything that should not post - then Drop Price. The receipt photo rides on every row.'
      )
      toast({ title: 'Receipt read', description: `${rows.length} item${rows.length !== 1 ? 's' : ''} found on the slip.` })
    } catch (e) {
      toast({ title: 'Receipt failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setReceiptBusy(false)
    }
  }

  const handleSave = async () => {
    // v189: with TWO or more parsed price-list rows the composer publishes
    // the whole list through the bulk endpoint - one price post per row,
    // every row carrying the conversation's location, category, currency
    // and contacts. Photo, local tip and the story banner stay single-post
    // features.
    const listMode = listRows.length >= 2
    // v178: ONE price is enough. The composer used to demand BOTH a min and
    // a max, so a user who knows a single price had to type it twice before
    // the button would work. Now either box alone publishes - the missing
    // side mirrors the filled one (min=max, exactly how the bulk poster
    // stores a single price) and both filled still gives a real range.
    const minFilled = priceMin.trim() !== ''
    const maxFilled = priceMax.trim() !== ''
    if (listMode) {
      if (!location.trim() || currency.trim() === '') {
        toast({
          title: 'Missing required fields',
          description: 'Location (City, Country) and currency are required to post the price list.',
          variant: 'destructive',
        })
        return
      }
    } else if (!productName.trim() || !location.trim() || currency.trim() === '' || (!minFilled && !maxFilled)) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in product name, location (City, Country), currency, and at least one price.',
        variant: 'destructive',
      })
      return
    }
    const numMin = minFilled ? Number(priceMin) : Number(priceMax)
    const numMax = maxFilled ? Number(priceMax) : Number(priceMin)
    if (!listMode && (!Number.isFinite(numMin) || !Number.isFinite(numMax) || numMin < 0 || numMax < numMin)) {
      toast({
        title: 'Price range invalid',
        description: 'Prices must be numbers, and the max cannot be smaller than the min.',
        variant: 'destructive',
      })
      return
    }

    // The single input must carry a country - "Addis Ababa" alone does not
    // say WHICH country the price is from (the API stores city + country
    // separately and the feed filters by country).
    const loc = splitLocationInput(location)
    if (!loc.country) {
      toast({
        title: 'Add the country',
        description: 'Type the location as "City, Country" - e.g. Addis Ababa, Ethiopia.',
        variant: 'destructive',
      })
      return
    }

    if (listMode) {
      setSaving(true)
      try {
        const res = await authFetch('/api/local-prices/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: listRows.map((r) => ({
              productName: r.productName,
              price: r.price,
              city: loc.city,
              country: loc.country,
              contactPhone: contactPhone.trim(),
              contactEmail: contactEmail.trim(),
              contactWhatsApp: contactWhatsApp.trim(),
              description: description.trim(),
              // v258: a receipt read fills the review rows - the receipt
              // photo (already uploaded) rides on EVERY published row.
              imageUrl: imageUrl || undefined,
              latitude: gpsLat,
              longitude: gpsLng,
            })),
            defaults: {
              currency,
              category,
              postType,
              country: loc.country,
              city: loc.city,
              // The checkbox IS the choice: ticked = first-party stock with
              // the Shop owner badge, unticked = ordinary shared prices.
              ownsShop,
              shopOwnerName: ownsShop ? shopOwnerName.trim() : '',
              // A multi-row list must not flood the stories strip - bulk
              // stories stay OFF (the bulk poster's own rule since v173).
              alsoStory: false,
            },
          }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.failed?.[0]?.error || data?.error || 'Could not post the price list')
        const count = Number(data.count || 0)
        const failedCount = Number(data.failedCount || 0)
        toast({
          title: `${count} price${count !== 1 ? 's' : ''} posted`,
          description: failedCount
            ? `${failedCount} row${failedCount !== 1 ? 's' : ''} could not be posted - they are still in the list above if you reopen this form; the rest are live on the feed.`
            : `The whole list is live on the feed${ownsShop ? ' with the Shop owner badge' : ''}.`,
        })
        reset()
        onOpenChange(false)
        onCreated()
      } catch (e) {
        toast({
          title: 'Posting failed',
          description: (e as Error).message,
          variant: 'destructive',
        })
      } finally {
        setSaving(false)
      }
      return
    }

    setSaving(true)
    try {
      const res = await authFetch('/api/local-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postType,
          productName,
          description,
          country: loc.country,
          city: loc.city,
          neighborhood,
          market,
          latitude: gpsLat,
          longitude: gpsLng,
          currency,
          priceMin: numMin,
          priceMax: numMax,
          localTip,
          contactPhone,
          contactEmail,
          contactWhatsApp,
          ownsShop,
          // v189: the shop name rides along (same column the bulk poster
          // fills) so a single first-party post shows WHO sells it.
          shopOwnerName: ownsShop ? shopOwnerName.trim() : '',
          alsoStory,
          quantity,
          unit,
          category,
          imageUrl,
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to save')
      }
      const data = await res.json().catch(() => ({ story: null }))
      if (data?.story) {
        // Tell the stories strip on the feed to refetch - the new banner
        // appears without a reload.
        try { window.dispatchEvent(new Event('circub:stories-changed')) } catch {}
      }
      toast({
        title: 'Price published - and listed!',
        description: data?.story
          ? `${productName} is live as a price guide, a 24h story banner AND a product on your profile.`
          : `${productName} is live as a price guide and a product on your profile.`,
      })
      reset()
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast({
        title: 'Save failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    reset()
    onOpenChange(false)
  }

  // ---- v247 conversation pieces (presentation only) ----
  const minFilled = priceMin.trim() !== ''
  const maxFilled = priceMax.trim() !== ''
  const priceSummary = minFilled && maxFilled && priceMin !== priceMax
    ? `${priceMin} - ${priceMax} ${currency}`
    : `${(minFilled ? priceMin : maxFilled) || ''} ${currency}`.trim()

  const nextBtnBase = 'inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v178: the unvarianted max-w-3xl was silently beaten by the dialog
          base's sm:max-w-lg (512px) in the cascade - the same squeeze the
          bulk modal had before v177. sm:max-w-3xl wins the same variant key,
          and below lg (1024px) the composer takes the FULL SCREEN with the
          exact recipe the bulk modal shipped (all !important so the base
          positioning can never cover the app's nav bars). */}
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 md:p-8 gap-0 bg-[#f6f8f7] dark:bg-background max-lg:top-0! max-lg:bottom-0! max-lg:left-0! max-lg:right-0! max-lg:translate-x-0! max-lg:translate-y-0! max-lg:w-full! max-lg:max-w-none! max-lg:h-dvh! max-lg:max-h-none! max-lg:rounded-none! max-lg:border-0!">
        <DialogHeader className="mb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCancel}
              aria-label="Back"
              data-testid="composer-back"
              className="w-8 h-8 shrink-0 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-foreground">
              Quick Price Drop
              <span title="A first-hand drop takes about 30 seconds" className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                <Zap className="w-3 h-3" />
                30s
              </span>
            </DialogTitle>
            <span title="First-hand prices earn Karma" data-testid="karma-chip" className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 text-xs font-bold">
              <Zap className="w-3.5 h-3.5" />
              +15 Karma
            </span>
            {/* v256: one price at a time OR the whole list - the bulk poster
                (text, sheet rows, file, or a fetched Telegram/Sheet/web link)
                opens on top, reviews every parsed row before posting. */}
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              data-testid="composer-bulk-post"
              title="Post a whole price list at once - paste text, a sheet, a file or a link, review, then publish"
              className="ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 cursor-pointer"
            >
              <Sheet className="w-3.5 h-3.5" />
              Bulk post
            </button>
            {/* v258: POST WITH RECEIPT - snap the slip, every line item, the
                merchant, the date and the currency are read from the photo;
                the rows land in the review list, posting waits for the user. */}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
              ref={receiptRef}
              data-testid="receipt-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) handleReceiptPick(f)
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => receiptRef.current?.click()}
              disabled={receiptBusy}
              data-testid="composer-receipt"
              title="Post with a receipt - the AI reads every line item, the merchant, the date and the currency from the photo; you review, then post"
              className="ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20 cursor-pointer disabled:opacity-60"
            >
              {receiptBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ReceiptText className="w-3.5 h-3.5" />}
              {receiptBusy ? 'Reading...' : 'Receipt'}
            </button>
          </div>
          <DialogDescription className="text-sm text-muted-foreground pl-[42px]">
            {location.trim() || 'Addis Ababa, Ethiopia'} - answer a few quick questions and I&apos;ll drop the price for you. One drop publishes the price guide AND the product listing on your profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* v192 Draft restore banner - appears only when THIS device holds
              a saved draft; nothing auto-fills until Restore is tapped. */}
          {draftAvailable && (
            <div data-testid="composer-draft-restore" className="flex items-center gap-2 flex-wrap rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs">
              <span className="font-semibold text-foreground flex-1 min-w-[140px] truncate">
                Draft saved on this device{draftTs ? ` - ${draftTs}` : ''}
              </span>
              <Button type="button" size="sm" className="h-7" data-testid="composer-draft-restore-yes" onClick={restoreDraft}>Restore</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7" data-testid="composer-draft-restore-no" onClick={discardDraft}>Dismiss</Button>
            </div>
          )}

          {/* ============ v247 AI PROFORMA ============ */}
          {/* ONLY the AI: the composer is one conversation. Each answered
              question stays in the transcript (tap Edit to change it), the
              current question is the open bubble, and the last step is the
              review card with the publish button. Every answer lands in the
              SAME state handleSave has always posted - nothing about the
              data moved. */}
          <div className="space-y-3" data-testid="ai-proforma">
            {/* Assistant greeting */}
            <div className="flex items-start gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </span>
              <p className="text-sm text-foreground flex-1 pt-1.5">
                Hi! I&apos;ll ask <span className="font-bold">three quick things</span> and publish the price for you.
              </p>
            </div>

            {/* ---- Q1 WHERE ---- */}
            {askStep === 1 ? (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5" data-testid="ai-ask-where">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">Where did you buy or find it?</p>
                    <p className="text-[11px] text-muted-foreground">Type it as City, Country - e.g. Addis Ababa, Ethiopia.</p>
                  </div>
                </div>
                <Input
                  data-testid="composer-location-input"
                  placeholder="e.g. Addis Ababa, Ethiopia"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && location.trim()) { e.preventDefault(); setAskStep(2) } }}
                  className="h-11 rounded-xl border-emerald-200 bg-emerald-50/60 text-sm font-semibold"
                />
                <button
                  type="button"
                  data-testid="ai-where-next"
                  disabled={!location.trim()}
                  onClick={() => setAskStep(2)}
                  className={nextBtnBase}
                >
                  Next: what did you get? →
                </button>
              </div>
            ) : askStep !== 1 ? (
              <div className="flex items-center gap-2.5 pl-10" data-testid="ai-answer-where">
                <span className="min-w-0 flex-1 rounded-xl bg-card border border-border px-3 py-2 text-sm">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Where</span>
                  {/* v258: a receipt read can land the user on the review
                      card WITHOUT a location - the slip never says which
                      market it is from. Show the empty answer with its Edit
                      instead of nothing, or there is no way back to Q1. */}
                  <span className={`block truncate font-semibold ${location.trim() ? 'text-foreground' : 'text-muted-foreground'}`}>{location.trim() || 'Not set yet - tap Edit'}</span>
                </span>
                <button type="button" onClick={() => setAskStep(1)} className="shrink-0 text-xs font-semibold text-primary hover:underline cursor-pointer">Edit</button>
              </div>
            ) : null}

            {/* ---- Q2 WHAT (item + category only) ---- */}
            {askStep === 2 ? (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5" data-testid="ai-ask-what">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 shrink-0 text-sm" aria-hidden>🛍️</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">What did you buy or find?</p>
                    <p className="text-[11px] text-muted-foreground">Name the item, then tap its category - that&apos;s the whole list.</p>
                  </div>
                </div>
                <Input
                  data-testid="composer-item-input"
                  placeholder={postType === 'PRODUCT' ? 'e.g. Traditional Clay Coffee Set (Jebena)' : 'e.g. Airport taxi ride'}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="h-11 rounded-xl bg-card text-base font-semibold"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPostType('PRODUCT')}
                    className={`rounded-full px-3 h-7 text-xs font-bold transition-colors cursor-pointer ${
                      postType === 'PRODUCT' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostType('SERVICE')}
                    className={`rounded-full px-3 h-7 text-xs font-bold transition-colors cursor-pointer ${
                      postType === 'SERVICE' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Service
                  </button>
                </div>
                {/* CATEGORY ONLY (v247): the flat canonical list, one wrap of
                    chips - no quick-search row, no icon tiles, no subgroups. */}
                <CategorySelect value={category} onChange={setCategory} />
                <button
                  type="button"
                  data-testid="ai-what-next"
                  disabled={!productName.trim()}
                  onClick={() => setAskStep(3)}
                  className={nextBtnBase}
                >
                  Next: how much? →
                </button>
              </div>
            ) : productName.trim() ? (
              <div className="flex items-center gap-2.5 pl-10" data-testid="ai-answer-what">
                <span className="min-w-0 flex-1 rounded-xl bg-card border border-border px-3 py-2 text-sm">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">What · {category}</span>
                  <span className="block truncate font-semibold text-foreground">{productName.trim()}</span>
                </span>
                <button type="button" onClick={() => setAskStep(2)} className="shrink-0 text-xs font-semibold text-primary hover:underline cursor-pointer">Edit</button>
              </div>
            ) : null}

            {/* ---- Q3 PRICE (with the unit while entering) ---- */}
            {askStep === 3 ? (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5 space-y-2.5" data-testid="ai-ask-price">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-sm shrink-0" aria-hidden>💰</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">How much did you pay?</p>
                    <p className="text-[11px] text-muted-foreground">The unit sits right beside the number as you type.</p>
                  </div>
                </div>
                <div className="rounded-xl bg-card border border-border px-3.5 py-3" data-testid="paid-price-card">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Paid price *</span>
                    <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5" data-testid="currency-segmented">
                      {['ETB', 'USD'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          className={`px-2.5 h-6 rounded-full text-[11px] font-bold transition-all ${
                            currency === c ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowAllCur((v) => !v)}
                        data-testid="currency-more"
                        title="More currencies"
                        className={`px-2 h-6 rounded-full text-[11px] font-bold transition-all ${
                          showAllCur || !['ETB', 'USD'].includes(currency) ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        ⋯
                      </button>
                    </div>
                  </div>
                  {/* THE UNIT while entering price (v247): the currency sits
                      beside the number, live - switch it with the toggle. */}
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="1500"
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                      min="0"
                      data-testid="composer-price-input"
                      className="h-11 border-0 bg-transparent px-0 text-3xl font-extrabold shadow-none focus-visible:ring-0"
                    />
                    <span data-testid="composer-price-unit" className="shrink-0 rounded-lg bg-primary/10 border border-primary/30 px-2.5 py-1.5 text-sm font-extrabold text-primary">
                      {currency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mt-1">
                    <span className="text-xs text-muted-foreground">
                      Initial asked{priceMax ? `: ~${priceMax}` : ': not set'}
                    </span>
                    {(showAsk || priceMax) ? (
                      <Input
                        type="number"
                        data-testid="composer-ask-input"
                        placeholder="2200"
                        value={priceMax}
                        onChange={(e) => setPriceMax(e.target.value)}
                        min="0"
                        className="h-8 w-28 rounded-lg text-right text-sm"
                      />
                    ) : (
                      <button type="button" onClick={() => setShowAsk(true)} data-testid="edit-ask" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">
                        + Edit ask
                      </button>
                    )}
                  </div>
                  {(showAllCur || !['ETB', 'USD'].includes(currency)) && (
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger className="w-full h-8 text-xs mt-2" data-testid="currency-full-select">
                        <SelectValue placeholder="Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[10px] text-muted-foreground/80 mt-1.5">Got one price? Fill Paid price only - the max mirrors it on publish.</p>
                </div>
                <button
                  type="button"
                  data-testid="ai-price-next"
                  disabled={!minFilled && !maxFilled}
                  onClick={() => setAskStep(4)}
                  className={nextBtnBase}
                >
                  Next: review &amp; drop →
                </button>
              </div>
            ) : (minFilled || maxFilled) ? (
              <div className="flex items-center gap-2.5 pl-10" data-testid="ai-answer-price">
                <span className="min-w-0 flex-1 rounded-xl bg-card border border-border px-3 py-2 text-sm">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price</span>
                  <span className="block truncate font-semibold text-foreground">{priceSummary}</span>
                </span>
                <button type="button" onClick={() => setAskStep(3)} className="shrink-0 text-xs font-semibold text-primary hover:underline cursor-pointer">Edit</button>
              </div>
            ) : null}

            {/* ---- REVIEW + DROP ---- */}
            {askStep === 4 && (
              <div className="rounded-2xl bg-card border border-border shadow-sm p-4 sm:p-5 space-y-4" data-testid="ai-review">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0 shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">Here&apos;s your drop - ready when you are.</p>
                    <p className="text-[11px] text-muted-foreground">Tap Edit on any answer to change it before publishing.</p>
                  </div>
                </div>

                {/* PHOTO + story - the dashed photo box from the mockup.
                    The AI reads the photo and pulls matching real prices. */}
                <div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                    ref={fileRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                    }}
                    className="hidden"
                  />
                  {imageUrl ? (
                    <div className="relative w-full h-40 rounded-xl border border-dashed border-border overflow-hidden bg-accent/30">
                      <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-7 w-7 p-0 bg-card/90 hover:bg-card" onClick={() => { setImageUrl(''); setCompareResult(null) }} aria-label="Remove image">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading || comparing}
                      title="PNG, JPEG, WebP, GIF - max 5 MB"
                      data-testid="photo-drop"
                      className="w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-4 flex items-center justify-center gap-2 text-center hover:border-emerald-400 transition-colors disabled:opacity-60"
                    >
                      <span className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <Camera className="w-4 h-4 text-emerald-600" />
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {uploading ? 'Uploading...' : comparing ? 'Analyzing…' : 'Add a photo (optional)'}
                      </span>
                    </button>
                  )}
                </div>

                {/* AI identification + similar-posts comparison from the
                    attached photo - price the product against the feed
                    BEFORE publishing. */}
                {(comparing || compareResult) && <ComparePreview result={compareResult} identifying={comparing} />}

                {/* Share as story - ON by default. */}
                <label
                  data-testid="also-story-row"
                  className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={alsoStory}
                    onChange={(e) => setAlsoStory(e.target.checked)}
                    className="mt-0.5 accent-emerald-600 w-4 h-4"
                    data-testid="also-story-checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">Also share as a 24h story banner</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">Your price appears in the stories strip at the top of the feed for 24 hours.</span>
                  </span>
                </label>

                {/* Optional details - the power features live in ONE
                    collapsible so the conversation stays the whole surface:
                    description, the pasted price list, pack size + unit,
                    the tip note, shop owner and contacts. */}
                <div className="rounded-xl bg-accent/30 border border-border" data-testid="optional-details">
                  <button
                    type="button"
                    data-testid="optional-details-toggle"
                    aria-expanded={detailsOpen}
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-foreground"
                  >
                    Optional details (description, price list, contacts)
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {detailsOpen && (
                    <div className="px-4 pb-4 space-y-5">
                      {/* Description */}
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground font-medium">Description (optional)</label>
                        <Textarea
                          placeholder="Brief description of the product or service..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="min-h-[60px] resize-y"
                        />
                      </div>

                      {/* TIP / STALL NOTE - the yellow sticky note. */}
                      <div className="space-y-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                          <Lightbulb className="w-3.5 h-3.5" />
                          Tip / Stall note
                        </label>
                        <Textarea
                          placeholder="Walk to Military Tera pottery section for best clay sets."
                          value={localTip}
                          onChange={(e) => setLocalTip(e.target.value)}
                          className="min-h-[56px] resize-y rounded-xl bg-amber-50 border-amber-200 placeholder:text-amber-700/50"
                        />
                      </div>

                      {/* v189: Price list text - paste a whole price list,
                          tap Parse, several products publish as several
                          separate price posts. */}
                      <div className="space-y-3 p-4 rounded-xl bg-card border border-border" data-testid="price-list-section">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <FileText className="w-4 h-4 text-primary" />
                          Price list text
                          <span className="text-xs font-normal text-muted-foreground">(optional - paste a whole price list like on the bulk post)</span>
                        </div>
                        <Textarea
                          data-testid="price-list-input"
                          placeholder={`Any format works - bullet lists, dotted prices, phone lines, a company header. For example:\n\n${PRICE_LIST_EXAMPLE}`}
                          value={priceListText}
                          onChange={(e) => setPriceListText(e.target.value)}
                          className="font-mono text-xs min-h-[150px] bg-card"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            type="button"
                            onClick={parsePriceList}
                            disabled={parsingList}
                            className="h-8 gap-1.5"
                            data-testid="price-list-parse"
                          >
                            {parsingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {parsingList ? 'Parsing...' : 'Parse price list'}
                          </Button>
                          {listHint && (
                            <p className="text-xs text-muted-foreground flex-1 min-w-[200px]" data-testid="price-list-hint">
                              {listHint}
                            </p>
                          )}
                        </div>
                        {listRows.length > 0 && (
                          <div className="space-y-1.5" data-testid="price-list-rows">
                            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border scrollbar-thin">
                              {listRows.map((r, i) => (
                                <div key={`${i}-${r.productName}`} className="flex items-center gap-2 px-2.5 py-1.5 text-xs" data-testid={`price-list-row-${i}`}>
                                  <span className="w-5 shrink-0 text-[10px] text-muted-foreground font-mono">{i + 1}.</span>
                                  <span className="flex-1 min-w-0 truncate text-foreground font-medium">
                                    {r.productName || <span className="text-muted-foreground font-normal">(no product name)</span>}
                                  </span>
                                  <span className="shrink-0 font-mono text-muted-foreground">{r.price}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeListRow(i)}
                                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Remove this row"
                                    aria-label={`Remove ${r.productName || 'row ' + (i + 1)}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => { setListRows([]); setListHint(null) }}
                              className="text-[11px] text-muted-foreground underline hover:text-foreground inline-flex items-center gap-1"
                              data-testid="price-list-clear"
                            >
                              <ListX className="w-3 h-3" />
                              Clear the parsed list - post a single price instead
                            </button>
                          </div>
                        )}
                      </div>

                      {/* v124: pack size + measuring unit (products only). */}
                      {postType === 'PRODUCT' && (
                        <div className="grid grid-cols-2 gap-3" data-testid="marketplace-details">
                          <div className="space-y-1.5">
                            <label className="text-xs text-muted-foreground font-medium">Pack size (quantity)</label>
                            <Input
                              type="number"
                              placeholder="e.g. 2"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              min="0"
                              data-testid="composer-quantity-input"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs text-muted-foreground font-medium">Measuring unit</label>
                            <Select value={unit || 'each'} onValueChange={(v) => setUnit(v === 'each' ? '' : v)}>
                              <SelectTrigger className="w-full" data-testid="composer-unit-select">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {MEASURE_UNITS.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground/80">
                              What the price refers to - e.g. 50 with &ldquo;per kg&rdquo; shows as 50 / kg.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* WHO ARE YOU? - Scout vs Shop Owner (real checkbox
                          since v189). */}
                      <div className="space-y-2" data-testid="owns-shop-section">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <label className="text-xs font-bold uppercase tracking-wide text-foreground">Who are you?</label>
                          <div className="flex items-center gap-1 rounded-full bg-muted p-1" data-testid="owns-shop-row">
                            <button
                              type="button"
                              onClick={() => setOwnsShop(false)}
                              data-testid="owns-scout-chip"
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-bold transition-all cursor-pointer ${
                                !ownsShop ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <span aria-hidden="true">🎒</span> Scout
                            </button>
                            <label
                              data-testid="owns-owner-chip"
                              className={`relative inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-bold cursor-pointer select-none transition-all ${
                                ownsShop ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <span aria-hidden="true">🏪</span> Shop Owner
                              <input
                                type="checkbox"
                                data-testid="owns-shop-checkbox"
                                checked={ownsShop}
                                onChange={(e) => setOwnsShop(e.target.checked)}
                                className="absolute opacity-0 w-4 h-4"
                                tabIndex={-1}
                                aria-label="I own this shop"
                              />
                            </label>
                          </div>
                        </div>
                        {ownsShop && (
                          <div className="space-y-1.5" data-testid="shop-owner-name-block">
                            <label className="text-xs text-muted-foreground font-medium">Shop name (shown on the posts)</label>
                            <Input
                              data-testid="shop-owner-name-input"
                              placeholder="e.g. Hilina Tech Trading PLC - auto-filled from the list header"
                              value={shopOwnerName}
                              onChange={(e) => setShopOwnerName(e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      {/* Contact info */}
                      <div className="space-y-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                        <p className="text-xs font-semibold text-foreground">Contact info (optional)</p>
                        <p className="text-[11px] text-muted-foreground">Travelers can reach you directly from this post.</p>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Phone number</label>
                            <Input placeholder="+251 911 234 567" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Email</label>
                            <Input type="email" placeholder="you@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">WhatsApp number or link</label>
                            <Input placeholder="+251 911 234 567 or wa.me/..." value={contactWhatsApp} onChange={(e) => setContactWhatsApp(e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Draft saves the half-filled conversation on this device;
            the green rocket button publishes. Pinned to the bottom of the
            sheet while scrolling; the Drop button takes the full row on
            phones. */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 md:-mx-8 mt-6 flex items-center gap-3 pt-4 px-4 sm:px-6 md:px-8 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 md:pb-8 bg-background/95 backdrop-blur-sm border-t border-border">
          <Button
            variant="outline"
            onClick={saveDraft}
            disabled={saving || uploading}
            data-testid="composer-draft-save"
            title="Save this drop on this device and finish it later"
            className="px-5 rounded-full font-bold"
          >
            Draft
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading}
            data-testid="composer-publish"
            className="flex-1 px-6 h-11 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold gap-2"
          >
            <Rocket className="w-4 h-4" />
            {saving ? 'Dropping...' : 'Drop Price Now'}
          </Button>
        </div>
      </DialogContent>
      {/* v256: the full bulk poster stacked on top of the composer - publish
          a whole list from any source; the feed refreshes via onCreated. */}
      <BulkPostModal open={bulkOpen} onOpenChange={setBulkOpen} onCreated={onCreated} />
    </Dialog>
  )
}
