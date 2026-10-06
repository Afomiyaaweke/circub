'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, X, Upload, MapPin, Lightbulb, Tag, DollarSign, Camera, Sparkles, Store } from 'lucide-react'
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
import { MEASURE_UNITS } from '@/lib/product-units'
import { joinLocationParts, splitLocationInput } from '@/lib/location'
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
// CATEGORIES (full flat alphabetical list) now lives in @/lib/categories -
// the single source shared by every picker and filter.

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
  const [currency, setCurrency] = useState('USD')
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

  const reset = () => {
    setPostType('PRODUCT')
    setProductName('')
    setDescription('')
    setLocation('')
    setNeighborhood('')
    setMarket('')
    setGpsLat(null)
    setGpsLng(null)
    setCurrency('USD')
    setPriceMin('')
    setPriceMax('')
    setLocalTip('')
    setOwnsShop(false)
    setAlsoStory(true)
    setQuantity('')
    setUnit('')
    setCategory('Other')
    setImageUrl('')
    setCompareResult(null)
    setComparing(false)
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

  const handleSave = async () => {
    // Guest users can't post prices - prompt them to register
    if (typeof window !== 'undefined') {
      // Check if the user is a guest by checking localStorage (set by page.tsx)
      // Actually we can just try the API call - authFetch will handle the 401
      // and dispatch the auth-expired event which shows the register modal.
      // But for a better UX, let's check first.
    }
    if (!productName.trim() || !location.trim() || !priceMin || !priceMax || !currency) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in product name, location (City, Country), currency, and price range.',
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

    if (Number(priceMax) < Number(priceMin)) {
      toast({
        title: 'Price range invalid',
        description: 'Maximum price must be greater than or equal to minimum.',
        variant: 'destructive',
      })
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
          priceMin: Number(priceMin),
          priceMax: Number(priceMax),
          localTip,
          contactPhone,
          contactEmail,
          contactWhatsApp,
          ownsShop,
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
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 md:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            Post a Price
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Share what something really costs in your country - one post now publishes BOTH the price guide for travelers and the product listing on your profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Type selector */}
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

          {/* Product/Service name */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              {postType === 'PRODUCT' ? 'Product name' : 'Service name'} *
            </label>
            <Input
              placeholder={postType === 'PRODUCT' ? 'e.g. Ethiopian coffee set' : 'e.g. Airport taxi ride'}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
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

          {/* Location block - ONE input: city and country together in a
              single field, comma separated ("Addis Ababa, Ethiopia"). The
              GPS button reverse-geocodes the pin and fills it, so most
              posters never type their location at all. */}
          <div className="space-y-3 p-4 rounded-xl bg-accent/30 border border-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="w-4 h-4 text-primary" />
              Location
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">City, Country *</label>
              <Input
                data-testid="composer-location-input"
                placeholder="e.g. Addis Ababa, Ethiopia"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
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

            {/* GPS pin - one tap reads the device GPS, drops the pin AND
                fills the City, Country input from the coordinates */}
            <GpsCapture
              lat={gpsLat}
              lng={gpsLng}
              onChange={(lat, lng) => { setGpsLat(lat); setGpsLng(lng) }}
              onPlaceResolved={(place) => setLocation(joinLocationParts(place.city, place.country))}
            />

            <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Tip: tap the GPS button - it drops the pin AND fills City, Country automatically. Tourists find the exact shop with one tap on Directions.
            </p>
          </div>

          {/* Shop ownership - the poster declares whether this is their own
              shop/business. Owners get a "Shop owner" badge on the card so
              travelers know the price is first-hand. */}
          <div className="space-y-3 p-4 rounded-xl bg-amber-50 border border-amber-200" data-testid="owns-shop-section">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Store className="w-4 h-4 text-amber-600" />
              Do you own this shop or business?
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="owns-shop-yes"
                aria-pressed={ownsShop}
                onClick={() => setOwnsShop(true)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                  ownsShop
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-card text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                Yes, I own this shop
              </button>
              <button
                type="button"
                data-testid="owns-shop-no"
                aria-pressed={!ownsShop}
                onClick={() => setOwnsShop(false)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                  !ownsShop
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                No, just sharing a price
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {ownsShop
                ? 'Travelers will see a Shop owner badge on your post - add your contact info below so they can reach you directly.'
                : 'Shop owners get a badge on the post and travelers trust first-hand prices more.'}
            </p>
          </div>

          {/* Price block */}
          <div className="space-y-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <DollarSign className="w-4 h-4 text-primary" />
              Price information
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Typical min price *</label>
                <Input
                  type="number"
                  placeholder="1500"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Typical max price *</label>
                <Input
                  type="number"
                  placeholder="2200"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Currency *</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="USD" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* v124: marketplace details - the measuring unit stays the one
                dropdown, and the pack size is a number the user writes.
                Shown for products only (services have no unit). */}
            {postType === 'PRODUCT' && (
              <div className="grid grid-cols-2 gap-3 pt-1" data-testid="marketplace-details">
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
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full" data-testid="category-select">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Local tip */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              Local knowledge / tip
            </label>
            <Textarea
              placeholder="Tell travelers anything they should know. Example: 'Don't buy the first one you see. Similar sets are available for around ETB 1,800.'"
              value={localTip}
              onChange={(e) => setLocalTip(e.target.value)}
              className="min-h-[80px] resize-y"
            />
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

          {/* Image upload */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              Add photos
            </label>
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
              <div className="relative w-full h-32 rounded-lg border border-dashed border-border overflow-hidden bg-accent/30">
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-7 w-7 p-0 bg-card/90 hover:bg-card"
                  onClick={() => { setImageUrl(''); setCompareResult(null) }}
                  aria-label="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || comparing}
                className="w-full rounded-lg border-2 border-dashed border-border bg-accent/20 px-4 py-6 flex flex-col items-center text-center hover:border-primary hover:bg-accent/40 transition-colors disabled:opacity-60"
              >
                <Upload className="w-6 h-6 text-primary mb-1.5" />
                <span className="font-medium text-sm text-foreground">
                  {uploading ? 'Uploading...' : comparing ? 'Analyzing photo…' : 'Add product photo'}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {comparing ? 'AI identifies the product and finds similar prices' : 'or drag and drop • PNG, JPEG, WebP, GIF · max 5 MB'}
                </span>
              </button>
            )}
          </div>

          {/* AI identification + similar-posts comparison from the attached
              photo - lets the user price the product against the feed
              BEFORE publishing. */}
          {(comparing || compareResult) && <ComparePreview result={compareResult} identifying={comparing} />}

          {/* Share as story - ON by default: the new price goes out as a
              24h story banner the whole feed sees in its stories strip. */}
          <label
            data-testid="also-story-row"
            className="mt-6 flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={alsoStory}
              onChange={(e) => setAlsoStory(e.target.checked)}
              className="mt-0.5 accent-primary w-4 h-4"
              data-testid="also-story-checkbox"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-foreground">Also share as a 24h story banner</span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">Your price appears in the stories strip at the top of the feed for 24 hours - like a banner shared with everyone.</span>
            </span>
          </label>
        </div>

        {/* Footer - pinned to the bottom of the sheet while scrolling */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 md:-mx-8 mt-6 flex items-center justify-end gap-3 pt-4 px-4 sm:px-6 md:px-8 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 md:pb-8 bg-background/95 backdrop-blur-sm border-t border-border">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading}
            className="px-6 bg-primary hover:bg-primary/90 gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Publishing...' : 'Publish Price & Listing'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
