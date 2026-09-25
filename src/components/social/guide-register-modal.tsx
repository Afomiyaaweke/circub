'use client'

import { useState, useEffect, useRef } from 'react'
import { Languages, Award, DollarSign, Briefcase, Save, Loader2, Compass, ShieldCheck, Camera, X, CheckCircle2, Video, Plus } from 'lucide-react'
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
import { parseVideoUrl, splitVideoUrls, MAX_GUIDE_VIDEOS } from '@/lib/video'
import { guideRolesOrLegacy, roleListLabel, roleNoun, toggleCircubRole, type CircubRole } from '@/lib/roles'
import { RolePicker } from '@/components/social/role-picker'
import type { User } from '@/lib/types'

interface GuideRegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSaved: () => void
}

export function GuideRegisterModal({ open, onOpenChange, user, onSaved }: GuideRegisterModalProps) {
  // Live Zone roles: vlogger / guide / local / volunteer / sales (multi-select).
  // Legacy members (no stored roles) read as ['guide']; members who answered
  // the role question at sign-up arrive with their picks prefilled.
  const [roles, setRoles] = useState<CircubRole[]>(['guide'])
  const [license, setLicense] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [hourlyRate, setHourlyRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [bio, setBio] = useState('')
  // Videos: up to MAX_GUIDE_VIDEOS pasted links (YouTube / Instagram).
  const [videoLinks, setVideoLinks] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)
  // Leave the program: confirmation + request state (members only).
  const [confirmStop, setConfirmStop] = useState(false)
  const [stopping, setStopping] = useState(false)
  // Verification document: type toggle + uploaded photo (data URL preview).
  // Existing members already have a document on file server-side (hasIdDoc) -
  // they only see a confirmation chip and may re-upload a replacement.
  const [docType, setDocType] = useState<'ID' | 'PASSPORT'>('ID')
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [hasIdDoc, setHasIdDoc] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open && user) {
      setRoles(guideRolesOrLegacy((user as any).guideRoles))
      const langs = (user as any).guideLanguages
      const specs = (user as any).guideSpecialties
      setLanguages(Array.isArray(langs) ? langs : langs ? langs.split(',') : [])
      setSpecialties(Array.isArray(specs) ? specs : specs ? specs.split(',') : [])
      setBio((user as any).guideBio || '')
      // Prefill saved videos (stored as raw urls); keep one empty row
      // so adding the first video is one tap.
      const savedVideos = splitVideoUrls((user as any).guideVideoUrls)
      setVideoLinks(savedVideos.length > 0 ? [...savedVideos] : [''])
      const t = (user as any).guideIdDocType
      if (t === 'ID' || t === 'PASSPORT') setDocType(t)
      setHasIdDoc(!!(user as any).hasIdDoc)
      setDocUrl(null)
    }
  }, [open, user])

  const toggleRole = (role: CircubRole) => {
    setRoles((prev) => toggleCircubRole(prev, role))
  }

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

  // Leave the program - removes the card from the Live Zone but keeps every
  // detail (and the verification document) for an instant return.
  const stopBeingGuide = async () => {
    setStopping(true)
    try {
      const res = await fetch('/api/guides/me', { method: 'DELETE' })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast({ title: 'You left the program', description: 'Your card was removed from the Live Zone. Your details are kept for when you come back.' })
      setConfirmStop(false)
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({ title: 'Could not update your status', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setStopping(false)
    }
  }

  const handleSave = async () => {
    if (roles.length === 0) { toast({ title: 'Pick at least one role', variant: 'destructive' }); return }
    if (languages.length === 0) { toast({ title: 'Add at least one language', variant: 'destructive' }); return }
    if (specialties.length === 0) { toast({ title: 'Add at least one specialty', variant: 'destructive' }); return }
    const currencyClean = currency.trim().toUpperCase()
    if (!currencyClean) { toast({ title: 'Type your currency code (e.g. USD, ETB)', variant: 'destructive' }); return }
    if (!docUrl && !hasIdDoc) { toast({ title: 'Upload your ID or passport', description: 'A photo of your ID or passport is required to register.', variant: 'destructive' }); return }

    // Video links: drop empty rows, validate every pasted link (YouTube or
    // Instagram only - mirrors the API so users get instant feedback).
    const videos = videoLinks.map((v) => v.trim()).filter(Boolean)
    if (videos.length > MAX_GUIDE_VIDEOS) {
      toast({ title: `Up to ${MAX_GUIDE_VIDEOS} videos`, description: 'Remove the extra links and try again.', variant: 'destructive' })
      return
    }
    const badVideo = videos.find((v) => !parseVideoUrl(v))
    if (badVideo) {
      toast({
        title: 'Video link not supported',
        description: 'Use the YouTube or Instagram link of the video (e.g. youtube.com/watch?v=... or instagram.com/reel/...).',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guideRoles: roles,
          guideLicense: license,
          guideLanguages: languages.join(','),
          guideSpecialties: specialties.join(','),
          guideHourlyRate: hourlyRate || null,
          guideCurrency: currencyClean,
          guideBio: bio,
          guideAvailable: true,
          guideIdDocType: docType,
          guideVideoUrls: videos,
          ...(docUrl ? { guideIdDocUrl: docUrl } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast({ title: 'You are in!', description: `Travelers can find you in the Live Zone as ${roleListLabel(roles)}.` })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({ title: 'Registration failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  // Role-adaptive form: license is a guide thing, the hourly rate makes sense
  // for guides and locals, and the specialties label speaks the selected
  // roles' language so a vlogger is never asked for "tour specialties".
  const showLicense = roles.includes('guide')
  const showRate = roles.includes('guide') || roles.includes('local')
  const specLabel =
    roles.length > 1 ? 'Your specialties'
    : roles[0] === 'vlogger' ? 'What you film'
    : roles[0] === 'local' ? 'What you can help with'
    : roles[0] === 'volunteer' ? 'How you want to help'
    : roles[0] === 'sales' ? 'What you sell'
    : 'Tour specialties'
  const videoLabel = roles.length === 1 && roles[0] === 'vlogger' ? 'Your videos (YouTube or Instagram links)' : 'Tour videos (YouTube or Instagram links)'
  const saveLabel = saving ? 'Registering...' : roles.length === 1 ? `Register as ${roleNoun(roles[0])}` : 'Register'
  const inProgram = !!(user as any)?.isGuide

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Compass className="w-5 h-5 text-primary" />
            Join as a local
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Register as a vlogger, guide, local, volunteer or sales - or any mix. Travelers find you in the Live Zone and can message you directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Role picker - the SAME question the sign-up form asks; the
              answer picked at registration arrives prefilled here */}
          <RolePicker roles={roles} onToggle={toggleRole} />

          {/* License (optional, guides only) */}
          {showLicense && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />Guide license number (optional)
              </label>
              <Input placeholder="e.g. GT-2024-00123" value={license} onChange={(e) => setLicense(e.target.value)} />
            </div>
          )}

          {/* ID / passport verification (required) */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />ID or passport *
            </label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              A clear photo of your document so the team can verify you. Used for verification only - travelers never see it.
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
                  {docType === 'ID' ? 'ID card' : 'Passport'} on file - verified
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

          {/* Specialties - label speaks the selected roles' language */}
          <div className="space-y-1.5">
            <label htmlFor="guide-specialties-input" className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" />{specLabel} *
            </label>
            <TagInput
              inputId="guide-specialties-input"
              value={specialties}
              onChange={setSpecialties}
              placeholder="e.g. Historical, Food, Safari…"
              hint="Type a specialty and press Enter. Use your own words - no preset list."
            />
          </div>

          {/* Hourly rate + currency (guides and locals) */}
          {showRate && (
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
          )}

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Bio</label>
            <Textarea
              placeholder="Tell travelers about your experience, what makes your city special, and what they can expect..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[80px] resize-y"
            />
          </div>

          {/* Videos (YouTube / Instagram links) */}
          <div className="space-y-2" data-testid="guide-videos-section">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-primary" />
              {videoLabel}
            </label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Paste up to {MAX_GUIDE_VIDEOS} links - travelers watch them right on your card and page.
            </p>
            {videoLinks.map((link, i) => {
              const parsed = parseVideoUrl(link)
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      data-testid={`guide-video-input-${i}`}
                      placeholder={i === 0 ? 'e.g. https://www.youtube.com/watch?v=...' : 'Another video link (optional)'}
                      value={link}
                      onChange={(e) => {
                        setVideoLinks((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }}
                      className="h-9 text-sm flex-1"
                    />
                    {videoLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setVideoLinks((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1.5 rounded-full hover:bg-accent text-muted-foreground shrink-0"
                        aria-label="Remove video link"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {link.trim() && (
                    <p className={`text-[10px] flex items-center gap-1 ${parsed ? 'text-emerald-600' : 'text-destructive'}`}>
                      {parsed ? (
                        <><CheckCircle2 className="w-3 h-3 shrink-0" />{parsed.label} - looks good</>
                      ) : (
                        <>Not a YouTube or Instagram link yet</>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
            {videoLinks.length < MAX_GUIDE_VIDEOS && (
              <button
                type="button"
                data-testid="guide-video-add"
                onClick={() => setVideoLinks((prev) => [...prev, ''])}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />Add another video
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-border">
          {/* Leave the program - existing members only */}
          {inProgram ? (
            <Button variant="ghost" onClick={() => setConfirmStop(true)} disabled={saving || stopping}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1.5">
              <Compass className="w-3.5 h-3.5" />Leave the program
            </Button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 gap-1.5">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Registering...</> : <><Save className="w-4 h-4" />{saveLabel}</>}
            </Button>
          </div>
        </div>

        {/* Confirmation before leaving the program */}
        <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave the local program?</AlertDialogTitle>
              <AlertDialogDescription>
                Your card is removed from the Live Zone and travelers can&apos;t reach you there. Your details, reviews and document are kept - registering again restores your card instantly.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={stopping}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); stopBeingGuide() }}
                disabled={stopping}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {stopping ? <><Loader2 className="w-4 h-4 animate-spin" />Leaving...</> : 'Leave the program'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
