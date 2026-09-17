'use client'

import { useState, useEffect, useRef } from 'react'
import { Languages, Award, DollarSign, Briefcase, Save, Loader2, Compass, ShieldCheck, Camera, X, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { dispatchAuthExpired } from '@/lib/auth-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TagInput } from '@/components/ui/tag-input'
import { useToast } from '@/hooks/use-toast'
import { compressImage } from '@/lib/image-compress'
import type { User } from '@/lib/types'

interface GuideRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSaved: () => void
}

export function GuideRegisterModal({ open, onOpenChange, user, onSaved }: GuideRegisterModalProps) {
  const [license, setLicense] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [hourlyRate, setHourlyRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  // Stop being a guide: confirmation + request state (guides only).
  const [confirmStop, setConfirmStop] = useState(false)
  const [stopping, setStopping] = useState(false)
  // Verification document: type toggle + uploaded photo (data URL preview).
  // Existing guides already have a document on file server-side (hasIdDoc) —
  // they only see a confirmation chip and may re-upload a replacement.
  const [docType, setDocType] = useState<'ID' | 'PASSPORT'>('ID')
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [hasIdDoc, setHasIdDoc] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open && user) {
      const langs = (user as any).guideLanguages
      const specs = (user as any).guideSpecialties
      setLanguages(Array.isArray(langs) ? langs : langs ? langs.split(',') : [])
      setSpecialties(Array.isArray(specs) ? specs : specs ? specs.split(',') : [])
      setBio((user as any).guideBio || '')
      const t = (user as any).guideIdDocType
      if (t === 'ID' || t === 'PASSPORT') setDocType(t)
      setHasIdDoc(!!(user as any).hasIdDoc)
      setDocUrl(null)
    }
  }, [open, user])

  const handleDocPick = async (file: File) => {
    if (!file) return
    setDocBusy(true)
    try {
      // Higher maxDim + quality than avatars: the document text must stay readable.
      const compressed = await compressImage(file, 2000, 0.85)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setDocUrl(data.url)
      toast({ title: 'Document ready', description: 'It will be submitted when you register.' })
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setDocBusy(false)
    }
  }

  // Stop being a guide — removes the guide card from the Live Zone but keeps
  // every guide detail (and the verification document) for an instant return.
  const stopBeingGuide = async () => {
    setStopping(true)
    try {
      const res = await fetch('/api/guides/me', { method: 'DELETE' })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast({ title: 'You are no longer a guide', description: 'Your card was removed from the Live Zone. Your details are kept for when you come back.' })
      setConfirmStop(false)
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({ title: 'Could not update your guide status', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setStopping(false)
    }
  }

  const handleSave = async () => {
    if (languages.length === 0) { toast({ title: 'Add at least one language', variant: 'destructive' }); return }
    if (specialties.length === 0) { toast({ title: 'Add at least one specialty', variant: 'destructive' }); return }
    const currencyClean = currency.trim().toUpperCase()
    if (!currencyClean) { toast({ title: 'Type your currency code (e.g. USD, ETB)', variant: 'destructive' }); return }
    if (!docUrl && !hasIdDoc) { toast({ title: 'Upload your ID or passport', description: 'A photo of your ID or passport is required to register as a guide.', variant: 'destructive' }); return }
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
          guideCurrency: currencyClean,
          guideBio: bio,
          guideAvailable: true,
          guideIdDocType: docType,
          ...(docUrl ? { guideIdDocUrl: docUrl } : {}),
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

          {/* ID / passport verification (required) */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />ID or passport *
            </label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              A clear photo of your document so the team can verify you. Used for verification only — travelers never see it.
            </p>

            {/* Document type toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(['ID', 'PASSPORT'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={`h-9 rounded-md border text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    docType === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {t === 'ID' ? 'ID card' : 'Passport'}
                </button>
              ))}
            </div>

            {/* Upload area */}
            <input
              ref={docInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleDocPick(f)
                if (docInputRef.current) docInputRef.current.value = ''
              }}
            />
            {docUrl ? (
              <div className="relative rounded-lg border border-primary/40 bg-primary/5 p-2 flex items-center gap-2.5">
                <img src={docUrl} alt="ID document preview" className="w-14 h-14 rounded-md object-cover border border-border" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-primary flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {docType === 'ID' ? 'ID card' : 'Passport'} photo added
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Submitted when you register.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDocUrl(null)}
                  className="p-1.5 rounded-full hover:bg-accent text-muted-foreground shrink-0"
                  aria-label="Remove document photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : hasIdDoc ? (
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="w-full rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 flex items-center gap-2 text-left hover:bg-primary/10 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs text-foreground flex-1">
                  {docType === 'ID' ? 'ID card' : 'Passport'} on file — verified
                </span>
                <span className="text-[11px] text-primary font-medium shrink-0">Replace</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={docBusy}
                className="w-full rounded-lg border-2 border-dashed border-border px-3 py-4 flex flex-col items-center gap-1 text-center hover:border-primary/50 hover:bg-accent/40 transition-colors disabled:opacity-60"
              >
                {docBusy ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-foreground">
                  {docBusy ? 'Processing photo…' : 'Take or upload a photo'}
                </span>
                <span className="text-[10px] text-muted-foreground">Make sure the whole document is visible and readable</span>
              </button>
            )}
          </div>

          {/* Languages */}
          <div className="space-y-1.5">
            <label htmlFor="guide-languages-input" className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" />Languages you speak *
            </label>
            <TagInput
              inputId="guide-languages-input"
              value={languages}
              onChange={setLanguages}
              placeholder="e.g. Amharic, English, French…"
              hint="Type a language and press Enter. Backspace removes the last one."
            />
          </div>

          {/* Specialties */}
          <div className="space-y-1.5">
            <label htmlFor="guide-specialties-input" className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />Tour specialties *
            </label>
            <TagInput
              inputId="guide-specialties-input"
              value={specialties}
              onChange={setSpecialties}
              placeholder="e.g. Historical, Food, Safari…"
              hint="Type a specialty and press Enter. Use your own words — no preset list."
            />
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
              <label htmlFor="guide-currency-input" className="text-xs text-muted-foreground font-medium">Currency</label>
              <Input
                id="guide-currency-input"
                type="text"
                placeholder="e.g. USD"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={5}
                autoCapitalize="characters"
                className="uppercase"
              />
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

        <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-border">
          {/* Leave the guide program — existing guides only */}
          {(user as any)?.isGuide ? (
            <Button variant="ghost" onClick={() => setConfirmStop(true)} disabled={saving || stopping}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1.5">
              <Compass className="w-3.5 h-3.5" />Stop being a guide
            </Button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-1.5">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Registering...</> : <><Save className="w-4 h-4" />Register as guide</>}
            </Button>
          </div>
        </div>

        {/* Confirmation before leaving the guide program */}
        <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stop being a guide?</AlertDialogTitle>
              <AlertDialogDescription>
                Your card is removed from the Live Zone and travelers can&apos;t book new tours with you. Your guide details, reviews and document are kept — registering again restores your card instantly.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={stopping}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); stopBeingGuide() }}
                disabled={stopping}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {stopping ? <><Loader2 className="w-4 h-4 animate-spin" />Stopping...</> : 'Stop being a guide'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
