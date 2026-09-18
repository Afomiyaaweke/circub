'use client'

// ============================================================================
// PROFILE TAB - Instagram-style profile section.
// Your avatar with a story ring, a stats row, a 24-hour Stories row
// (add / view / delete) and a manage grid for everything you have posted -
// feed posts, price listings, marketplace products - each one deletable
// straight from its tile, with a confirmation before it goes.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  AtSign, Award, BadgeCheck, BookUser, Bookmark, Briefcase, Camera, ChevronLeft, ChevronRight, Compass, CreditCard, DollarSign, Image as ImageIcon, Languages, Loader2,
  Check, Lightbulb, Mail, MapPin, MessageCircle, Package, Phone, Plus, Share2, ShieldCheck, Sparkles, Star, Trash2, UserCircle, Users, X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { compressImage } from '@/lib/image-compress'
import { dispatchAuthExpired } from '@/lib/auth-fetch'
import { normalizeUsername, validateUsername, profileLink } from '@/lib/username'
import { getSavedItems, unsaveItem, type SavedItem } from '@/lib/saved-items'
import { GuideStars } from './guide-reviews-modal'
import { NetworkTab } from './network-tab'
import { AddProductModal } from './add-product-modal'
import type { User } from '@/lib/types'

interface ProfileTabProps {
  me: User
  editSignal?: number
  // Deep link into a section from outside (header menu "My network",
  // right sidebar) - applied on mount and re-applied when sectionBump changes.
  // Accepts every section so the position-restore can land on any of them.
  initialSection?: ContentType | null
  sectionBump?: number
  // Reports the section the tab is actually showing so the shell can remember
  // the user's position ("remember where the user is if not refreshed").
  onSectionChange?: (section: ContentType) => void
  onOpenListing: (postId: string) => void
  onMessage: (userId: string) => void
  onUserChanged: () => void
  onSignUp: () => void
}

interface MyPost { id: string; content: string; imageUrl?: string | null; createdAt: string }
interface MyListing {
  id: string; productName: string; category: string; currency: string
  priceMin: number; priceMax: number; imageUrl?: string | null; createdAt: string
}
interface MyProduct {
  id: string; name: string; price: number; currency: string
  imageUrl?: string | null; description?: string | null; createdAt: string
}
interface MyStory {
  id: string; imageUrl: string; caption?: string | null
  author?: { id: string; name: string; profilePicture?: string | null; avatarColor?: string }
  createdAt: string; expiresAt: string
}

type ContentType = 'posts' | 'listings' | 'products' | 'saved' | 'network'
type Deletable =
  | { kind: 'post'; id: string; label: string }
  | { kind: 'listing'; id: string; label: string }
  | { kind: 'product'; id: string; label: string }
  | { kind: 'story'; id: string; label: string }

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function priceLabel(min: number, max: number, currency: string): string {
  const fmt = (n: number) => (n >= 1000 ? n.toLocaleString() : n)
  return min === max || max <= min ? `${currency} ${fmt(min)}` : `${currency} ${fmt(min)} - ${fmt(max)}`
}

const CONTENT_TABS: { key: ContentType; label: string; icon: typeof ImageIcon }[] = [
  { key: 'posts', label: 'Posts', icon: ImageIcon },
  { key: 'listings', label: 'Listings', icon: MapPin },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'saved', label: 'Saved', icon: Bookmark },
  { key: 'network', label: 'Network', icon: Users },
]

export function ProfileTab({ me, editSignal = 0, initialSection = null, sectionBump = 0, onSectionChange, onOpenListing, onMessage, onUserChanged, onSignUp }: ProfileTabProps) {
  const { toast } = useToast()
  const isGuest = me.id === 'guest'

  const [posts, setPosts] = useState<MyPost[]>([])
  const [listings, setListings] = useState<MyListing[]>([])
  const [products, setProducts] = useState<MyProduct[]>([])
  const [stories, setStories] = useState<MyStory[]>([])
  const [loading, setLoading] = useState(!isGuest)

  const [contentType, setContentType] = useState<ContentType>(initialSection ?? 'posts')

  // Story creation
  const fileRef = useRef<HTMLInputElement>(null)
  const [newStoryImage, setNewStoryImage] = useState<string | null>(null)
  const [newStoryCaption, setNewStoryCaption] = useState('')
  const [publishing, setPublishing] = useState(false)

  // Story viewer
  const [viewerIndex, setViewerIndex] = useState(-1)

  // Content viewers
  const [postView, setPostView] = useState<MyPost | null>(null)
  const [productView, setProductView] = useState<MyProduct | null>(null)

  // Delete confirmation
  const [confirm, setConfirm] = useState<Deletable | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Full-tab Edit Profile view (Instagram-style) - replaces the old modal
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  // Username: the shareable profile handle (circub.app/u/<username>).
  const [username, setUsername] = useState('')
  const [uStatus, setUStatus] = useState<'idle' | 'checking' | 'available' | 'error'>('idle')
  const [uMsg, setUMsg] = useState('')
  const [headline, setHeadline] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [expertiseTags, setExpertiseTags] = useState('')
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
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const isGuide = Boolean(me.isGuide)

  // ---------------------------------------------- verification (ID/passport)
  // The uploaded document is PRIVATE - it lives in the DB and is only ever
  // returned to its owner via GET /api/verification. Everyone else just sees
  // the idVerified boolean rendered as a blue badge next to the name.
  const [verifying, setVerifying] = useState(false)
  const [docType, setDocType] = useState<'ID' | 'PASSPORT'>('ID')
  const [docPreview, setDocPreview] = useState<string | null>(null)
  const [docOnFile, setDocOnFile] = useState<{ docType?: string | null; docUrl: string | null; verifiedAt?: string | null; guideDocOnFile?: boolean } | null>(null)
  const [docBusy, setDocBusy] = useState(false)
  const [submittingVerif, setSubmittingVerif] = useState(false)
  const [confirmUnverify, setConfirmUnverify] = useState(false)
  // Stop being a guide: confirm + request state (Edit profile guide section).
  const [confirmStopGuide, setConfirmStopGuide] = useState(false)
  const [stoppingGuide, setStoppingGuide] = useState(false)
  const docFileRef = useRef<HTMLInputElement>(null)
  const isIdVerified = Boolean(me.idVerified) || Boolean((me as any).hasUserIdDoc)

  const fetchAll = useCallback(async () => {
    if (isGuest) return
    setLoading(true)
    const [p, l, pr, st] = await Promise.allSettled([
      fetch(`/api/posts?authorId=${me.id}&limit=60`).then((r) => r.json()),
      fetch(`/api/local-prices?authorId=${me.id}`).then((r) => r.json()),
      fetch(`/api/products?authorId=${me.id}`).then((r) => r.json()),
      fetch('/api/stories').then((r) => r.json()),
    ])
    if (p.status === 'fulfilled' && p.value?.posts) setPosts(p.value.posts)
    if (l.status === 'fulfilled' && l.value?.posts) setListings(l.value.posts)
    if (pr.status === 'fulfilled' && pr.value?.products) setProducts(pr.value.products)
    if (st.status === 'fulfilled' && Array.isArray(st.value?.stories)) {
      setStories(st.value.stories.filter((s: MyStory & { authorId?: string }) => s.authorId === me.id || s.author?.id === me.id))
    }
    setLoading(false)
  }, [isGuest, me.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Entry points outside this tab (header user menu, right sidebar) request
  // edit mode by bumping editSignal while switching to the Profile tab.
  useEffect(() => {
    if (editSignal > 0 && !isGuest) openEdit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal])

  // Same pattern for deep-linked sections: the header's "My network" and the
  // right sidebar land here with initialSection set; a sectionBump change
  // re-applies it when the Profile tab is already mounted.
  const lastBump = useRef(sectionBump)
  useEffect(() => {
    if (sectionBump !== lastBump.current) {
      lastBump.current = sectionBump
      if (initialSection && !isGuest) {
        setEditing(false)
        setContentType(initialSection)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionBump, initialSection, isGuest])

  // Report the live section upward (position memory). Fires on mount too so
  // even a plain Profile visit is recorded as 'posts'.
  useEffect(() => {
    onSectionChange?.(contentType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType])

  // ------------------------------------------------------- saved (bookmark)
  // Saved items live in localStorage (per device) - posts and price posts
  // bookmarked from the feed and the Local prices tab via the bookmark icon.
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [savedView, setSavedView] = useState<SavedItem | null>(null)
  const refreshSaved = useCallback(() => setSavedItems(getSavedItems()), [])
  useEffect(() => {
    refreshSaved()
    window.addEventListener('circub:saved-changed', refreshSaved)
    return () => window.removeEventListener('circub:saved-changed', refreshSaved)
  }, [refreshSaved])

  const handleUnsave = (item: SavedItem) => {
    unsaveItem(item.id)
    setSavedItems((list) => list.filter((s) => s.id !== item.id))
    toast({ title: 'Removed from saved' })
  }

  const openSavedItem = (item: SavedItem) => {
    // Price posts open in the full details modal; posts have no deep link,
    // so they open in a lightweight view dialog instead.
    if (item.type === 'localPrice') onOpenListing(item.id)
    else setSavedView(item)
  }

  // Guests can keep saving on this device - the CTA branch reuses this list.
  const [guestSaved, setGuestSaved] = useState(false)

  // Marketplace: list a new product straight from the profile's Products section
  const [addProductOpen, setAddProductOpen] = useState(false)

  // Auto-advance the story viewer every 6 seconds (Instagram-style)
  useEffect(() => {
    if (viewerIndex < 0) return
    const t = setTimeout(() => {
      setViewerIndex((i) => (i + 1 >= stories.length ? -1 : i + 1))
    }, 6000)
    return () => clearTimeout(t)
  }, [viewerIndex, stories.length])

  // ------------------------------------------------------------- edit mode
  const openEdit = useCallback(() => {
    setName(me.name || '')
    setUsername((me as any).username || '')
    setUStatus('idle')
    setUMsg('')
    setHeadline(me.headline || '')
    setLocation(me.location || '')
    setBio(me.bio || '')
    setPhone((me as any).phone || '')
    setWhatsapp((me as any).whatsapp || '')
    setProfilePicture(me.profilePicture || null)
    const tags = me.expertiseTags
    setExpertiseTags(Array.isArray(tags) ? tags.join(', ') : (tags as string) || '')
    setGuideBio(me.guideBio || '')
    setGuideSpecialties(Array.isArray(me.guideSpecialties) ? me.guideSpecialties.join(', ') : (me.guideSpecialties as string) || '')
    setGuideLanguages(Array.isArray(me.guideLanguages) ? me.guideLanguages.join(', ') : (me.guideLanguages as string) || '')
    setGuideRate(me.guideHourlyRate != null ? String(me.guideHourlyRate) : '')
    setGuideCurrency(me.guideCurrency || 'USD')
    setGuideLicense(me.guideLicense || '')
    setGuideAvg(typeof me.rating === 'number' && me.rating > 0 ? me.rating : null)
    setGuideCount(null)
    setEditing(true)
    if (me.isGuide) {
      fetch(`/api/guides/${me.id}/ratings`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.average === 'number') {
            setGuideAvg(d.average > 0 ? d.average : null)
            setGuideCount(d.count || 0)
          }
        })
        .catch(() => {})
    }
  }, [me])

  // Live username availability probe (debounced) - skipped when the handle
  // is unchanged from the one already on the account.
  useEffect(() => {
    if (!editing) return
    const current = ((me as any).username as string) || ''
    if (!username) { setUStatus('idle'); setUMsg(''); return }
    if (username === current) { setUStatus('idle'); setUMsg(''); return }
    const check = validateUsername(username)
    if (!check.ok) { setUStatus('error'); setUMsg(check.error); return }
    setUStatus('checking'); setUMsg('Checking availability...')
    const t = setTimeout(() => {
      fetch(`/api/users/check-username?u=${encodeURIComponent(check.username)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.available) { setUStatus('available'); setUMsg(profileLink(check.username).replace(/^https?:\/\//, '') + ' is yours') }
          else { setUStatus('error'); setUMsg(d?.error || 'That username is already taken - please pick another') }
        })
        .catch(() => { setUStatus('idle'); setUMsg('') })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, editing])

  // ------------------------------------------------------- verification flow
  const openVerification = useCallback(() => {
    const t = (me as any).userIdDocType
    setDocType(t === 'PASSPORT' ? 'PASSPORT' : 'ID')
    setDocPreview(null)
    setDocOnFile(null)
    setVerifying(true)
    // Fetch the owner-only document view (GET returns the image to its owner
    // and nobody else - see src/app/api/verification/route.ts).
    if (isIdVerified) {
      fetch('/api/verification')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setDocOnFile({ docType: d.docType, docUrl: d.docUrl, verifiedAt: d.verifiedAt, guideDocOnFile: d.guideDocOnFile }) })
        .catch(() => {})
    }
  }, [me, isIdVerified])

  const handleDocPick = async (file: File) => {
    if (!file) return
    setDocBusy(true)
    try {
      // Higher maxDim + quality than avatars: document text must stay readable.
      const compressed = await compressImage(file, 2000, 0.85)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setDocPreview(data.url)
    } catch (err) {
      toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' })
    } finally { setDocBusy(false) }
  }

  const submitVerification = async () => {
    if (!docPreview) { toast({ title: 'Upload your document first', variant: 'destructive' }); return }
    setSubmittingVerif(true)
    try {
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, docUrl: docPreview }),
      })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')
      toast({ title: 'You are verified', description: 'The blue badge now shows next to your name. Only you can see your document.' })
      setDocPreview(null)
      setVerifying(false)
      onUserChanged()
    } catch (err) {
      toast({ title: 'Could not verify', description: (err as Error).message, variant: 'destructive' })
    } finally { setSubmittingVerif(false) }
  }

  const removeVerification = async () => {
    setSubmittingVerif(true)
    try {
      const res = await fetch('/api/verification', { method: 'DELETE' })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast({ title: 'Document removed', description: 'Your verified badge has been turned off.' })
      setConfirmUnverify(false)
      setDocOnFile(null)
      setVerifying(false)
      onUserChanged()
    } catch (err) {
      toast({ title: 'Remove failed', description: (err as Error).message, variant: 'destructive' })
    } finally { setSubmittingVerif(false) }
  }

  const handleAvatarUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      // Avatars render small - compress hard so the profile update payload
      // stays tiny (raw phone photos previously broke the upload entirely).
      const compressed = await compressImage(file, 800, 0.85)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Upload failed') }
      const data = await res.json()
      setProfilePicture(data.url)
      toast({ title: 'Profile picture updated' })
    } catch (err) {
      toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' })
    } finally { setUploading(false) }
  }

  // Stop being a guide - same contract as the guide modal's action: card
  // leaves the Live Zone, details + document kept for a fast return.
  const stopBeingGuide = async () => {
    setStoppingGuide(true)
    try {
      const res = await fetch('/api/guides/me', { method: 'DELETE' })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast({ title: 'You are no longer a guide', description: 'Your card was removed from the Live Zone. Your details are kept for when you come back.' })
      setConfirmStopGuide(false)
      setEditing(false)
      onUserChanged()
    } catch (err) {
      toast({ title: 'Could not update your guide status', description: (err as Error).message, variant: 'destructive' })
    } finally { setStoppingGuide(false) }
  }

  // Share this profile: copies /u/<username> (or opens the native share
  // sheet on phones). Without a username yet, sends the user to set one -
  // the handle IS the shareable ID.
  const shareProfile = async () => {
    const handle = ((me as any).username as string) || ''
    if (!handle) {
      toast({ title: 'Set a username first', description: 'Pick your unique ID in Edit profile, then share it.' })
      openEdit()
      return
    }
    const link = profileLink(handle)
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: `${me.name} on Circub`, url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      toast({ title: 'Profile link copied', description: link.replace(/^https?:\/\//, '') })
    } catch {
      // Clipboard blocked (or share dismissed) - show it so the user can copy manually.
      toast({ title: 'Your profile link', description: link.replace(/^https?:\/\//, '') })
    }
  }

  const saveProfile = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return }
    const uCheck = validateUsername(username)
    if (!uCheck.ok) { toast({ title: 'Check your username', description: uCheck.error, variant: 'destructive' }); return }
    if (uStatus === 'error') { toast({ title: 'Username unavailable', description: uMsg || 'Please pick another username.', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { name, headline, location, bio, profilePicture, expertiseTags, phone: phone.trim() || null, whatsapp: whatsapp.trim() || null, username: uCheck.username }
      if (isGuide) {
        payload.guideBio = guideBio
        payload.guideSpecialties = guideSpecialties
        payload.guideLanguages = guideLanguages
        payload.guideLicense = guideLicense
        payload.guideCurrency = guideCurrency
        payload.guideHourlyRate = guideRate.trim() ? Number(guideRate) : null
      }
      const res = await fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast({ title: 'Profile updated', description: isGuide ? 'Your guide profile is live with the changes.' : 'Your changes have been saved.' })
      setEditing(false)
      onUserChanged()
    } catch (err) {
      toast({ title: 'Save failed', description: (err as Error).message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  // ---------------------------------------------------------------- stories
  const pickStoryImage = () => {
    if (isGuest) { onSignUp(); return }
    fileRef.current?.click()
  }

  const handleStoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const compressed = await compressImage(file, 1080, 0.8)
      const fd = new FormData()
      fd.append('file', compressed)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Upload failed') }
      const data = await res.json()
      setNewStoryImage(data.url)
      setNewStoryCaption('')
    } catch (err) {
      toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' })
    }
  }

  const shareStory = async () => {
    if (!newStoryImage) return
    setPublishing(true)
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: newStoryImage, caption: newStoryCaption }),
      })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Could not share your story') }
      const data = await res.json()
      setStories((s) => [...s, data.story])
      setNewStoryImage(null)
      setNewStoryCaption('')
      toast({ title: 'Story shared', description: 'It disappears automatically after 24 hours.' })
    } catch (err) {
      toast({ title: 'Share failed', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setPublishing(false)
    }
  }

  // ---------------------------------------------------------------- deletes
  const doDelete = async () => {
    if (!confirm) return
    const { kind, id, label } = confirm
    setDeleting(true)
    const url =
      kind === 'post' ? `/api/posts/${id}` :
      kind === 'listing' ? `/api/local-prices/${id}` :
      kind === 'product' ? `/api/products/${id}` :
      `/api/stories/${id}`
    try {
      const res = await fetch(url, { method: 'DELETE' })
      if (res.status === 401) { dispatchAuthExpired('session-expired'); return }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Delete failed') }
      if (kind === 'post') {
        setPosts((list) => list.filter((x) => x.id !== id))
        setPostView(null)
      } else if (kind === 'listing') {
        setListings((list) => list.filter((x) => x.id !== id))
      } else if (kind === 'product') {
        setProducts((list) => list.filter((x) => x.id !== id))
        setProductView(null)
      } else {
        setStories((list) => {
          const next = list.filter((x) => x.id !== id)
          return next
        })
        setViewerIndex(-1)
      }
      toast({ title: `${label} deleted` })
      onUserChanged()
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setDeleting(false)
      setConfirm(null)
    }
  }

  // ------------------------------------------------------- saved list markup
  // One row per bookmarked item - shared by the Saved content section and
  // the guest CTA's "saved on this device" list.
  const renderSavedItems = () => (
    savedItems.length === 0 ? (
      <EmptyState icon={<Bookmark className="w-7 h-7 text-primary/50" />} title="Nothing saved yet"
        text="Tap the bookmark icon on any post or price card - your saved collection lives here, like Instagram's Saved tab." />
    ) : (
      <div className="divide-y divide-border/60">
        {savedItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-2.5">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-accent/50 shrink-0">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-emerald-500/10 to-teal-500/15 flex items-center justify-center">
                  {item.type === 'post' ? <ImageIcon className="w-5 h-5 text-primary/50" /> : <MapPin className="w-5 h-5 text-primary/50" />}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
              {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
              <p className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 mt-0.5">
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase tracking-wide bg-accent text-muted-foreground">
                  {item.type === 'post' ? 'Post' : 'Price'}
                </Badge>
                {item.priceLabel && <span className="font-semibold text-foreground/80">{item.priceLabel}</span>}
                <span>Saved {timeAgo(new Date(item.savedAt).toISOString())}</span>
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => openSavedItem(item)}>
              {item.type === 'localPrice' ? 'Open' : 'View'}
            </Button>
            <button
              onClick={() => handleUnsave(item)}
              className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              aria-label="Remove from saved"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    )
  )

  // ------------------------------------------------------------------ guest
  if (isGuest) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Camera className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1.5">Your profile lives here</h2>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Posts, price listings, products and 24-hour stories - all in one place, like your favourite social app.
            Sign up free to make it yours.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={onSignUp} className="bg-primary hover:bg-primary/90 text-primary-foreground">Join circub - it's free</Button>
            <Button variant="outline" onClick={() => setGuestSaved((v) => !v)} className="gap-1.5">
              <Bookmark className="w-4 h-4" />{guestSaved ? 'Hide' : 'View'} your saved items
            </Button>
          </div>
          {guestSaved && (
            <div className="mt-6 text-left bg-card border border-border rounded-xl p-3">
              <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5"><Bookmark className="w-4 h-4 text-primary" />Saved on this device</h3>
              <p className="text-[11px] text-muted-foreground mb-2">Bookmarked posts and prices are kept in this browser - sign up to keep them with your account.</p>
              {renderSavedItems()}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ------------------------------------------------ full-tab edit profile
  if (editing && !isGuest) {
    return (
      <div className="flex-1 min-w-0 pb-10">
        <input ref={avatarFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); if (avatarFileRef.current) avatarFileRef.current.value = '' }} />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4">
          {/* IG-style toolbar: back · title · save */}
          <div className="sticky top-[56px] md:top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="p-1.5 -ml-1.5 rounded-full hover:bg-accent text-foreground" aria-label="Back to profile">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-lg font-bold text-foreground">Edit profile</h1>
            <Button onClick={saveProfile} disabled={saving || uploading || !name.trim()} className="h-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <>Save</>}
            </Button>
          </div>

          <div className="mt-6 space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative">
                {profilePicture ? (
                  <img src={profilePicture} alt={name} className="w-20 h-20 rounded-full object-cover border-2 border-accent" />
                ) : (
                  <Avatar className="w-20 h-20 border-2 border-accent"><AvatarFallback className="bg-primary/15 text-primary font-bold text-2xl">{name.charAt(0).toUpperCase() || '?'}</AvatarFallback></Avatar>
                )}
                <button onClick={() => avatarFileRef.current?.click()} disabled={uploading} className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors disabled:opacity-60" aria-label="Change profile picture">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Profile picture</p>
                <p className="text-xs text-muted-foreground mt-0.5">Tap the camera icon to upload (max 2 MB).</p>
                {profilePicture && <button onClick={() => setProfilePicture(null)} className="mt-1 text-xs text-destructive hover:underline flex items-center gap-1"><X className="w-3 h-3" />Remove picture</button>}
              </div>
            </div>

            <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><UserCircle className="w-3.5 h-3.5" />Full name *</label><Input placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            {/* Username - the unique ID people use to find + share this profile */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><AtSign className="w-3.5 h-3.5" />Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">@</span>
                <Input
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                  className={cn('pl-7 pr-9', uStatus === 'available' && 'border-green-500/60 focus-visible:ring-green-500/40', uStatus === 'error' && 'border-destructive/60 focus-visible:ring-destructive/40')}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {uStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {uStatus === 'available' && <Check className="w-4 h-4 text-green-600" />}
                </span>
              </div>
              {uMsg ? (
                <p className={cn('text-[10px]', uStatus === 'available' && 'text-green-600', uStatus === 'error' && 'text-destructive', uStatus === 'checking' && 'text-muted-foreground')}>{uMsg}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">Your unique ID - your profile lives at <span className="font-semibold">circub.app/u/{username || 'yourname'}</span>. Lowercase letters, numbers and underscores.</p>
              )}
            </div>
            <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />Headline</label><Input placeholder="e.g. Verified Local · Traveler · Food enthusiast" value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Location</label><Input placeholder="e.g. Kuala Lumpur, Malaysia" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Expertise (comma-separated)</label><Input placeholder="e.g. Coffee, Markets, Handicrafts" value={expertiseTags} onChange={(e) => setExpertiseTags(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" />Bio</label><Textarea placeholder="Tell the community who you are and what you know..." value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-[80px] resize-y" /></div>

            {/* Contact information */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Contact information</h3>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">Shown on your profile so travelers and locals can reach you. Same channels as local price posts.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Phone</label>
                  <Input type="tel" placeholder="+251 911 234 567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</label>
                  <Input placeholder="+251 911 234 567 or wa.me/251911234567" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />Sign-in email</label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-accent/40 text-sm text-muted-foreground truncate">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  {me.email || '-'}
                </div>
                <p className="text-[10px] text-muted-foreground">Your sign-in email is used for contact - it can’t be changed here.</p>
              </div>
            </div>

            {/* Guide profile (registered guides only) */}
            {isGuide && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Guide profile</h3>
                    <Badge variant="secondary" className="bg-primary/10 text-primary text-[9px]">Live Zone</Badge>
                  </div>
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
                <p className="text-[11px] text-muted-foreground -mt-1">These details are what tourists see on your Live Zone card - keep them sharp.</p>
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
                {/* Leave the guide program - keeps details + document for rejoining */}
                <button
                  onClick={() => setConfirmStopGuide(true)}
                  disabled={stoppingGuide}
                  className="text-xs text-destructive hover:underline flex items-center gap-1.5 pt-1 disabled:opacity-60"
                >
                  <Compass className="w-3.5 h-3.5" />Stop being a guide
                </button>
              </div>
            )}
          </div>
        </div>

      {/* Confirm: stop being a guide (Edit profile) */}
      <AlertDialog open={confirmStopGuide} onOpenChange={setConfirmStopGuide}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop being a guide?</AlertDialogTitle>
            <AlertDialogDescription>
              Your card is removed from the Live Zone and travelers can&apos;t book new tours with you. Your guide details, reviews and document are kept - registering again restores your card instantly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stoppingGuide}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); stopBeingGuide() }}
              disabled={stoppingGuide}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {stoppingGuide ? <><Loader2 className="w-4 h-4 animate-spin" />Stopping...</> : 'Stop being a guide'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    )
  }

  // ---------------------------------------------- full-tab verification view
  if (verifying && !isGuest) {
    const verifiedNow = isIdVerified
    return (
      <div className="flex-1 min-w-0 pb-10">
        <input ref={docFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocPick(f); if (docFileRef.current) docFileRef.current.value = '' }} />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4">
          {/* IG-style toolbar: back · title · status */}
          <div className="sticky top-[56px] md:top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-2">
            <button onClick={() => setVerifying(false)} className="p-1.5 -ml-1.5 rounded-full hover:bg-accent text-foreground" aria-label="Back to profile">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-lg font-bold text-foreground">Verification</h1>
            {verifiedNow && <BadgeCheck className="w-5 h-5 text-blue-500" />}
          </div>

          <div className="mt-6 space-y-5">
            {verifiedNow ? (
              <>
                {/* status card */}
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="w-7 h-7 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-foreground">You are verified</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {docOnFile?.docType
                          ? `Document on file: ${docOnFile.docType === 'PASSPORT' ? 'Passport' : 'ID card'}`
                          : docOnFile?.guideDocOnFile
                            ? 'Verified with the ID/passport from your guide registration.'
                            : 'A verifiable document is on file.'}
                        {docOnFile?.verifiedAt ? ` · Verified ${new Date(docOnFile.verifiedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  {docOnFile?.docUrl ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-blue-500" />Your document - visible only to you</p>
                      <img src={docOnFile.docUrl} alt="Your verification document" className="max-h-64 w-auto rounded-lg border border-border" />
                    </div>
                  ) : docOnFile ? (
                    <p className="mt-3 text-xs text-muted-foreground">Your guide registration document is on file - it is kept just as private.</p>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading your document...</p>
                  )}
                </div>

                {/* privacy note */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">Your ID/passport is private. Nobody else can open it - other people only see the blue verified badge next to your name.</p>
                </div>

                {/* actions */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => docFileRef.current?.click()} disabled={docBusy} className="flex-1 h-9 rounded-lg gap-1.5">
                    {docBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}Replace document
                  </Button>
                  {docOnFile?.docUrl && (
                    <Button variant="outline" onClick={() => setConfirmUnverify(true)} className="flex-1 h-9 rounded-lg gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
                      <Trash2 className="w-4 h-4" />Remove document
                    </Button>
                  )}
                </div>

                {docPreview && (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <p className="text-xs font-medium text-foreground">New document ready - submit to update your file.</p>
                    <img src={docPreview} alt="New document preview" className="max-h-64 w-auto rounded-lg border border-border" />
                    <Button onClick={submitVerification} disabled={submittingVerif} className="w-full h-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
                      {submittingVerif ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      {submittingVerif ? 'Submitting...' : 'Submit new document'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* intro */}
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 flex items-start gap-3">
                  <ShieldCheck className="w-7 h-7 text-blue-500 shrink-0" />
                  <div>
                    <h2 className="text-sm font-bold text-foreground">Get the verified badge</h2>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Upload a photo of your ID card or passport. Once verified, a blue check shows next to your name across circub - trust at a glance.</p>
                  </div>
                </div>

                {/* document type */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Document type</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([['ID', 'ID card', 'National ID or residence card', CreditCard], ['PASSPORT', 'Passport', 'Photo page of your passport', BookUser]] as const).map(([val, label, hint, Icon]) => (
                      <button key={val} onClick={() => setDocType(val)}
                        className={cn('rounded-xl border p-4 text-left transition-colors', docType === val ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
                        aria-pressed={docType === val}>
                        <Icon className={cn('w-5 h-5 mb-2', docType === val ? 'text-primary' : 'text-muted-foreground')} />
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* upload */}
                {docPreview ? (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <img src={docPreview} alt="Document preview" className="max-h-64 w-auto rounded-lg border border-border mx-auto" />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setDocPreview(null)} className="flex-1 h-9 rounded-lg">Retake</Button>
                      <Button onClick={submitVerification} disabled={submittingVerif} className="flex-1 h-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
                        {submittingVerif ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        {submittingVerif ? 'Submitting...' : 'Submit for verification'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => docFileRef.current?.click()} disabled={docBusy}
                    className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-accent/30 p-8 flex flex-col items-center gap-2 transition-colors disabled:opacity-60"
                    aria-label="Upload document photo">
                    {docBusy ? <Loader2 className="w-6 h-6 text-primary animate-spin" /> : <Camera className="w-6 h-6 text-primary" />}
                    <span className="text-sm font-semibold text-foreground">{docBusy ? 'Processing...' : 'Upload a photo'}</span>
                    <span className="text-[11px] text-muted-foreground">Take a photo or choose from gallery - JPG or PNG</span>
                  </button>
                )}

                {/* privacy */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <p className="font-medium text-foreground text-xs mb-0.5">Private by default</p>
                    Your document is stored securely and shown only to you. Nobody else can open it - when people view your profile, all they get is the blue verified badge.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* remove-document confirmation */}
        <AlertDialog open={confirmUnverify} onOpenChange={setConfirmUnverify}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove your document?</AlertDialogTitle>
              <AlertDialogDescription>
                Your ID/passport photo will be deleted and the verified badge turned off. You can verify again anytime.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submittingVerif}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); removeVerification() }} disabled={submittingVerif}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {submittingVerif ? 'Removing...' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  const stats = [
    { value: posts.length, label: 'Posts' },
    { value: listings.length, label: 'Listings' },
    { value: products.length, label: 'Products' },
    { value: stories.length, label: 'Stories' },
  ]

  return (
    <div className="flex-1 min-w-0 pb-10">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleStoryFile} />

      {/* ------------------------------------------------ header (IG-style) */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-center gap-6 sm:gap-10">
          {/* Avatar with story ring when you have live stories */}
          <div
            className={cn(
              'rounded-full shrink-0',
              stories.length > 0 ? 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[3px]' : 'bg-muted-foreground/25 p-[3px]'
            )}
          >
            <div className="rounded-full bg-background p-[2px]">
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 overflow-hidden">
                {me.profilePicture ? (
                  <img src={me.profilePicture} alt={me.name} className="w-full h-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-primary/15 text-primary font-bold text-2xl">{me.name.charAt(0).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
            </div>
          </div>
          {/* Stats - Instagram puts them beside the avatar */}
          <div className="flex-1 grid grid-cols-4 gap-1 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{loading ? '·' : s.value}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <h1 className="text-base font-bold text-foreground flex items-center gap-1.5">
            {me.name}
            {me.verifiedLocal && <BadgeCheck className="w-4 h-4 text-primary" />}
            {me.idVerified && <BadgeCheck className="w-4 h-4 text-blue-500" aria-label="Verified with ID or passport" />}
          </h1>
          {(me as any).username && (
            <p className="text-sm text-muted-foreground flex items-center gap-1"><AtSign className="w-3.5 h-3.5" />{(me as any).username}</p>
          )}
          {me.headline && <p className="text-sm text-muted-foreground">{me.headline}</p>}
          {me.bio && <p className="mt-1 text-sm text-foreground/90 whitespace-pre-line">{me.bio}</p>}
          {me.location && (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary" />{me.location}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={shareProfile} variant="outline" className="w-9 shrink-0 h-9 rounded-lg p-0 justify-center" aria-label="Share profile" title="Share profile">
            <Share2 className="w-4 h-4" />
          </Button>
          <Button onClick={openEdit} variant="outline" className="flex-1 h-9 rounded-lg text-xs sm:text-sm">Edit profile</Button>
          <Button onClick={openVerification} variant="outline"
            className={cn('flex-1 h-9 rounded-lg text-xs sm:text-sm gap-1', isIdVerified && 'border-blue-500/40 text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-400')}>
            {isIdVerified ? <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" /> : <ShieldCheck className="w-4 h-4 text-primary shrink-0" />}
            {isIdVerified ? 'Verified' : 'Get verified'}
          </Button>
          <Button onClick={pickStoryImage} className="flex-1 h-9 rounded-lg text-xs sm:text-sm bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            <Camera className="w-4 h-4" /> New story
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------ stories row */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 mt-4">
        <div className="flex gap-3 sm:gap-4 overflow-x-auto py-1 scrollbar-thin">
          {/* Add / Your story */}
          <button onClick={pickStoryImage} className="shrink-0 flex flex-col items-center gap-1 w-16" aria-label="Add to your story">
            <div className="relative w-14 h-14 rounded-full border border-border flex items-center justify-center bg-accent/40">
              <Plus className="w-5 h-5 text-primary" />
              {stories.length > 0 && (
                <img src={stories[stories.length - 1].imageUrl} alt="" className="absolute inset-0 w-full h-full rounded-full object-cover opacity-40" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">Your story</span>
          </button>
          {stories.map((s, i) => (
            <button key={s.id} onClick={() => setViewerIndex(i)} className="shrink-0 flex flex-col items-center gap-1 w-16" aria-label={`Open story from ${timeAgo(s.createdAt)}`}>
              <div className="rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2.5px] w-14 h-14">
                <div className="rounded-full bg-background p-[1.5px] w-full h-full">
                  <img src={s.imageUrl} alt="Your story" className="w-full h-full rounded-full object-cover" loading="lazy" />
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">{timeAgo(s.createdAt).replace(' ago', '')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------- content tab strip */}
      {/* 5 sections - labels hidden on phones (icon-only, like Instagram) */}
      <div className="max-w-2xl mx-auto mt-4 border-t border-border">
        <div className="flex">
          {CONTENT_TABS.map((t) => {
            const Icon = t.icon
            const active = contentType === t.key
            return (
              <button
                key={t.key}
                onClick={() => setContentType(t.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] sm:text-xs font-semibold uppercase tracking-wider border-t-2 -mt-px transition-colors',
                  active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
                aria-current={active ? 'true' : undefined}
                aria-label={t.label}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------ manage grid */}
      <div className={cn('max-w-2xl mx-auto mt-1', contentType === 'saved' || contentType === 'network' ? 'px-4 sm:px-6' : 'px-1 sm:px-6')}>
        {contentType === 'products' && !loading && products.length > 0 && (
          <div className="flex justify-end pt-2 pb-1">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg text-xs" onClick={() => setAddProductOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Add product
            </Button>
          </div>
        )}
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your content...
          </div>
        ) : contentType === 'posts' ? (
          posts.length === 0 ? (
            <EmptyState icon={<ImageIcon className="w-7 h-7 text-primary/50" />} title="No posts yet"
              text="Share updates with your network from the Feed tab - they'll show up here where you can manage them." />
          ) : (
            <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
              {posts.map((p) => (
                <Tile key={p.id} imageUrl={p.imageUrl} onDelete={() => setConfirm({ kind: 'post', id: p.id, label: 'Post' })}
                  onOpen={() => setPostView(p)} ariaLabel="View post">
                  <p className="text-[10px] sm:text-xs text-white line-clamp-2 leading-snug">{p.content}</p>
                </Tile>
              ))}
            </div>
          )
        ) : contentType === 'listings' ? (
          listings.length === 0 ? (
            <EmptyState icon={<MapPin className="w-7 h-7 text-primary/50" />} title="No price listings yet"
              text="Post local prices from the Local prices tab - travelers rely on them, and you can edit or delete them here anytime." />
          ) : (
            <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
              {listings.map((l) => (
                <Tile key={l.id} imageUrl={l.imageUrl} onDelete={() => setConfirm({ kind: 'listing', id: l.id, label: 'Listing' })}
                  onOpen={() => onOpenListing(l.id)} ariaLabel="View listing">
                  <p className="text-[10px] sm:text-xs text-white font-medium truncate">{l.productName}</p>
                  <p className="text-[9px] sm:text-[10px] text-white/85 font-semibold">{priceLabel(l.priceMin, l.priceMax, l.currency)}</p>
                </Tile>
              ))}
            </div>
          )
        ) : contentType === 'saved' ? (
          renderSavedItems()
        ) : contentType === 'network' ? (
          <NetworkTab me={me} onMessage={onMessage} onRefreshUser={onUserChanged} />
        ) : products.length === 0 ? (
          <EmptyState icon={<Package className="w-7 h-7 text-primary/50" />} title="No products yet"
            text="List an item for sale and manage it here - travelers and locals browsing the marketplace will see it."
            action={
              <Button size="sm" onClick={() => setAddProductOpen(true)} className="mt-3 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="w-3.5 h-3.5" /> Add product
              </Button>
            } />
        ) : (
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
            {products.map((pr) => (
              <Tile key={pr.id} imageUrl={pr.imageUrl} onDelete={() => setConfirm({ kind: 'product', id: pr.id, label: 'Product' })}
                onOpen={() => setProductView(pr)} ariaLabel="View product">
                <p className="text-[10px] sm:text-xs text-white font-medium truncate">{pr.name}</p>
                <p className="text-[9px] sm:text-[10px] text-white/85 font-semibold">{pr.currency} {pr.price?.toLocaleString?.() ?? pr.price}</p>
              </Tile>
            ))}
          </div>
        )}
      </div>

      {/* --------------------------------------------- story viewer (dark) */}
      <Dialog open={viewerIndex >= 0} onOpenChange={(o) => { if (!o) setViewerIndex(-1) }}>
        <DialogContent className="max-w-[420px] w-[calc(100vw-2rem)] h-[80vh] p-0 bg-black border-0 overflow-hidden gap-0 [&>button]:hidden">
          <DialogTitle className="sr-only">Story</DialogTitle>
          {viewerIndex >= 0 && stories[viewerIndex] && (
            <div className="relative w-full h-full select-none">
              {/* progress segments */}
              <div className="absolute top-2 inset-x-2 z-20 flex gap-1">
                {stories.map((_, i) => (
                  <div key={i} className="h-0.5 flex-1 rounded-full overflow-hidden bg-white/30">
                    <div className={cn('h-full bg-white transition-all duration-500', i < viewerIndex ? 'w-full' : i === viewerIndex ? 'w-full' : 'w-0')} />
                  </div>
                ))}
              </div>
              {/* author + actions */}
              <div className="absolute top-5 inset-x-2 z-20 flex items-center gap-2">
                <Avatar className="w-7 h-7 overflow-hidden">
                  {stories[viewerIndex].author?.profilePicture ? (
                    <img src={stories[viewerIndex].author!.profilePicture!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary/30 text-white text-[10px] font-bold">{me.name.charAt(0).toUpperCase()}</AvatarFallback>
                  )}
                </Avatar>
                <span className="text-xs font-medium text-white">{me.name}</span>
                <span className="text-[10px] text-white/70">{timeAgo(stories[viewerIndex].createdAt)}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setConfirm({ kind: 'story', id: stories[viewerIndex].id, label: 'Story' })}
                    className="p-1.5 rounded-full hover:bg-white/15 text-white" aria-label="Delete story">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewerIndex(-1)} className="p-1.5 rounded-full hover:bg-white/15 text-white" aria-label="Close story">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* image */}
              <img src={stories[viewerIndex].imageUrl} alt="Story" className="absolute inset-0 w-full h-full object-contain" />
              {/* caption */}
              {stories[viewerIndex].caption && (
                <div className="absolute bottom-6 inset-x-4 z-20 text-center">
                  <p className="inline-block px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur text-white text-sm">{stories[viewerIndex].caption}</p>
                </div>
              )}
              {/* tap zones + arrows */}
              <button className="absolute inset-y-0 left-0 w-1/3 z-10 focus:outline-none" aria-label="Previous"
                onClick={() => setViewerIndex((i) => (i > 0 ? i - 1 : 0))} />
              <button className="absolute inset-y-0 right-0 w-2/3 z-10 focus:outline-none" aria-label="Next"
                onClick={() => setViewerIndex((i) => (i + 1 >= stories.length ? -1 : i + 1))} />
              {viewerIndex > 0 && (
                <button onClick={() => setViewerIndex((i) => Math.max(0, i - 1))} aria-label="Previous story"
                  className="hidden sm:flex absolute left-[-56px] top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-card shadow-md items-center justify-center text-foreground">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {viewerIndex < stories.length - 1 && (
                <button onClick={() => setViewerIndex((i) => i + 1)} aria-label="Next story"
                  className="hidden sm:flex absolute right-[-56px] top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-card shadow-md items-center justify-center text-foreground">
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- new story modal */}
      <Dialog open={!!newStoryImage} onOpenChange={(o) => { if (!o) { setNewStoryImage(null); setNewStoryCaption('') } }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">New story</DialogTitle>
          <h3 className="text-base font-bold text-foreground">New story</h3>
          <p className="text-xs text-muted-foreground -mt-1">Visible for 24 hours, then it disappears automatically.</p>
          {newStoryImage && <img src={newStoryImage} alt="Story preview" className="w-full max-h-[50vh] object-contain rounded-lg bg-black/5" />}
          <Input value={newStoryCaption} onChange={(e) => setNewStoryCaption(e.target.value)} placeholder="Add a caption (optional)" maxLength={300} />
          <Button onClick={shareStory} disabled={publishing} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {publishing ? 'Sharing...' : 'Share story'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------- post view dialog */}
      <Dialog open={!!postView} onOpenChange={(o) => { if (!o) setPostView(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Post</DialogTitle>
          {postView && (
            <div>
              {postView.imageUrl && <img src={postView.imageUrl} alt="" className="w-full max-h-72 object-cover rounded-lg mb-3" loading="lazy" />}
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{postView.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">{timeAgo(postView.createdAt)}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPostView(null)}>Close</Button>
                <Button variant="destructive" className="flex-1 gap-1.5" onClick={() => setConfirm({ kind: 'post', id: postView.id, label: 'Post' })}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------- product view dialog */}
      <Dialog open={!!productView} onOpenChange={(o) => { if (!o) setProductView(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Product</DialogTitle>
          {productView && (
            <div>
              {productView.imageUrl && <img src={productView.imageUrl} alt="" className="w-full max-h-72 object-cover rounded-lg mb-3" loading="lazy" />}
              <h3 className="text-base font-bold text-foreground">{productView.name}</h3>
              <p className="text-sm font-semibold text-primary">{productView.currency} {productView.price?.toLocaleString?.() ?? productView.price}</p>
              {productView.description && <p className="mt-2 text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{productView.description}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Listed {timeAgo(productView.createdAt)}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setProductView(null)}>Close</Button>
                <Button variant="destructive" className="flex-1 gap-1.5" onClick={() => setConfirm({ kind: 'product', id: productView.id, label: 'Product' })}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------- add product dialog */}
      <AddProductModal open={addProductOpen} onOpenChange={setAddProductOpen} onCreated={() => { fetchAll(); onUserChanged() }} />

      {/* -------------------------------------------------- saved post view */}
      <Dialog open={!!savedView} onOpenChange={(o) => { if (!o) setSavedView(null) }}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Saved post</DialogTitle>
          {savedView && (
            <div>
              {savedView.imageUrl && <img src={savedView.imageUrl} alt="" className="w-full max-h-72 object-cover rounded-lg mb-3" loading="lazy" />}
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{savedView.title}</p>
              {savedView.subtitle && <p className="mt-1 text-xs text-muted-foreground">by {savedView.subtitle}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Saved {timeAgo(new Date(savedView.savedAt).toISOString())} · kept on this device</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSavedView(null)}>Close</Button>
                <Button variant="destructive" className="flex-1 gap-1.5" onClick={() => { const v = savedView; setSavedView(null); if (v) handleUnsave(v) }}>
                  <Trash2 className="w-4 h-4" /> Remove
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ delete confirmation */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doDelete() }} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ------------------------------------------------------------- sub-components
function Tile({ imageUrl, children, onOpen, onDelete, ariaLabel }: {
  imageUrl?: string | null
  children: React.ReactNode
  onOpen: () => void
  onDelete: () => void
  ariaLabel: string
}) {
  return (
    <div className="relative aspect-square overflow-hidden bg-accent/40 group">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-emerald-500/10 to-teal-500/20 flex items-center justify-center">
          <ImageIcon className="w-7 h-7 text-primary/40" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-1.5 pt-8">
        {children}
      </div>
      <button onClick={onOpen} className="absolute inset-0" aria-label={ariaLabel} />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-destructive transition-colors"
        aria-label={`Delete - ${ariaLabel}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 px-6 text-center">
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-accent/50 flex items-center justify-center">{icon}</div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">{text}</p>
      {action}
    </div>
  )
}
