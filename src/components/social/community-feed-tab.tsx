'use client'

// v225: the community feed as a REAL TAB - the same full-space layout the
// Battle (feed) and Local tabs get, replacing the v224 slide-over panel the
// user found too cramped ("make the feed take more space like the link and
// battle"). Facebook-style: a centered post column (up to 680px) inside the
// full content area, a composer on top, and per-post actions:
//   Like / Comment / Share (copy a deep link) / Save (bookmark)
// Authors can also EDIT or DELETE their own posts inline (the PATCH/DELETE
// /api/posts/[id] endpoints existed already - this adds the UI).

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Heart, MessageSquare, Image as ImageIcon, Smile, Loader2, Sparkles,
  TrendingUp, Clock, Search, Bookmark, Share2, Pencil, Trash2, X,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/auth-fetch'
import { cn } from '@/lib/utils'
import type { User, Post, Comment } from '@/lib/types'

interface CommunityFeedTabProps {
  me: User | null
  // ?community=<id> deep link - scroll to + flash one post, then clear.
  highlightPostId?: string | null
  onHighlightDone?: () => void
}

type SortMode = 'recent' | 'top' | 'saved'

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = Math.floor((now - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  return date.toLocaleDateString()
}

// Seed posts shown when the feed is empty or as starter content.
// These are helpful "how-to" tips a local guide would post — exactly the
// kind of content the user asked for ("how to get a travel agency, how to
// get a coffee shop"). They render at the top of the feed and mix in with
// real user posts once people start posting. Seeds are display-only: they
// cannot be edited, deleted, shared or saved.
const SEED_POSTS: Post[] = [
  {
    id: 'seed-travel-agency',
    content: `How to find a reliable travel agency in your city:

1. Ask two recent customers — not the agency's own testimonials
2. Check they give a written itinerary BEFORE you pay anything
3. Pay a small deposit, never the full amount up front
4. Compare the same itinerary with a second agency — prices vary a lot

Post the quotes you get below and the community will tell you if they are fair.`,
    imageUrl: null,
    authorId: 'seed',
    author: {
      id: 'seed-1',
      name: 'circubAwd Guides',
      avatarColor: 'teal',
      headline: 'Official tips',
      location: null,
    },
    likes: [],
    reposts: [],
    comments: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'seed-coffee-shop',
    content: `Thinking of opening a coffee shop? The real checklist from locals who did it:

• Location first: foot traffic beats cheap rent every time
• Count the morning rush — stand outside 7-9am and count passers-by
• A used espresso machine saves you 60% vs new — ask me where
• Register the business BEFORE signing the lease (some landlords help with permits)

Ask anything in the comments — the guides here have opened shops in 12 cities.`,
    imageUrl: null,
    authorId: 'seed',
    author: {
      id: 'seed-2',
      name: 'circubAwd Guides',
      avatarColor: 'teal',
      headline: 'Official tips',
      location: null,
    },
    likes: [],
    reposts: [],
    comments: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: 'seed-deals-hunt',
    content: `3 ways to use circubAwd like a pro:

1. Scan before you buy — PriceLens tells you if the asking price is fair in your area
2. Follow locals in your city — their price posts show up in your Local feed automatically
3. Ask a guide — tap "Ask a local guide" on any scan result to get a human answer from someone who lives there

The Battle tab ranks the top deal-hunters each week. Post a price yourself to climb the leaderboard and earn stickers.`,
    imageUrl: null,
    authorId: 'seed',
    author: {
      id: 'seed-3',
      name: 'circubAwd Guides',
      avatarColor: 'teal',
      headline: 'Official tips',
      location: null,
    },
    likes: [],
    reposts: [],
    comments: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
]

export function CommunityFeedTab({ me, highlightPostId, onHighlightDone }: CommunityFeedTabProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sort, setSort] = useState<SortMode>('recent')
  const [openCommentsFor, setOpenCommentsFor] = useState<Set<string>>(new Set())
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [submittingCommentFor, setSubmittingCommentFor] = useState<string | null>(null)
  const [likingId, setLikingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  // Inline edit state - one post at a time, Facebook-style
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Flash highlight for deep-linked posts
  const [flashId, setFlashId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const fetchPosts = useCallback(async (mode: SortMode) => {
    setLoading(true)
    try {
      const qs = mode === 'saved' ? '?limit=50&saved=1' : '?limit=50'
      const res = await fetch(`/api/posts${qs}`)
      const data = await res.json()
      setPosts(data.posts || [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts(sort)
  }, [sort, fetchPosts])

  // Deep link: ?community=<postId> — once posts are in, scroll to the post
  // and flash it so the recipient of a shared link sees exactly which post
  // was meant. Runs for any sort mode where the post exists in the list.
  useEffect(() => {
    if (!highlightPostId || loading) return
    const el = document.querySelector(`[data-post-id="${highlightPostId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashId(highlightPostId)
      const t = setTimeout(() => {
        setFlashId(null)
        onHighlightDone?.()
      }, 2600)
      return () => clearTimeout(t)
    }
    // Post not in the current list (e.g. Saved filter) — clear anyway.
    onHighlightDone?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPostId, loading])

  // Merge seed posts with real posts (seeds first, then real posts by sort).
  // Seeds never appear in the Saved filter - they cannot be bookmarked.
  const allPosts = sort === 'saved' ? posts : [...SEED_POSTS, ...posts]
  const sortedPosts = sort === 'top'
    ? [...allPosts].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    : allPosts

  const isGuest = me?.id === 'guest'

  const handleUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Upload failed')
      }
      const data = await res.json()
      setImageUrl(data.url)
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handlePost = async () => {
    if (isGuest) {
      toast({ title: 'Sign up to post', description: 'Create a free account to join the conversation.', variant: 'destructive' })
      window.dispatchEvent(new CustomEvent('circub:auth-expired'))
      return
    }
    if (!draft.trim() && !imageUrl) {
      toast({ title: 'Empty post', description: 'Write something or attach an image.', variant: 'destructive' })
      return
    }
    setPosting(true)
    try {
      const res = await authFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft, imageUrl }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to post')
      }
      const data = await res.json()
      setPosts((prev) => [data.post, ...prev])
      setDraft('')
      setImageUrl('')
      toast({ title: 'Posted to the community feed' })
    } catch (e) {
      toast({ title: 'Post failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setPosting(false)
    }
  }

  const handleLike = async (postId: string) => {
    // Seed posts can't be liked via the API — just toggle locally
    if (postId.startsWith('seed-')) {
      setPosts((prev) => {
        // seed posts live in SEED_POSTS, not in `posts` state; toggle in a
        // local-likes map by mutating the seed array reference.
        const seed = SEED_POSTS.find((p) => p.id === postId)
        if (seed) {
          const already = seed.likes.some((l) => l.userId === me?.id)
          seed.likes = already ? seed.likes.filter((l) => l.userId !== me!.id) : [...seed.likes, { id: 'me', userId: me!.id }]
        }
        return [...prev]
      })
      return
    }
    if (isGuest) {
      window.dispatchEvent(new CustomEvent('circub:auth-expired'))
      return
    }
    setLikingId(postId)
    try {
      const res = await authFetch(`/api/posts/${postId}/like`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likes: data.liked ? [...p.likes, { id: 'me', userId: me!.id }] : p.likes.filter((l) => l.userId !== me!.id) } : p))
    } catch {
      /* ignore */
    } finally {
      setLikingId(null)
    }
  }

  const handleComment = async (postId: string) => {
    const text = (commentDrafts[postId] || '').trim()
    if (!text) return
    // Seed posts can't receive real comments via API — add locally
    if (postId.startsWith('seed-')) {
      const seed = SEED_POSTS.find((p) => p.id === postId)
      if (seed) {
        seed.comments = [...seed.comments, {
          id: `local-${Date.now()}`,
          content: text,
          authorId: me?.id || 'guest',
          author: { id: me?.id || 'guest', name: me?.name || 'You', avatarColor: 'teal', headline: me?.headline || null },
          createdAt: new Date().toISOString(),
        } as Comment]
      }
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
      setPosts((prev) => [...prev])
      return
    }
    if (isGuest) {
      window.dispatchEvent(new CustomEvent('circub:auth-expired'))
      return
    }
    setSubmittingCommentFor(postId)
    try {
      const res = await authFetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      const data = await res.json()
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments: [...p.comments, data.comment] } : p))
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
    } catch (e) {
      toast({ title: 'Comment failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSubmittingCommentFor(null)
    }
  }

  const toggleComments = (postId: string) => {
    setOpenCommentsFor((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  // Share: hand out a deep link (?community=<id>). Whoever opens it lands
  // on the community feed with THIS post flashed - even when logged out the
  // link still shows the feed (sign-in prompt comes first, the tab after).
  const handleShare = async (post: Post) => {
    if (post.id.startsWith('seed-')) return
    setSharingId(post.id)
    try {
      const url = `${window.location.origin}/?community=${post.id}`
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ title: 'circubAwd community post', text: post.content.slice(0, 120), url })
          return
        } catch (err) {
          // User cancelled the native sheet - not an error, just stop here.
          if ((err as any)?.name === 'AbortError') return
          // Otherwise fall through to clipboard.
        }
      }
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copied', description: 'Paste it anywhere to share this post.' })
    } catch {
      toast({ title: 'Could not share', description: 'Copy the link from the address bar instead.', variant: 'destructive' })
    } finally {
      setSharingId(null)
    }
  }

  // Save (bookmark): toggles PostSave; the Saved filter reads the same rows.
  const handleSave = async (postId: string) => {
    if (isGuest) {
      window.dispatchEvent(new CustomEvent('circub:auth-expired'))
      return
    }
    setSavingId(postId)
    try {
      const res = await authFetch(`/api/posts/${postId}/save`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      setPosts((prev) => prev.map((p) => p.id === postId ? {
        ...p,
        saves: data.saved
          ? [...(p.saves || []), { id: 'me', userId: me!.id }]
          : (p.saves || []).filter((s) => s.userId !== me!.id),
      } : p))
      toast({ title: data.saved ? 'Saved' : 'Removed from saved' })
    } catch {
      /* ignore */
    } finally {
      setSavingId(null)
    }
  }

  // Edit own post inline (PATCH /api/posts/[id] - author-checked server-side)
  const startEdit = (post: Post) => {
    setEditingId(post.id)
    setEditDraft(post.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const saveEdit = async (postId: string) => {
    const content = editDraft.trim()
    if (!content) return
    setEditSaving(true)
    try {
      const res = await authFetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to save')
      }
      const data = await res.json()
      setPosts((prev) => prev.map((p) => p.id === postId ? data.post : p))
      setEditingId(null)
      setEditDraft('')
      toast({ title: 'Post updated' })
    } catch (e) {
      toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setEditSaving(false)
    }
  }

  // Delete own post (DELETE /api/posts/[id] - author-checked server-side)
  const handleDelete = async (postId: string) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setDeletingId(postId)
    try {
      const res = await authFetch(`/api/posts/${postId}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to delete')
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      toast({ title: 'Post deleted' })
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4 w-full min-w-0 flex-1" data-testid="community-root">
      {/* Tab header - stacks on phones so the title and sort chips both
          get full width (no mid-word wrapping at 390px). */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground leading-tight">Community feed</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Tips, questions, and posts from the community</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-thin -mx-1 px-1">
          <button
            onClick={() => setSort('recent')}
            data-testid="community-sort-recent"
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
              sort === 'recent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <Clock className="w-3.5 h-3.5" /> Recent
          </button>
          <button
            onClick={() => setSort('top')}
            data-testid="community-sort-top"
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
              sort === 'top' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Top
          </button>
          <button
            onClick={() => setSort('saved')}
            data-testid="community-sort-saved"
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
              sort === 'saved' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
            aria-label="Saved posts"
          >
            <Bookmark className="w-3.5 h-3.5" /> Saved
          </button>
        </div>
      </div>

      {/* Facebook-style centered post column - the full tab width is
          available on every screen; posts stay a readable 680px. */}
      <div className="max-w-[680px] mx-auto space-y-3 pb-4">
        {/* Composer */}
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-sm" data-testid="community-composer">
          <div className="flex items-start gap-3">
            <Avatar className="w-10 h-10 border-2 border-accent shrink-0 overflow-hidden">
              {(me as any)?.profilePicture ? (
                <img src={(me as any).profilePicture} alt={me?.name || 'You'} className="w-full h-full object-cover" />
              ) : (
                <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                  {me?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <Textarea
                placeholder={`What's on your mind, ${me?.name?.split(' ')[0] || '...'}?`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[72px] resize-y bg-background border-border text-[15px]"
                data-testid="community-composer-input"
              />
              {imageUrl && (
                <div className="relative mt-2 rounded-lg overflow-hidden border border-border">
                  <img src={imageUrl} alt="Preview" className="w-full max-h-48 object-cover" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1.5 right-1.5 h-6 w-6 p-0 bg-white/90 hover:bg-white"
                    onClick={() => setImageUrl('')}
                    aria-label="Remove"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    ref={fileRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 text-primary" />}
                    <span>Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((c) => c + ' 😊')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Smile className="w-3.5 h-3.5 text-amber-500" />
                    <span>Emoji</span>
                  </button>
                </div>
                <Button
                  onClick={handlePost}
                  disabled={posting || uploading || (!draft.trim() && !imageUrl)}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 gap-1.5"
                  data-testid="community-post-btn"
                >
                  {posting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Posting...</> : <><Send className="w-3.5 h-3.5" /> Post</>}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground bg-card rounded-xl border border-border">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading posts...</span>
          </div>
        ) : sortedPosts.length === 0 ? (
          <div className="py-12 text-center px-6 bg-card rounded-xl border border-border">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
              {sort === 'saved' ? <Bookmark className="w-5 h-5 text-primary" /> : <Search className="w-5 h-5 text-primary" />}
            </div>
            <p className="text-sm font-medium text-foreground">
              {sort === 'saved' ? 'No saved posts yet' : 'No posts yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              {sort === 'saved'
                ? 'Tap the bookmark icon on any post to keep it here for later.'
                : 'Share a tip or question to start the conversation.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sortedPosts.map((post) => {
              const liked = me ? post.likes.some((l) => l.userId === me.id) : false
              const saved = me ? (post.saves || []).some((s) => s.userId === me.id) : false
              const showComments = openCommentsFor.has(post.id)
              const isSeed = post.id.startsWith('seed-')
              // Only the poster can edit/delete their own post - checked
              // again server-side on every PATCH/DELETE.
              const isOwn = !isSeed && !!me && !isGuest && post.authorId === me.id
              const isEditing = editingId === post.id
              return (
                <li
                  key={post.id}
                  data-post-id={post.id}
                  className={cn(
                    'rounded-xl border bg-card p-4 shadow-sm transition-all',
                    isSeed ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-border',
                    flashId === post.id && 'ring-2 ring-primary shadow-lg'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10 border border-accent shrink-0 overflow-hidden">
                      {(post.author as any).profilePicture ? (
                        <img src={(post.author as any).profilePicture} alt={post.author.name} className="w-full h-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                          {post.author.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] flex-wrap">
                            <span className="font-semibold text-foreground">{post.author.name}</span>
                            {isSeed && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                <Sparkles className="w-2.5 h-2.5" /> TIP
                              </span>
                            )}
                            {post.author.headline && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground truncate">{post.author.headline}</span>
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{timeAgo(post.createdAt)}{!isSeed && (post as any).updatedAt && isOwn ? ' · edited' : ''}</p>
                        </div>
                        {/* Author-only Edit / Delete (visible, one tap each) */}
                        {isOwn && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => (isEditing ? cancelEdit() : startEdit(post))}
                              data-testid="community-edit-btn"
                              aria-label="Edit post"
                              title="Edit post"
                              className={cn(
                                'p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
                                isEditing && 'bg-accent text-foreground'
                              )}
                            >
                              {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDelete(post.id)}
                              disabled={deletingId === post.id}
                              data-testid="community-delete-btn"
                              aria-label="Delete post"
                              title="Delete post"
                              className="p-1.5 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition-colors"
                            >
                              {deletingId === post.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="mt-2">
                          <Textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="min-h-[96px] resize-y bg-background border-border text-[15px]"
                            data-testid="community-edit-input"
                            autoFocus
                          />
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={cancelEdit} data-testid="community-cancel-edit">
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(post.id)}
                              disabled={editSaving || !editDraft.trim() || editDraft.trim() === post.content}
                              className="bg-primary hover:bg-primary/90 gap-1.5"
                              data-testid="community-save-changes"
                            >
                              {editSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Send className="w-3.5 h-3.5" /> Save changes</>}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-1.5 text-[15px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
                            {post.content}
                          </p>
                          {post.imageUrl && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-border">
                              <img src={post.imageUrl} alt="" className="w-full max-h-96 object-cover" />
                            </div>
                          )}
                        </>
                      )}

                      {/* Like / Comment / Share / Save — full-width Facebook-style action bar */}
                      <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
                        <button
                          onClick={() => handleLike(post.id)}
                          disabled={likingId === post.id}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors hover:bg-accent',
                            liked ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'
                          )}
                        >
                          <Heart className={cn('w-4 h-4', liked && 'fill-current')} />
                          Like{post.likes?.length ? ` · ${post.likes.length}` : ''}
                        </button>
                        <button
                          onClick={() => toggleComments(post.id)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Comment{post.comments?.length ? ` · ${post.comments.length}` : ''}
                        </button>
                        {!isSeed && (
                          <button
                            onClick={() => handleShare(post)}
                            disabled={sharingId === post.id}
                            data-testid="community-share-btn"
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          >
                            {sharingId === post.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                            Share
                          </button>
                        )}
                        {!isSeed && (
                          <button
                            onClick={() => handleSave(post.id)}
                            disabled={savingId === post.id}
                            data-testid="community-save-btn"
                            aria-label={saved ? 'Unsave post' : 'Save post'}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors hover:bg-accent',
                              saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Bookmark className={cn('w-4 h-4', saved && 'fill-current')} />
                            {saved ? 'Saved' : 'Save'}
                          </button>
                        )}
                      </div>

                      {showComments && (
                        <div className="mt-2 space-y-2 pl-2 border-l-2 border-accent">
                          {post.comments?.map((c: Comment) => (
                            <div key={c.id} className="flex items-start gap-2">
                              <Avatar className="w-6 h-6 border border-accent shrink-0 overflow-hidden">
                                {(c.author as any).profilePicture ? (
                                  <img src={(c.author as any).profilePicture} alt={c.author.name} className="w-full h-full object-cover" />
                                ) : (
                                  <AvatarFallback className="bg-primary/15 text-primary text-[9px] font-semibold">
                                    {c.author.name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                )}
                              </Avatar>
                              <div className="flex-1 min-w-0 bg-accent/40 rounded-lg px-2.5 py-1.5">
                                <div className="flex items-center gap-1 text-[11px]">
                                  <span className="font-semibold text-foreground">{c.author.name}</span>
                                  <span className="text-muted-foreground">· {timeAgo(c.createdAt)}</span>
                                </div>
                                <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Write a comment..."
                              value={commentDrafts[post.id] || ''}
                              onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleComment(post.id)
                                }
                              }}
                              className="flex-1 h-8 px-2.5 text-xs rounded-full bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <button
                              onClick={() => handleComment(post.id)}
                              disabled={submittingCommentFor === post.id || !(commentDrafts[post.id] || '').trim()}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                              aria-label="Send comment"
                            >
                              {submittingCommentFor === post.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
