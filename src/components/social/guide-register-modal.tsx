'use client'

import { useState, useEffect } from 'react'
import { Sparkles, MapPin, Languages, Award, DollarSign, Briefcase, Save, Loader2, Compass } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import type { User } from '@/lib/types'

interface GuideRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSaved: () => void
}

const LANGUAGES = ['English', 'Amharic', 'French', 'Arabic', 'Swahili', 'Spanish', 'Portuguese', 'Mandarin', 'Japanese', 'German', 'Italian', 'Hindi', 'Oromo', 'Tigrinya', 'Wolaytta']
const SPECIALTIES = ['Historical', 'Food & Culinary', 'Adventure', 'Cultural', 'Nature & Wildlife', 'Photography', 'Shopping', 'Nightlife', 'Religious', 'Architecture']
const CURRENCIES = ['USD', 'ETB', 'EUR', 'KES', 'UGX', 'NGN', 'INR', 'CNY', 'JPY', 'MYR']

export function GuideRegisterModal({ open, onOpenChange, user, onSaved }: GuideRegisterModalProps) {
  const [license, setLicense] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [hourlyRate, setHourlyRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && user) {
      const langs = (user as any).guideLanguages
      const specs = (user as any).guideSpecialties
      setLanguages(Array.isArray(langs) ? langs : langs ? langs.split(',') : [])
      setSpecialties(Array.isArray(specs) ? specs : specs ? specs.split(',') : [])
      setBio((user as any).guideBio || '')
    }
  }, [open, user])

  const toggleArray = (arr: string[], item: string) => {
    if (arr.includes(item)) return arr.filter((x) => x !== item)
    return [...arr, item]
  }

  const handleSave = async () => {
    if (languages.length === 0) { toast({ title: 'Select at least one language', variant: 'destructive' }); return }
    if (specialties.length === 0) { toast({ title: 'Select at least one specialty', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guideLicense: license,
          guideLanguages: languages.join(','),
          guideSpecialties: specialties.join(','),
          guideHourlyRate: hourlyRate || null,
          guideCurrency: currency,
          guideBio: bio,
          guideAvailable: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast({ title: 'You are now a registered guide!', description: 'Travelers can find you in the Live Zone.' })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({ title: 'Registration failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Compass className="w-5 h-5 text-primary" />
            Become a tour guide
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Register as a local tour guide. Travelers will find you in the Live Zone and can message you directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* License (optional) */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />Guide license number (optional)
            </label>
            <Input placeholder="e.g. GT-2024-00123" value={license} onChange={(e) => setLicense(e.target.value)} />
          </div>

          {/* Languages */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" />Languages you speak *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguages((prev) => toggleArray(prev, lang))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    languages.includes(lang)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/40'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Specialties */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />Tour specialties *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SPECIALTIES.map((spec) => (
                <button
                  key={spec}
                  type="button"
                  onClick={() => setSpecialties((prev) => toggleArray(prev, spec))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    specialties.includes(spec)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/40'
                  }`}
                >
                  {spec}
                </button>
              ))}
            </div>
          </div>

          {/* Hourly rate + currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />Hourly rate
              </label>
              <Input type="number" placeholder="e.g. 25" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} min="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Guide bio</label>
            <Textarea
              placeholder="Tell travelers about your experience, what makes your tours special, and what they can expect..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[80px] resize-y"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-1.5">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Registering...</> : <><Save className="w-4 h-4" />Register as guide</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
