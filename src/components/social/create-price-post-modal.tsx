'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Upload, MapPin, Lightbulb, Camera, Sparkles, FileText, Loader2, ListX, Rocket, ChevronDown, ChevronLeft, Zap } from 'lucide-react'
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
import { GpsCapture } from './gps-capture'

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
}

interface CreatePricePostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  prefill?: CreatePricePostPrefill | null
}

const CURRENCIES = ['USD', 'ETB', 'KES', 'UGX', 'MYR', 'EUR', 'INR', 'CNY', 'JPY', 'GBP', 'AUD', 'NGN', 'TZS', 'RWF', 'GHS', 'HKD', 'AED', 'ZAR', 'CAD', 'SGD', 'THB', 'EGP', 'MAD']

// v192 "Quick Price Drop" redesign: four one-tap category chips straight
// from the user's mockup. Each chip maps to the REAL canonical category it
// stores (the feed, filters and compare strips keep working unchanged) -
// the chips are just a faster front door. 'More' reveals the full 31-category
// picker; the picker also auto-reveals whenever the current category is not
// one of the four chips (fresh open = 'Other', camera-search prefill, etc).
const QUICK_CHIPS: { slug: string; emoji: string; label: string; category: string }[] = [
  { slug: 'coffee-set', emoji: '☕', label: 'Coffee Set', category: 'Coffee & Cafés' },
  { slug: 'habesha-dress', emoji: '👗', label: 'Habesha Dress', category: 'Clothing & Apparel' },
  { slug: 'airport-ride', emoji: '🚕', label: 'Airport Ride', category: 'Transportation' },
  { slug: 'meal', emoji: '🍲', label: 'Meal', category: 'Restaurants' },
]
const CHIP_CATEGORIES = QUICK_CHIPS.map((c) => c.category)

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
  // city/country columns on save; the GPS button fills it automatically.
  const [location, setLocation] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [market, setMarket] = useState('')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  // v192: the composer is an Ethiopian-market flow first - the mockup's
  // segmented toggle starts on ETB. The full 23-currency list stays one tap
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
  // comes first-hand from the business itself. v189: the choice is a real
  // CHECKBOX ("check point") - ticked = own shop, unticked = just sharing.
  const [ownsShop, setOwnsShop] = useState(false)
  // v189: the shop name shown on the posts beside the badge (same column the
  // bulk poster fills). Revealed when the ownership box is ticked; the parsed
  // list's company header prefills it.
  const [shopOwnerName, setShopOwnerName] = useState('')
  // v189: "Price list text" - paste a whole price list (WhatsApp style) and
  // the SAME parser the bulk post uses pulls out every product + price line.
  // One parsed row just fills the form; several parsed rows publish as
  // several separate price posts (through the bulk endpoint) on Publish.
  const [priceListText, setPriceListText] = useState('')
  const [parsingList, setParsingList] = useState(false)
  const [listRows, setListRows] = useState<ParsedListRow[]>([])
  const [listHint, setListHint] = useState<string | null>(null)
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
  const [compareResult, setCompareResult] = useState<IdentifyCompareResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // v192 Quick Price Drop UI state. Everything below is presentation only -
  // none of it changes what gets posted.
  const [showAsk, setShowAsk] = useState(false) // "+ Edit ask" reveals the initial-asking-price input
  const [showAllCats, setShowAllCats] = useState(false) // 'More' reveals the full category picker
  const [showAllCur, setShowAllCur] = useState(false) // '⋯' reveals the full currency list
  const [detailsOpen, setDetailsOpen] = useState(false) // the "Optional details" collapsible
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
    // v192 Quick Price Drop presentation state - every reopen starts clean,
    // exactly like the mockup (details collapsed, ask hidden).
    setShowAsk(false)
    setShowAllCats(false)
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
    // posts - the form shows the comparison while the user finishes typing.
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
      // normal single post (photo, GPS pin and the story banner still apply).
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
            ? `. Publishing posts all ${mapped.length} as separate price posts - the location, category, currency, contacts and shop choice below apply to every row.`
            : '. The first row filled the form below - publish it as a normal single price.')
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

  const handleSave = async () => {
    // Guest users can't post prices - prompt them to register
    if (typeof window !== 'undefined') {
      // Check if the user is a guest by checking localStorage (set by page.tsx)
      // Actually we can just try the API call - authFetch will handle the 401
      // and dispatch the auth-expired event which shows the register modal.
      // But for a better UX, let's check first.
    }
    // v189: with TWO or more parsed price-list rows the composer publishes
    // the whole list through the bulk endpoint - one price post per row,
    // every row carrying the form's location, category, currency, contacts
    // and the shop-owner choice. Photo, GPS pin, local tip and the story
    // banner stay single-post features (the pin DOES ride every row).
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
        description: 'Type the location as "City, Country" - e.g. Addis Ababa, Ethiopia - or tap the GPS button to fill it automatically.',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v178: the unvarianted max-w-3xl was silently beaten by the dialog
          base's sm:max-w-lg (512px) in the cascade - the same squeeze the
          bulk modal had before v177. sm:max-w-3xl wins the same variant key,
          and below lg (1024px) the composer takes the FULL SCREEN with the
          exact recipe the bulk modal shipped (all !important so the base
          positioning can never win). */}
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
          </div>
          <DialogDescription className="text-sm text-muted-foreground pl-[42px]">
            {location.trim() || 'Addis Ababa, Ethiopia'} - share what something really costs. One drop publishes the price guide AND the product listing on your profile.
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

          {/* v192 "Quick Price Drop" - the main card carries the FIVE things
              a drop needs, in the mockup's order: where, what, how much,
              the tip, who. Everything else lives in Optional details. */}
          <div className="rounded-2xl bg-card border border-border shadow-sm p-4 sm:p-5 space-y-4" data-testid="quick-price-card">
            {/* Location - ONE input ("City, Country"); the GPS button below
                fills it from the pin, most posters never type it. */}
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
              <MapPin className="w-4 h-4 shrink-0 text-emerald-600" />
              <Input
                data-testid="composer-location-input"
                placeholder="e.g. Addis Ababa, Ethiopia"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-sm font-semibold"
              />
              {gpsLat != null && (
                <span data-testid="gps-badge" className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">GPS</span>
              )}
            </div>
            <GpsCapture
              lat={gpsLat}
              lng={gpsLng}
              onChange={(lat, lng) => { setGpsLat(lat); setGpsLng(lng) }}
              onPlaceResolved={(place) => setLocation(joinLocationParts(place.city, place.country))}
            />

            {/* WHAT DID YOU BUY / FIND? + the four quick chips from the
                mockup. A chip stores its REAL canonical category; 'More'
                (or any non-chip category, like the fresh-open 'Other')
                reveals the full 31-category picker. */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-foreground">
                What did you buy / find?{postType === 'SERVICE' ? ' (service)' : ''}
              </label>
              <Input
                placeholder={postType === 'PRODUCT' ? 'e.g. Traditional Clay Coffee Set (Jebena)' : 'e.g. Airport taxi ride'}
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="h-11 rounded-xl text-base font-semibold"
              />
              <div className="flex items-center gap-2 flex-wrap" data-testid="quick-category-chips">
                {QUICK_CHIPS.map((chip) => {
                  const active = category === chip.category
                  return (
                    <button
                      key={chip.slug}
                      type="button"
                      onClick={() => setCategory(chip.category)}
                      data-testid={`quick-chip-${chip.slug}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                          : 'bg-muted/60 border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                    >
                      <span aria-hidden="true">{chip.emoji}</span>
                      {chip.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setShowAllCats((v) => !v)}
                  data-testid="quick-chip-more"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 h-8 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${(showAllCats || !CHIP_CATEGORIES.includes(category)) ? 'rotate-180' : ''}`} />
                  More
                </button>
              </div>
              {(showAllCats || !CHIP_CATEGORIES.includes(category)) && (
                <CategorySelect value={category} onChange={setCategory} />
              )}
            </div>

            {/* PAID PRICE + photo - the mockup's price card and dashed photo
                box, side by side on wide screens. ETB/USD segmented with the
                full 23-currency list one tap away; the big number is the min
                price, "+ Edit ask" reveals the initial-asking box (the max). */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-3">
              <div className="rounded-xl border border-border bg-background p-3.5 space-y-2" data-testid="paid-price-card">
                <div className="flex items-center justify-between gap-2">
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
                <Input
                  type="number"
                  placeholder="1500"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  min="0"
                  className="h-11 border-0 bg-transparent px-0 text-3xl font-extrabold shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
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
                    <button type="button" onClick={() => setShowAsk(true)} data-testid="edit-ask" className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
                      + Edit ask
                    </button>
                  )}
                </div>
                {(showAllCur || !['ETB', 'USD'].includes(currency)) && (
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-full h-8 text-xs" data-testid="currency-full-select">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[10px] text-muted-foreground/80">Got one price? Fill Paid price only - the max mirrors it on publish.</p>
              </div>
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
                  <div className="relative w-full h-full min-h-[9rem] rounded-xl border border-dashed border-border overflow-hidden bg-accent/30">
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
                    className="w-full h-full min-h-[9rem] rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-4 flex flex-col items-center justify-center gap-1 text-center hover:border-emerald-400 transition-colors disabled:opacity-60"
                  >
                    <span className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-emerald-600" />
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {uploading ? 'Uploading...' : comparing ? 'Analyzing…' : 'Photo'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {comparing ? 'AI finds similar prices' : 'Optional'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* TIP / STALL NOTE - the yellow sticky note from the mockup. */}
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

            {/* WHO ARE YOU? - Scout (sharing a found price) vs Shop Owner
                (first-hand stock). The Shop Owner chip contains the REAL
                checkbox the flow has driven since v189 ("check point") - the
                state, badge and shop-name reveal are unchanged. */}
            <div className="space-y-2" data-testid="owns-shop-section">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold uppercase tracking-wide text-foreground">Who are you?</label>
                <div className="flex items-center gap-1 rounded-full bg-muted p-1" data-testid="owns-shop-row">
                  <button
                    type="button"
                    onClick={() => setOwnsShop(false)}
                    data-testid="owns-scout-chip"
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-bold transition-all ${
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
              <p className="text-[11px] text-muted-foreground">
                {ownsShop
                  ? 'These are your own first-hand prices - your posts carry the Shop owner badge on the feed.'
                  : 'Scout = sharing a price you found. Posting your own stock? Pick Shop Owner - posts carry the Shop owner badge and travelers trust them more.'}
              </p>
              {ownsShop && (
                <div className="space-y-1.5" data-testid="shop-owner-name-block">
                  <label className="text-xs text-muted-foreground font-medium">Shop name (shown on the posts)</label>
                  <Input
                    data-testid="shop-owner-name-input"
                    placeholder="e.g. Hilina Tech Trading PLC - auto-filled from the list header"
                    value={shopOwnerName}
                    onChange={(e) => setShopOwnerName(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    A parsed price list fills this from its company header - edit it before publishing if needed.
                  </p>
                </div>
              )}
            </div>

            {/* Share as story - ON by default; kept in the main flow. */}
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
                <span className="block text-[11px] text-muted-foreground mt-0.5">Your price appears in the stories strip at the top of the feed for 24 hours - like a banner shared with everyone.</span>
              </span>
            </label>
          </div>

          {/* Optional details - the mockup's collapsible card: catalog type,
              description, the pasted price list, location extras, pack size
              and contacts. Collapsed by default; the drop works without it. */}
          <div className="rounded-2xl bg-card border border-border shadow-sm" data-testid="optional-details">
            <button
              type="button"
              data-testid="optional-details-toggle"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 text-sm font-semibold text-foreground"
            >
              Optional details (catalog, contact, unit)
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
            </button>
            {detailsOpen && (
              <div className="px-4 sm:px-5 pb-5 space-y-5">
                {/* What are you posting about? */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">
                    What are you posting about?
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPostType('PRODUCT')}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                        postType === 'PRODUCT'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >
                      Product
                    </button>
                    <button
                      onClick={() => setPostType('SERVICE')}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                        postType === 'SERVICE'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >
                      Service
                    </button>
                  </div>
                </div>

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

          {/* v189: Price list text - the SAME "Price list text" the bulk post
              has. Paste a whole price list (WhatsApp style, any format), tap
              Parse, and the parser fills the form - several products publish
              as several separate price posts on Publish. */}
          <div className="space-y-3 p-4 rounded-xl bg-accent/30 border border-border" data-testid="price-list-section">
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

                {/* Location extras - neighborhood and the market/shop name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Neighborhood</label>
                    <Input
                      placeholder="e.g. Mercato"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Market / Shop</label>
                    <Input
                      placeholder="e.g. Mercato Market"
                      value={market}
                      onChange={(e) => setMarket(e.target.value)}
                    />
                  </div>
                </div>

                {/* v124: marketplace details - the measuring unit stays the one
                    dropdown, and the pack size is a number the user writes.
                    Shown for products only (services have no unit). */}
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
                      <p className="text-[11px] text-muted-foreground/80">
                        How many units the pack holds - type any number.
                      </p>
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

          {/* AI identification + similar-posts comparison from the attached
              photo - lets the user price the product against the feed
              BEFORE publishing. */}
          {(comparing || compareResult) && <ComparePreview result={compareResult} identifying={comparing} />}
        </div>

        {/* Footer - Draft saves the half-filled form on this device; the
            green rocket button publishes. Pinned to the bottom of the sheet
            while scrolling; the Drop button takes the full row on phones. */}
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
    </Dialog>
  )
}
