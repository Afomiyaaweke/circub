'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Heart, MessageSquare, Image as ImageIcon, Smile, Loader2, Sparkles, TrendingUp, Clock, Globe } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
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

/**
 * A LinkedIn/Reddit-style community posting site. Replaces the old private
 * DM modal for the header "Feed" button. Users can:
 *   - Post publicly (text + image)
 *   - See everyone's posts in reverse-chronological or top-liked order
 *   - Like and comment inline
 *
 * The whole thing is shown inside a wide dialog so it feels like its own
 * community board.
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

  // Sort posts: top = by likes desc, recent = by createdAt desc (already API order)
  const sortedPosts = sort === 'top'
    ? [...posts].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    : posts

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Community feed</DialogTitle>

        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-none">Community feed</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Public posts from everyone</p>
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
        <div className="px-4 py-3 border-b border-border bg-card">
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
                placeholder={`Share something with the community, ${me?.name?.split(' ')[0] || '...'}...`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[60px] resize-y bg-background border-border text-sm"
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
                    <span className="hidden sm:inline">Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((c) => c + ' 😊')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Smile className="w-3.5 h-3.5 text-amber-500" />
                    <span className="hidden sm:inline">Emoji</span>
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

        {/* Feed */}
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-accent/10">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Loading posts...</span>
            </div>
          ) : sortedPosts.length === 0 ? (
            <div className="py-12 text-center px-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">No posts yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                Be the first to share something with the community.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sortedPosts.map((post) => {
                const liked = me ? post.likes.some((l) => l.userId === me.id) : false
                const showComments = openCommentsFor.has(post.id)
                return (
                  <li key={post.id} className="px-4 py-3 hover:bg-card/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-9 h-9 border border-accent shrink-0 overflow-hidden">
                        {(post.author as any).profilePicture ? (
                          <img src={(post.author as any).profilePicture} alt={post.author.name} className="w-full h-full object-cover" />
                        ) : (
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                            {post.author.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-semibold text-foreground">{post.author.name}</span>
                          {post.author.headline && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground truncate">{post.author.headline}</span>
                            </>
                          )}
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{timeAgo(post.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                          {post.content}
                        </p>
                        {post.imageUrl && (
                          <div className="mt-2 rounded-lg overflow-hidden border border-border">
                            <img src={post.imageUrl} alt="" className="w-full max-h-80 object-cover" />
                          </div>
                        )}
                        {/* Actions */}
                        <div className="mt-2 flex items-center gap-4">
                          <button
                            onClick={() => handleLike(post.id)}
                            disabled={likingId === post.id}
                            className={cn(
                              'flex items-center gap-1 text-xs font-medium transition-colors',
                              liked ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500'
                            )}
                          >
                            <Heart className={cn('w-3.5 h-3.5', liked && 'fill-current')} />
                            {post.likes?.length || 0}
                          </button>
                          <button
                            onClick={() => toggleComments(post.id)}
                            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {post.comments?.length || 0}
                          </button>
                        </div>

                        {/* Comments */}
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
                            {/* Comment composer */}
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
      </DialogContent>
    </Dialog>
  )
}
