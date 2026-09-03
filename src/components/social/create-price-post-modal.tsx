'use client'

import { useState, useRef } from 'react'
import { Plus, X, Upload, MapPin, Lightbulb, Tag, DollarSign, Camera, Sparkles } from 'lucide-react'
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

interface CreatePricePostModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const CURRENCIES = ['USD', 'ETB', 'KES', 'UGX', 'MYR', 'EUR', 'INR', 'CNY', 'JPY', 'GBP', 'AUD', 'NGN', 'TZS', 'RWF', 'GHS']
const CATEGORIES = [
  'Coffee',
  'Food',
  'Handicrafts',
  'Markets',
  'Textiles',
  'Clothing',
  'Transportation',
  'Restaurants',
  'Services',
  'Electronics',
  'Accommodation',
  'Other',
]

export function CreatePricePostModal({ open, onOpenChange, onCreated }: CreatePricePostModalProps) {
  const [postType, setPostType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT')
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
  const [personalPrice, setPersonalPrice] = useState('')
  const [localTip, setLocalTip] = useState('')
  const [category, setCategory] = useState('Other')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const reset = () => {
    setPostType('PRODUCT')
    setProductName('')
    setDescription('')
    setCountry('')
    setCity('')
    setNeighborhood('')
    setMarket('')
    setCurrency('USD')
    setPriceMin('')
    setPriceMax('')
    setRecommendedPrice('')
    setTouristPrice('')
    setPersonalPrice('')
    setLocalTip('')
    setCategory('Other')
    setImageUrl('')
  }

  const handleUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
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
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!productName.trim() || !country.trim() || !priceMin || !priceMax || !currency) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in product name, country, currency, and price range.',
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
      const res = await fetch('/api/local-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postType,
          productName,
          description,
          country,
          city,
          neighborhood,
          market,
          currency,
          priceMin: Number(priceMin),
          priceMax: Number(priceMax),
          recommendedPrice: recommendedPrice ? Number(recommendedPrice) : undefined,
          touristPrice: touristPrice ? Number(touristPrice) : undefined,
          personalPrice: personalPrice ? Number(personalPrice) : undefined,
          localTip,
          category,
          imageUrl,
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to save')
      }
      toast({
        title: 'Price guide published!',
        description: `${productName} is now visible to travelers worldwide.`,
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
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            Post a Local Price
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Share what something really costs in your area. Your local knowledge helps travelers avoid tourist traps.
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

          {/* Location block */}
          <div className="space-y-3 p-4 rounded-xl bg-accent/30 border border-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="w-4 h-4 text-primary" />
              Location
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Country *</label>
                <Input
                  placeholder="e.g. Ethiopia"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">City</label>
                <Input
                  placeholder="e.g. Addis Ababa"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
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
            <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Tip: More specific location helps travelers find your post.
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
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Fair price</label>
                <Input
                  type="number"
                  placeholder="1800"
                  value={recommendedPrice}
                  onChange={(e) => setRecommendedPrice(e.target.value)}
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Tourist price</label>
                <Input
                  type="number"
                  placeholder="3000"
                  value={touristPrice}
                  onChange={(e) => setTouristPrice(e.target.value)}
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">What you'd pay</label>
                <Input
                  type="number"
                  placeholder="1800"
                  value={personalPrice}
                  onChange={(e) => setPersonalPrice(e.target.value)}
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
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

          {/* Image upload */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              Add photos
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
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
                  className="absolute top-2 right-2 h-7 w-7 p-0 bg-white/90 hover:bg-white"
                  onClick={() => setImageUrl('')}
                  aria-label="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-lg border-2 border-dashed border-border bg-accent/20 px-4 py-6 flex flex-col items-center text-center hover:border-primary hover:bg-accent/40 transition-colors disabled:opacity-60"
              >
                <Upload className="w-6 h-6 text-primary mb-1.5" />
                <span className="font-medium text-sm text-foreground">
                  {uploading ? 'Uploading...' : 'Add product photo'}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  or drag and drop • PNG, JPEG, WebP, GIF · max 5 MB
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border">
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
            {saving ? 'Publishing...' : 'Publish Price Guide'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
