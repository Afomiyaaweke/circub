'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Heart, MessageSquare, Image as ImageIcon, Smile, Loader2, Sparkles, TrendingUp, Clock, Compass, Coffee, MapPin, Building2, Search } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { authFetch } from '@/lib/auth-fetch'
import { cn } from '@/lib/utils'
import type { User, Post, Comment } from '@/lib/types'

interface CommunityFeedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  me: User | null
}

type SortMode = 'recent' | 'top'

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
// real user posts once people start posting.
const SEED_POSTS: Post[] = [
  {
    id: 'seed-travel-agency',
    content: `How to find a reliable travel agency in your city:

1. Open the Local tab and search for "travel agent" or "agency"
2. Look for guides with the Travel Agent role badge (Plane icon)
3. Check their rating and helpful votes before booking
4. Tap Book to start an escrow-protected booking

Tip: verified locals (blue checkmark) have been confirmed as actually living there, so their recommendations come from real experience.`,
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
    content: `How to find a good coffee shop with real local prices:

1. Open PriceLens (the scanner) and point it at any coffee bag, menu, or cup
2. The AI identifies the item and shows the fair price range in your city
3. Switch to the Local tab to see what locals have posted about nearby cafés
4. Tap any local price card to see who posted it and message them for more

Tip: prices posted by verified locals carry a blue checkmark and a "Helpful" count, so you know which ones to trust.`,
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

/**
 * LinkedIn-style community feed, rendered as a slide-over panel from the
 * right side. The navbar stays visible at the top — the panel sits below it
 * so users can still navigate while reading the feed.
 */
export function CommunityFeedModal({ open, onOpenChange, me }: CommunityFeedModalProps) {
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
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/posts?limit=50')
      const data = await res.json()
      setPosts(data.posts || [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchPosts()
  }, [open, fetchPosts])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Merge seed posts with real posts (seeds first, then real posts by sort)
  const allPosts = [...SEED_POSTS, ...posts]
  const sortedPosts = sort === 'top'
    ? [...allPosts].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    : allPosts

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
    if (me?.id === 'guest') {
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
    if (me?.id === 'guest') {
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
    if (me?.id === 'guest') {
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

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Community feed">
      {/* Backdrop — click to close. Sits below the navbar so the navbar
          stays interactive. */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />

      {/* Slide-over panel from the right. Top is offset to leave the navbar
          visible (top-14 = 56px, the navbar height on most breakpoints).
          v224: the panel is a REAL feed column now - it takes most of the
          screen on every size (full width on phones, up to 800px on large
          desktops) so posts get the space Facebook-style cards need. */}
      <div className="absolute top-14 right-0 bottom-0 w-full sm:w-[540px] md:w-[680px] lg:w-[800px] bg-background shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-none">Community feed</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Tips, questions, and posts from the community</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSort('recent')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                sort === 'recent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              <Clock className="w-3 h-3" /> Recent
            </button>
            <button
              onClick={() => setSort('top')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                sort === 'top' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              <TrendingUp className="w-3 h-3" /> Top
            </button>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="ml-1 p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Composer */}
        <div className="px-4 py-3 border-b border-border bg-card shrink-0">
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
                >
                  {posting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Posting...</> : <><Send className="w-3.5 h-3.5" /> Post</>}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Feed — scrolls internally. v224: Facebook-style CARD feed - each
            post is its own rounded card with breathing room, instead of
            divider-flattened rows. */}
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-accent/10">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading posts...</span>
            </div>
          ) : sortedPosts.length === 0 ? (
            <div className="py-12 text-center px-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">No posts yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Share a tip or question to start the conversation.
              </p>
            </div>
          ) : (
            <ul className="p-3 sm:p-4 space-y-3">
              {sortedPosts.map((post) => {
                const liked = me ? post.likes.some((l) => l.userId === me.id) : false
                const showComments = openCommentsFor.has(post.id)
                const isSeed = post.id.startsWith('seed-')
                return (
                  <li key={post.id} className={cn(
                    'rounded-xl border bg-card p-4 shadow-sm transition-colors',
                    isSeed ? 'border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-border'
                  )}>
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
                        <p className="text-[11px] text-muted-foreground">{timeAgo(post.createdAt)}</p>
                        <p className="mt-1.5 text-[15px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {post.content}
                        </p>
                        {post.imageUrl && (
                          <div className="mt-2 rounded-lg overflow-hidden border border-border">
                            <img src={post.imageUrl} alt="" className="w-full max-h-96 object-cover" />
                          </div>
                        )}
                        {/* Like / Comment — full-width Facebook-style action bar */}
                        <div className="mt-3 flex items-center gap-2 border-t border-border pt-2">
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
    </div>,
    document.body
  )
}
