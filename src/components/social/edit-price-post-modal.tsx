'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, X, Upload, MapPin, Lightbulb, Tag, DollarSign, Camera, Sparkles, Save, Loader2, Store } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/auth-fetch'
import { CATEGORIES } from '@/lib/categories'
import { MEASURE_UNITS, QUANTITY_OPTIONS } from '@/lib/product-units'
import { compressImage } from '@/lib/image-compress'
import type { LocalPricePost } from '@/lib/types'
import { GpsCapture } from './gps-capture'

interface EditPricePostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: LocalPricePost | null
  onSaved: () => void
}

const CURRENCIES = ['USD', 'ETB', 'EUR', 'KES', 'UGX', 'MYR', 'INR', 'CNY', 'JPY', 'GBP', 'AUD', 'NGN', 'TZS', 'RWF', 'GHS']
// CATEGORIES comes from @/lib/categories - the full flat alphabetical list.

export function EditPricePostModal({ open, onOpenChange, post, onSaved }: EditPricePostModalProps) {
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [market, setMarket] = useState('')
  const [gpsLat, setGpsLat] = useState<number | null>(null)
  const [gpsLng, setGpsLng] = useState<number | null>(null)
  const [currency, setCurrency] = useState('USD')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [recommendedPrice, setRecommendedPrice] = useState('')
  const [localTip, setLocalTip] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactWhatsApp, setContactWhatsApp] = useState('')
  // Shop ownership declaration - prefilled from the existing post, editable.
  const [ownsShop, setOwnsShop] = useState(false)
  // v122: marketplace details (synced to the auto-created product twin).
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('Other')
  const [imageUrl, setImageUrl] = useState('')
  const [imageRemoved, setImageRemoved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open && post) {
      setProductName(post.productName || '')
      setDescription(post.description || '')
      setCountry(post.country || '')
      setCity(post.city || '')
      setNeighborhood(post.neighborhood || '')
      setMarket(post.market || '')
      setGpsLat(post.latitude ?? null)
      setGpsLng(post.longitude ?? null)
      setCurrency(post.currency || 'USD')
      setPriceMin(String(post.priceMin || ''))
      setPriceMax(String(post.priceMax || ''))
      setRecommendedPrice(post.recommendedPrice ? String(post.recommendedPrice) : '')
      setLocalTip(post.localTip || '')
      setContactPhone(post.contactPhone || '')
      setContactEmail(post.contactEmail || '')
      setContactWhatsApp(post.contactWhatsApp || '')
      setOwnsShop(post.ownsShop === true)
      setQuantity(post.quantity || '')
      setUnit(post.unit || '')
      setCategory(post.category || 'Other')
      setImageUrl(post.imageUrl || '')
      setImageRemoved(false)
    }
  }, [open, post])

  const handleImageUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      const compressed = await compressImage(file, 1280, 0.8)
      const fd = new FormData(); fd.append('file', compressed)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed') }
      const data = await res.json()
      setImageUrl(data.url)
      setImageRemoved(false)
      toast({ title: 'Image updated' })
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setUploading(false) }
  }

  const handleSave = async () => {
    if (!post) return
    if (!productName.trim() || !country.trim() || !priceMin || !priceMax) {
      toast({ title: 'Missing required fields', description: 'Name, country, min price, and max price are required.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(`/api/local-prices/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: productName.trim(),
          description: description.trim() || null,
          country: country.trim(),
          city: city.trim() || null,
          neighborhood: neighborhood.trim() || null,
          market: market.trim() || null,
          latitude: gpsLat,
          longitude: gpsLng,
          currency: currency.trim(),
          priceMin: Number(priceMin),
          priceMax: Number(priceMax),
          recommendedPrice: recommendedPrice ? Number(recommendedPrice) : null,
          localTip: localTip.trim() || null,
          contactPhone: contactPhone.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactWhatsApp: contactWhatsApp.trim() || null,
          ownsShop,
          quantity,
          unit,
          category: category,
          imageUrl: imageRemoved ? null : (imageUrl || null),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed to save') }
      toast({ title: 'Post updated', description: 'Your changes have been saved.' })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            Edit price post
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Update your local price guide. Changes are saved immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product name */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />Product name *
            </label>
            <Input placeholder="e.g. Ethiopian coffee set" value={productName} onChange={(e) => setProductName(e.target.value)} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Description</label>
            <Textarea placeholder="Brief description..." value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[50px] resize-y" />
          </div>

          {/* Location */}
          <div className="space-y-3 p-3 rounded-xl bg-accent/30 border border-border">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />Location</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Country *</label><Input placeholder="Ethiopia" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">City</label><Input placeholder="Addis Ababa" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Neighborhood</label><Input placeholder="Mercato" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Market</label><Input placeholder="Mercato Market" value={market} onChange={(e) => setMarket(e.target.value)} /></div>
            </div>
            <GpsCapture
              lat={gpsLat}
              lng={gpsLng}
              onChange={(lat, lng) => { setGpsLat(lat); setGpsLng(lng) }}
            />
          </div>

          {/* Shop ownership - poster declares whether this is their own
              shop/business (drives the "Shop owner" badge on the card). */}
          <div className="space-y-2 p-3 rounded-xl bg-amber-50 border border-amber-200" data-testid="owns-shop-section">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-amber-600" />Do you own this shop or business?</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="owns-shop-yes"
                aria-pressed={ownsShop}
                onClick={() => setOwnsShop(true)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                  ownsShop ? 'bg-amber-600 text-white border-amber-600' : 'bg-card text-muted-foreground border-border hover:bg-accent'
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
                  !ownsShop ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:bg-accent'
                }`}
              >
                No, just sharing a price
              </button>
            </div>
          </div>

          {/* Prices */}
          <div className="space-y-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-primary" />Price</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Min price *</label><Input type="number" placeholder="1500" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Max price *</label><Input type="number" placeholder="2200" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Fair price</label><Input type="number" placeholder="1800" value={recommendedPrice} onChange={(e) => setRecommendedPrice(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* v122: pack size + measuring unit - synced to the product twin. */}
            <div className="grid grid-cols-2 gap-2" data-testid="edit-marketplace-details">
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Pack size (quantity)</label>
                <Select value={quantity || 'none'} onValueChange={(v) => setQuantity(v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full" data-testid="edit-quantity-select"><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {QUANTITY_OPTIONS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Measuring unit</label>
                <Select value={unit || 'each'} onValueChange={(v) => setUnit(v === 'each' ? '' : v)}>
                  <SelectTrigger className="w-full" data-testid="edit-unit-select"><SelectValue placeholder="Unit" /></SelectTrigger>
                  <SelectContent>{MEASURE_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Local tip */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-amber-500" />Local tip</label>
            <Textarea placeholder="Tell travelers anything they should know..." value={localTip} onChange={(e) => setLocalTip(e.target.value)} className="min-h-[60px] resize-y" />
          </div>

          {/* Contact info */}
          <div className="space-y-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-xs font-semibold text-foreground">Contact info (optional)</p>
            <div className="space-y-2">
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Phone number</label><Input placeholder="+251 911 234 567" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Email</label><Input type="email" placeholder="you@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">WhatsApp number or link</label><Input placeholder="+251 911 234 567 or wa.me/..." value={contactWhatsApp} onChange={(e) => setContactWhatsApp(e.target.value)} /></div>
            </div>
          </div>

          {/* Image management */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />Product photo</label>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" ref={fileRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); if (fileRef.current) fileRef.current.value = '' }} className="hidden" />
            {(imageUrl || (!imageRemoved && post?.imageUrl)) ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img src={imageUrl || post?.imageUrl} alt="Preview" className="w-full max-h-48 object-cover" />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2 bg-card/90 hover:bg-card" onClick={() => fileRef.current?.click()} disabled={uploading} title="Replace image">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 bg-card/90 hover:bg-card" onClick={() => { setImageUrl(''); setImageRemoved(true) }} title="Remove image">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full rounded-lg border-2 border-dashed border-border bg-accent/20 px-4 py-5 flex flex-col items-center hover:border-primary hover:bg-accent/40 transition-colors">
                {uploading ? <Loader2 className="w-5 h-5 text-primary mb-1 animate-spin" /> : <Upload className="w-5 h-5 text-primary mb-1" />}
                <span className="text-sm font-medium text-foreground">{uploading ? 'Uploading...' : 'Add photo'}</span>
                <span className="text-xs text-muted-foreground">or drag and drop</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-1.5">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save changes</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
