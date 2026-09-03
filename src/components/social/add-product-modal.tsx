'use client'

import { useState, useRef } from 'react'
import { Search, MapPin, DollarSign, Paperclip, Upload, X, Pencil, Globe, Plus } from 'lucide-react'
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

interface AddProductModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

const CURRENCIES = ['USD', 'MYR', 'EUR', 'INR', 'CNY', 'JPY', 'GBP', 'AUD']
const CATEGORIES = [
  'Beverages',
  'Spices',
  'Seafood',
  'Textiles',
  'Electronics',
  'Handicrafts',
  'Agriculture',
  'Other',
]
const GENDERS = ['Any', 'Male', 'Female', 'Unisex']

export function AddProductModal({ open, onOpenChange, onCreated }: AddProductModalProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [country, setCountry] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('')
  const [gender, setGender] = useState('Any')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Beverages')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const reset = () => {
    setName('')
    setQuantity('')
    setCountry('')
    setCurrency('USD')
    setPrice('')
    setUnit('')
    setGender('Any')
    setDescription('')
    setCategory('Beverages')
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
      toast({ title: 'Image uploaded' })
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
    if (!name.trim() || !country.trim() || !price || !currency) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in product name, country, price and currency.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          quantity,
          country,
          currency,
          price: Number(price),
          unit,
          gender,
          description,
          category,
          imageUrl,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      toast({
        title: 'Saved to Marketplace',
        description: `${name} is now visible in your network.`,
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
        <DialogHeader className="mb-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Globe className="w-5 h-5 text-primary" />
            Country Product Prices
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Add a country&apos;s product pricing for the world to discover and trade.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border p-5 sm:p-6 bg-card shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-foreground">Add Product Price</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleCancel}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Row 1 - product + quantity */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Product name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="e.g. Ethiopian Arabica Coffee Beans"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Quantity
              </label>
              <Select value={quantity} onValueChange={setQuantity}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select quantity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100 g">100 g</SelectItem>
                  <SelectItem value="250 g">250 g</SelectItem>
                  <SelectItem value="500 g">500 g</SelectItem>
                  <SelectItem value="1 kg">1 kg</SelectItem>
                  <SelectItem value="5 kg">5 kg</SelectItem>
                  <SelectItem value="10 kg">10 kg</SelectItem>
                  <SelectItem value="1 dozen">1 dozen</SelectItem>
                  <SelectItem value="1 piece">1 piece</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Row 2 - country + currency */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Country
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="e.g. India, Africa"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                Select the country for which you&apos;re setting the price.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Currency
              </label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="e.g. MYR" />
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

            {/* Row 3 - price, unit, category */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Price
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="pl-9"
                    min="0"
                    step="0.01"
                  />
                </div>
                <Input
                  placeholder="unit"
                  className="w-24"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">
                Category
              </label>
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

            {/* Row 4 - gender */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs text-muted-foreground font-medium">
                Gender (audience)
              </label>
              <div className="flex items-center gap-3">
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground/80 flex-1">
                  How should we address you?
                </p>
              </div>
            </div>

            {/* Row 5 - description */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs text-muted-foreground font-medium">
                Description
              </label>
              <div className="relative">
                <Textarea
                  placeholder="Quality, origin, packaging, minimum order, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[100px] resize-y pr-9"
                />
                <Pencil className="absolute bottom-3 right-3 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
              </div>
            </div>

            {/* Row 6 - image upload */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
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
                  className="w-full rounded-lg border-2 border-dashed border-border bg-accent/20 px-4 py-7 flex flex-col items-center text-center hover:border-primary hover:bg-accent/40 transition-colors disabled:opacity-60"
                >
                  <Upload className="w-7 h-7 text-primary mb-2" />
                  <span className="font-medium text-sm text-foreground">
                    {uploading ? 'Uploading...' : 'Add product photo'}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    or drag and drop
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 mt-1">
                    PNG, JPEG, WebP, GIF — max 5 MB
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
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
            {saving ? 'Saving...' : 'Save to Marketplace'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
