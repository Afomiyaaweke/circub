'use client'

import { useState, useEffect, useRef } from 'react'
import { Camera, X, MapPin, Briefcase, Lightbulb, Sparkles, UserCircle, Save, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
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
  const [profilePicture, setProfilePicture] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (open && user) {
      setName(user.name || '')
      setHeadline(user.headline || '')
      setLocation(user.location || '')
      setBio(user.bio || '')
      setProfilePicture(user.profilePicture || null)
      const tags = user.expertiseTags
      setExpertiseTags(Array.isArray(tags) ? tags.join(', ') : (tags as string) || '')
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
      const res = await fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, headline, location, bio, profilePicture, expertiseTags }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' })
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
