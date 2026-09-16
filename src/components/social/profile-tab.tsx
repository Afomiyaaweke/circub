'use client'

// ============================================================================
// PROFILE TAB — Instagram-style profile section.
// Your avatar with a story ring, a stats row, a 24-hour Stories row
// (add / view / delete) and a manage grid for everything you have posted —
// feed posts, price listings, marketplace products — each one deletable
// straight from its tile, with a confirmation before it goes.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BadgeCheck, Camera, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2,
  MapPin, Package, Plus, Sparkles, Trash2, X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { compressImage } from '@/lib/image-compress'
import { dispatchAuthExpired } from '@/lib/auth-fetch'
import type { User } from '@/lib/types'

interface ProfileTabProps {
  me: User
  onEditProfile: () => void
  onOpenListing: (postId: string) => void
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

type ContentType = 'posts' | 'listings' | 'products'
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
  return min === max || max <= min ? `${currency} ${fmt(min)}` : `${currency} ${fmt(min)} – ${fmt(max)}`
}

const CONTENT_TABS: { key: ContentType; label: string; icon: typeof ImageIcon }[] = [
  { key: 'posts', label: 'Posts', icon: ImageIcon },
  { key: 'listings', label: 'Listings', icon: MapPin },
  { key: 'products', label: 'Products', icon: Package },
]

export function ProfileTab({ me, onEditProfile, onOpenListing, onUserChanged, onSignUp }: ProfileTabProps) {
  const { toast } = useToast()
  const isGuest = me.id === 'guest'

  const [posts, setPosts] = useState<MyPost[]>([])
  const [listings, setListings] = useState<MyListing[]>([])
  const [products, setProducts] = useState<MyProduct[]>([])
  const [stories, setStories] = useState<MyStory[]>([])
  const [loading, setLoading] = useState(!isGuest)

  const [contentType, setContentType] = useState<ContentType>('posts')

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

  // Auto-advance the story viewer every 6 seconds (Instagram-style)
  useEffect(() => {
    if (viewerIndex < 0) return
    const t = setTimeout(() => {
      setViewerIndex((i) => (i + 1 >= stories.length ? -1 : i + 1))
    }, 6000)
    return () => clearTimeout(t)
  }, [viewerIndex, stories.length])

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
            Posts, price listings, products and 24-hour stories — all in one place, like your favourite social app.
            Sign up free to make it yours.
          </p>
          <Button onClick={onSignUp} className="bg-primary hover:bg-primary/90 text-primary-foreground">Join circub — it's free</Button>
        </div>
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
          {/* Stats — Instagram puts them beside the avatar */}
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
          </h1>
          {me.headline && <p className="text-sm text-muted-foreground">{me.headline}</p>}
          {me.bio && <p className="mt-1 text-sm text-foreground/90 whitespace-pre-line">{me.bio}</p>}
          {me.location && (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary" />{me.location}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={onEditProfile} variant="outline" className="flex-1 h-9 rounded-lg text-sm">Edit profile</Button>
          <Button onClick={pickStoryImage} className="flex-1 h-9 rounded-lg text-sm bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
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
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------ manage grid */}
      <div className="max-w-2xl mx-auto px-1 sm:px-6 mt-1">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your content...
          </div>
        ) : contentType === 'posts' ? (
          posts.length === 0 ? (
            <EmptyState icon={<ImageIcon className="w-7 h-7 text-primary/50" />} title="No posts yet"
              text="Share updates with your network from the Feed tab — they'll show up here where you can manage them." />
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
              text="Post local prices from the Local prices tab — travelers rely on them, and you can edit or delete them here anytime." />
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
        ) : products.length === 0 ? (
          <EmptyState icon={<Package className="w-7 h-7 text-primary/50" />} title="No products yet"
            text="List an item for sale using the Add button on the Network tab — your marketplace items are managed here." />
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
                  className="hidden sm:flex absolute left-[-56px] top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-foreground">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {viewerIndex < stories.length - 1 && (
                <button onClick={() => setViewerIndex((i) => i + 1)} aria-label="Next story"
                  className="hidden sm:flex absolute right-[-56px] top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white shadow-md items-center justify-center text-foreground">
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
        aria-label={`Delete — ${ariaLabel}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="py-14 px-6 text-center">
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-accent/50 flex items-center justify-center">{icon}</div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">{text}</p>
    </div>
  )
}
