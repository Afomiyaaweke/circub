'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, X, Upload, MapPin, Lightbulb, Tag, DollarSign, Camera, Sparkles, Save, Loader2 } from 'lucide-react'
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
import type { LocalPricePost } from '@/lib/types'

interface EditPricePostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: LocalPricePost | null
  onSaved: () => void
}

const CURRENCIES = ['USD', 'ETB', 'EUR', 'KES', 'UGX', 'MYR', 'INR', 'CNY', 'JPY', 'GBP', 'AUD', 'NGN', 'TZS', 'RWF', 'GHS']
const CATEGORIES = ['Coffee', 'Food', 'Handicrafts', 'Markets', 'Textiles', 'Clothing', 'Transportation', 'Restaurants', 'Services', 'Electronics', 'Accommodation', 'Other']

export function EditPricePostModal({ open, onOpenChange, post, onSaved }: EditPricePostModalProps) {
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [market, setMarket] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [recommendedPrice, setRecommendedPrice] = useState('')
  const [touristPrice, setTouristPrice] = useState('')
  const [localTip, setLocalTip] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactWhatsApp, setContactWhatsApp] = useState('')
  const [category, setCategory] = useState('Other')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && post) {
      setProductName(post.productName || '')
      setDescription(post.description || '')
      setCountry(post.country || '')
      setCity(post.city || '')
      setNeighborhood(post.neighborhood || '')
      setMarket(post.market || '')
      setCurrency(post.currency || 'USD')
      setPriceMin(String(post.priceMin || ''))
      setPriceMax(String(post.priceMax || ''))
      setRecommendedPrice(post.recommendedPrice ? String(post.recommendedPrice) : '')
      setTouristPrice(post.touristPrice ? String(post.touristPrice) : '')
      setLocalTip(post.localTip || '')
      setContactPhone(post.contactPhone || '')
      setContactEmail(post.contactEmail || '')
      setContactWhatsApp(post.contactWhatsApp || '')
      setCategory(post.category || 'Other')
    }
  }, [open, post])

  const handleSave = async () => {
    if (!post) return
    if (!productName.trim() || !country.trim() || !priceMin || !priceMax) {
      toast({ title: 'Missing required fields', description: 'Name, country, min price, and max price are required.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/local-prices/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: productName.trim(),
          description: description.trim() || null,
          country: country.trim(),
          city: city.trim() || null,
          neighborhood: neighborhood.trim() || null,
          market: market.trim() || null,
          currency: currency.trim(),
          priceMin: Number(priceMin),
          priceMax: Number(priceMax),
          recommendedPrice: recommendedPrice ? Number(recommendedPrice) : null,
          touristPrice: touristPrice ? Number(touristPrice) : null,
          localTip: localTip.trim() || null,
          contactPhone: contactPhone.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactWhatsApp: contactWhatsApp.trim() || null,
          category: category,
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
          </div>

          {/* Prices */}
          <div className="space-y-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-primary" />Price</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Min price *</label><Input type="number" placeholder="1500" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Max price *</label><Input type="number" placeholder="2200" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Fair price</label><Input type="number" placeholder="1800" value={recommendedPrice} onChange={(e) => setRecommendedPrice(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Tourist price</label><Input type="number" placeholder="3000" value={touristPrice} onChange={(e) => setTouristPrice(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><label className="text-[10px] text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
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
