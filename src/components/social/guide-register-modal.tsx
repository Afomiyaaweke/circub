'use client'

import { useState, useEffect } from 'react'
import { Sparkles, MapPin, Languages, Award, DollarSign, Briefcase, Save, Loader2, Compass, HelpCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SpeakButton } from '@/components/ui/speak-button'
import { FormTour, type TourStep } from '@/components/ui/form-tour'
import { useToast } from '@/hooks/use-toast'
import type { User } from '@/lib/types'

interface GuideRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSaved: () => void
}

const LANGUAGES = [
  // Africa
  'Amharic', 'Swahili', 'Arabic', 'Oromo', 'Tigrinya', 'Wolaytta', 'Yoruba', 'Igbo', 'Hausa', 'Zulu', 'Xhosa', 'Afrikaans', 'Somali', 'Shona', 'Kinyarwanda', 'Lingala', 'Bambara', 'Wolof', 'Malagasy', 'Twi',
  // Europe
  'English', 'French', 'Spanish', 'Portuguese', 'German', 'Italian', 'Dutch', 'Russian', 'Polish', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Greek', 'Turkish', 'Czech', 'Romanian', 'Hungarian', 'Ukrainian', 'Catalan',
  // Asia
  'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Urdu', 'Persian', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Tagalog', 'Khmer', 'Burmese', 'Nepali', 'Sinhala', 'Kazakh',
  // Americas
  'Quechua', 'Guarani', 'Haitian Creole', 'Maya',
  // Middle East
  'Hebrew', 'Kurdish', 'Pashto', 'Dari',
  // Sign
  'Sign Language (ASL)', 'Sign Language (BSL)',
]
const SPECIALTIES = [
  'Historical', 'Food & Culinary', 'Adventure', 'Cultural', 'Nature & Wildlife',
  'Photography', 'Shopping', 'Nightlife', 'Religious', 'Architecture',
  'Beach & Islands', 'Hiking & Trekking', 'Safari', 'Diving & Snorkeling',
  'Wine & Spirits', 'Art & Museums', 'Local Markets', 'Festivals',
  'Wellness & Spa', 'Family Friendly',
]
const CURRENCIES = ['USD', 'ETB', 'EUR', 'KES', 'UGX', 'NGN', 'INR', 'CNY', 'JPY', 'MYR', 'GBP', 'AUD', 'CAD', 'ZAR', 'BRL', 'MAD', 'EGP', 'GHS', 'TZS', 'RWF']

export function GuideRegisterModal({ open, onOpenChange, user, onSaved }: GuideRegisterModalProps) {
  const [license, setLicense] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [hourlyRate, setHourlyRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const { toast } = useToast()

  // Guided tour steps — each one corresponds to a `data-tour` attribute on
  // a form field below. The tour speaks the user through what to type.
  const tourSteps: TourStep[] = [
    {
      selector: '[data-tour="license"]',
      title: 'Guide license (optional)',
      body: 'If you have an official tour-guide license, enter its number here. Leave blank if your country does not require one.',
      speakLang: 'en-US',
    },
    {
      selector: '[data-tour="languages"]',
      title: 'Languages you speak',
      body: 'Tap every language you can guide in. Pick at least one — travelers filter guides by language. Add specialty languages like Sign Language if relevant.',
      speakLang: 'en-US',
    },
    {
      selector: '[data-tour="specialties"]',
      title: 'Tour specialties',
      body: 'Choose the kinds of tours you offer — Historical, Food, Adventure, Safari, etc. Pick at least one so travelers can find you in the Live Zone.',
      speakLang: 'en-US',
    },
    {
      selector: '[data-tour="rate"]',
      title: 'Hourly rate',
      body: 'Set a typical hourly rate in your local currency. Travelers will see this as a starting point — you can negotiate in chat.',
      speakLang: 'en-US',
    },
    {
      selector: '[data-tour="bio"]',
      title: 'Guide bio',
      body: 'Write 2–3 sentences about your experience, what makes your tours special, and what travelers can expect. A friendly, specific bio gets more messages.',
      speakLang: 'en-US',
    },
    {
      selector: '[data-tour="submit"]',
      title: 'Register as a guide',
      body: 'When you are happy with everything, tap Register as guide to publish your profile. You can edit any of this later from your profile.',
      speakLang: 'en-US',
    },
  ]

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

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
          <p className="flex-1 text-xs text-emerald-800">
            First time? Take the guided tour — it walks you through every field.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setTourOpen(true)}
            className="h-7 gap-1.5 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Start tour
          </Button>
          <SpeakButton
            text="Welcome to the tour guide registration. Take the guided tour to fill this form with help. You can also tap any Listen button to hear instructions aloud in your language."
            lang="en-US"
            variant="ghost"
            className="h-7"
          />
        </div>

        <div className="space-y-5">
          {/* License (optional) */}
          <div className="space-y-1.5" data-tour="license">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5" />Guide license number (optional)
            </label>
            <Input placeholder="e.g. GT-2024-00123" value={license} onChange={(e) => setLicense(e.target.value)} />
          </div>

          {/* Languages */}
          <div className="space-y-1.5" data-tour="languages">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" />Languages you speak *
              <SpeakButton
                text="Tap every language you can guide in. Travelers filter guides by language, so add all the languages you are comfortable speaking."
                lang="en-US"
                variant="compact"
              />
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
          <div className="space-y-1.5" data-tour="specialties">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />Tour specialties *
              <SpeakButton
                text="Choose the kinds of tours you offer. Pick at least one so travelers can find you in the Live Zone."
                lang="en-US"
                variant="compact"
              />
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
            <div className="space-y-1.5" data-tour="rate">
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
          <div className="space-y-1.5" data-tour="bio">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              Guide bio
              <SpeakButton
                text="Write two or three sentences about your experience, what makes your tours special, and what travelers can expect."
                lang="en-US"
                variant="compact"
              />
            </label>
            <Textarea
              placeholder="Tell travelers about your experience, what makes your tours special, and what they can expect..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[80px] resize-y"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border" data-tour="submit">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-1.5">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Registering...</> : <><Save className="w-4 h-4" />Register as guide</>}
          </Button>
        </div>

        <FormTour
          open={tourOpen}
          steps={tourSteps}
          onClose={() => setTourOpen(false)}
          onComplete={() => toast({ title: 'Tour complete', description: 'You are ready to fill in the form.' })}
        />
      </DialogContent>
    </Dialog>
  )
}
