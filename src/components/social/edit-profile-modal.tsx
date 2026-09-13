'use client'

import { useState, useEffect, useRef } from 'react'
import { Camera, X, MapPin, Briefcase, Lightbulb, Sparkles, UserCircle, Save, Loader2, Compass, Languages, Award, DollarSign, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { GuideStars } from './guide-reviews-modal'
import type { User } from '@/lib/types'

interface EditProfileModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onSaved: () => void
}

export function EditProfileModal({ open, onOpenChange, user, onSaved }: EditProfileModalProps) {
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [expertiseTags, setExpertiseTags] = useState('')
  // Guide profile fields (editable when the account is a registered guide)
  const [guideBio, setGuideBio] = useState('')
  const [guideSpecialties, setGuideSpecialties] = useState('')
  const [guideLanguages, setGuideLanguages] = useState('')
  const [guideRate, setGuideRate] = useState('')
  const [guideCurrency, setGuideCurrency] = useState('USD')
  const [guideLicense, setGuideLicense] = useState('')
  const [guideAvg, setGuideAvg] = useState<number | null>(null)
  const [guideCount, setGuideCount] = useState<number | null>(null)
  const [profilePicture, setProfilePicture] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const isGuide = Boolean(user?.isGuide)

  useEffect(() => {
    if (open && user) {
      setName(user.name || '')
      setHeadline(user.headline || '')
      setLocation(user.location || '')
      setBio(user.bio || '')
      setProfilePicture(user.profilePicture || null)
      const tags = user.expertiseTags
      setExpertiseTags(Array.isArray(tags) ? tags.join(', ') : (tags as string) || '')
      // Guide fields
      setGuideBio(user.guideBio || '')
      setGuideSpecialties(Array.isArray(user.guideSpecialties) ? user.guideSpecialties.join(', ') : (user.guideSpecialties as string) || '')
      setGuideLanguages(Array.isArray(user.guideLanguages) ? user.guideLanguages.join(', ') : (user.guideLanguages as string) || '')
      setGuideRate(user.guideHourlyRate != null ? String(user.guideHourlyRate) : '')
      setGuideCurrency(user.guideCurrency || 'USD')
      setGuideLicense(user.guideLicense || '')
      // Visible rating: fresh average + review count straight from the ratings API
      setGuideAvg(typeof user.rating === 'number' && user.rating > 0 ? user.rating : null)
      setGuideCount(null)
      if (user.isGuide) {
        fetch(`/api/guides/${user.id}/ratings`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && typeof d.average === 'number') {
              setGuideAvg(d.average > 0 ? d.average : null)
              setGuideCount(d.count || 0)
            }
          })
          .catch(() => {})
      }
    }
  }, [open, user])

  const handleUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed') }
      const data = await res.json()
      setProfilePicture(data.url)
      toast({ title: 'Profile picture updated' })
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    } finally { setUploading(false) }
  }

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { name, headline, location, bio, profilePicture, expertiseTags }
      if (isGuide) {
        payload.guideBio = guideBio
        payload.guideSpecialties = guideSpecialties
        payload.guideLanguages = guideLanguages
        payload.guideLicense = guideLicense
        payload.guideCurrency = guideCurrency
        payload.guideHourlyRate = guideRate.trim() ? Number(guideRate) : null
      }
      const res = await fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast({ title: 'Profile updated', description: isGuide ? 'Your guide profile is live with the changes.' : 'Your changes have been saved.' })
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
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground"><Sparkles className="w-5 h-5 text-primary" />Edit profile</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Update your personal details and profile picture.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              {profilePicture ? (
                <img src={profilePicture} alt={name} className="w-20 h-20 rounded-full object-cover border-2 border-accent" />
              ) : (
                <Avatar className="w-20 h-20 border-2 border-accent"><AvatarFallback className="bg-primary/15 text-primary font-bold text-2xl">{name.charAt(0).toUpperCase() || '?'}</AvatarFallback></Avatar>
              )}
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60" aria-label="Change profile picture">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ref={fileRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); if (fileRef.current) fileRef.current.value = '' }} className="hidden" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Profile picture</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click the camera icon to upload (max 2 MB).</p>
              {profilePicture && <button onClick={() => setProfilePicture(null)} className="mt-1 text-xs text-destructive hover:underline flex items-center gap-1"><X className="w-3 h-3" />Remove picture</button>}
            </div>
          </div>
          <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><UserCircle className="w-3.5 h-3.5" />Full name *</label><Input placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />Headline</label><Input placeholder="e.g. Verified Local · Traveler · Food enthusiast" value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Location</label><Input placeholder="e.g. Kuala Lumpur, Malaysia" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Expertise (comma-separated)</label><Input placeholder="e.g. Coffee, Markets, Handicrafts" value={expertiseTags} onChange={(e) => setExpertiseTags(e.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" />Bio</label><Textarea placeholder="Tell the community who you are and what you know..." value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-[80px] resize-y" /></div>

          {/* ===== Guide profile section (registered guides only) ===== */}
          {isGuide && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Guide profile</h3>
                  <Badge variant="secondary" className="bg-primary/10 text-primary text-[9px]">Live Zone</Badge>
                </div>
                {/* Visible tourist rating */}
                <div className="flex items-center gap-1 text-xs">
                  {guideAvg != null && guideAvg > 0 ? (
                    <>
                      <GuideStars value={guideAvg} />
                      <span className="font-semibold text-foreground">{guideAvg.toFixed(1)}</span>
                      <span className="text-muted-foreground">({guideCount ?? 0} review{guideCount !== 1 ? 's' : ''})</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />No reviews yet</span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">These details are what tourists see on your Live Zone card — keep them sharp.</p>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" />Guide bio</label><Textarea placeholder="What tours do you run? What makes exploring with you special..." value={guideBio} onChange={(e) => setGuideBio(e.target.value)} className="min-h-[64px] resize-y bg-card" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" />Specialties (comma-separated)</label><Input placeholder="e.g. Historical, Food, Hiking" value={guideSpecialties} onChange={(e) => setGuideSpecialties(e.target.value)} className="bg-card" /></div>
                <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Languages className="w-3.5 h-3.5" />Languages (comma-separated)</label><Input placeholder="e.g. Amharic, English" value={guideLanguages} onChange={(e) => setGuideLanguages(e.target.value)} className="bg-card" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />Hourly rate</label><Input type="number" min={0} placeholder="e.g. 30" value={guideRate} onChange={(e) => setGuideRate(e.target.value)} className="bg-card" /></div>
                <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium">Currency</label><select value={guideCurrency} onChange={(e) => setGuideCurrency(e.target.value)} className="h-9 w-full px-3 rounded-md border border-border bg-card text-sm text-foreground">
                  {['USD', 'ETB', 'EUR', 'GBP', 'KES', 'AED', 'TRY', 'ZAR'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              </div>
              <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Award className="w-3.5 h-3.5" />License number (optional)</label><Input placeholder="e.g. ET-GUIDE-2024-0182" value={guideLicense} onChange={(e) => setGuideLicense(e.target.value)} className="bg-card" /></div>
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploading || !name.trim()} className="bg-primary hover:bg-primary/90 gap-1.5">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save changes</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
