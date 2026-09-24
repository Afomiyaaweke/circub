'use client'

import { useState, useRef } from 'react'
import { Image as ImageIcon, Smile, Calendar, FileText, X, Send, Video, Camera, Link2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { authFetch, dispatchAuthExpired } from '@/lib/auth-fetch'
import { compressImage, compressVideo } from '@/lib/image-compress'
import { parseVideoUrl } from '@/lib/video'
import { VideoEmbed } from './video-embed'
import type { User, Post } from '@/lib/types'

interface PostComposerProps {
  user: User
  onPosted: (post: Post) => void
}

export function PostComposer({ user, onPosted }: PostComposerProps) {
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  // Video via link (YouTube / Instagram): toggle input, parse on attach.
  const [videoUrl, setVideoUrl] = useState('')
  const [videoInput, setVideoInput] = useState('')
  const [showVideoInput, setShowVideoInput] = useState(false)
  const { toast } = useToast()

  const handleUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      // Compress client-side first: photos downscale to ~200-400 KB, longer
      // video clips get re-encoded so the stored data URL fits request limits.
      const isVideo = file.type.startsWith('video/')
      const ready = isVideo ? await compressVideo(file) : await compressImage(file, 1600, 0.82)
      const fd = new FormData()
      fd.append('file', ready)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Upload failed')
      }
      const data = await res.json()
      setImageUrl(data.url)
      setOpen(true)
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  // Attach a pasted YouTube / Instagram link: validate before accepting so
  // the user learns immediately (the API would 400 otherwise).
  const attachVideoLink = () => {
    const raw = videoInput.trim()
    if (!raw) return
    const parsed = parseVideoUrl(raw)
    if (!parsed) {
      toast({ title: 'Video link must be a YouTube or Instagram link', variant: 'destructive' })
      return
    }
    setVideoUrl(parsed.canonicalUrl)
    setVideoInput('')
    setShowVideoInput(false)
  }

  const handleSubmit = async () => {
    // Guest users can't post - prompt them to register
    if (user.id === 'guest') {
      toast({
        title: 'Sign up to post',
        description: 'Create a free account to share posts with the community.',
        variant: 'destructive',
      })
      window.dispatchEvent(new CustomEvent('circub:auth-expired'))
      return
    }
    if (!content.trim() && !imageUrl && !videoUrl) {
      toast({
        title: 'Empty post',
        description: 'Write something or attach an image.',
        variant: 'destructive',
      })
      return
    }
    // Client-side guard mirroring the API: only YouTube / Instagram links.
    if (videoUrl && !parseVideoUrl(videoUrl)) {
      toast({ title: 'Video link must be a YouTube or Instagram link', variant: 'destructive' })
      return
    }
    setPosting(true)
    try {
      const res = await authFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, imageUrl, videoUrl: videoUrl || undefined }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to post')
      }
      const data = await res.json()
      toast({ title: 'Posted to your feed' })
      setContent('')
      setImageUrl('')
      setVideoUrl('')
      setVideoInput('')
      setShowVideoInput(false)
      setOpen(false)
      onPosted(data.post)
    } catch (e) {
      toast({
        title: 'Post failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setPosting(false)
    }
  }

  // Guests cannot post at all (Task 76): instead of a usable composer with a
  // submit-time wall, they see a locked card with a sign-up call to action.
  // The CTA dispatches the auth-expired event, which page.tsx turns into the
  // Register modal for guests ("Sign up to continue"). Placed after all hooks
  // so their order stays stable between guest and non-guest renders.
  if (user.id === 'guest') {
    return (
      <div data-testid="composer-locked" className="bg-card rounded-xl shadow-sm border border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-11 h-11 border-2 border-accent">
            <AvatarFallback className="bg-primary/15 text-primary font-semibold">G</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Sign up to post</p>
            <p className="text-xs text-muted-foreground">Guests can browse everything · posting needs a free account. It takes 10 seconds.</p>
          </div>
          <Button
            size="sm"
            data-testid="composer-locked-cta"
            className="shrink-0"
            onClick={() => dispatchAuthExpired('guest-post')}
          >
            Sign up free
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-4">
      <div className="flex items-start gap-3">
        <Avatar className="w-11 h-11 border-2 border-accent">
          <AvatarFallback className="bg-primary/15 text-primary font-semibold">
            {user.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setOpen(true)}
            className="w-full text-left bg-accent/30 hover:bg-accent/50 transition-colors rounded-full px-4 py-3 text-sm text-muted-foreground"
          >
            Start a post, {user.name}...
          </button>

          {open && (
            <div className="mt-3">
              <Textarea
                autoFocus
                placeholder="Share an update, ask a question, or post a product listing..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[100px] resize-y bg-card border-border"
              />

              {imageUrl && (
                <div className="relative mt-2 rounded-lg overflow-hidden border border-border">
                  {imageUrl.startsWith('data:video') ? (
                    <video src={imageUrl} controls className="w-full max-h-64 object-contain bg-black" />
                  ) : (
                    <img src={imageUrl} alt="Preview" className="w-full max-h-64 object-cover" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0 bg-card/90 hover:bg-card"
                    onClick={() => setImageUrl('')}
                    aria-label="Remove"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {/* Attached video link (YouTube / Instagram) with inline preview */}
              {videoUrl && parseVideoUrl(videoUrl) && (
                <div className="relative mt-2" data-testid="composer-video-preview">
                  <VideoEmbed url={videoUrl} title="Attached video" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0 bg-card/90 hover:bg-card"
                    onClick={() => { setVideoUrl(''); setVideoInput(''); setShowVideoInput(false) }}
                    aria-label="Remove video"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {showVideoInput && !videoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    data-testid="composer-video-input"
                    autoFocus
                    placeholder="Paste a YouTube or Instagram link..."
                    value={videoInput}
                    onChange={(e) => setVideoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        attachVideoLink()
                      }
                    }}
                    className="h-9 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={attachVideoLink} className="shrink-0 gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />Attach
                  </Button>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                    ref={fileRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <span className="hidden sm:inline">Photo</span>
                  </button>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
                    ref={videoRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                      if (videoRef.current) videoRef.current.value = ''
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => videoRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Video className="w-4 h-4 text-emerald-500" />
                    <span className="hidden sm:inline">Video</span>
                  </button>
                  <button
                    type="button"
                    data-testid="composer-video-link-btn"
                    onClick={() => setShowVideoInput((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Link2 className="w-4 h-4 text-sky-500" />
                    <span className="hidden sm:inline">Video link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContent((c) => c + ' 😊')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Smile className="w-4 h-4 text-amber-500" />
                    <span className="hidden sm:inline">Feeling</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = prompt('Schedule date (e.g. "Tomorrow at 3pm")')
                      if (date) setContent((c) => (c ? c + '\n' : '') + `📅 ${date}`)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span className="hidden sm:inline">Schedule</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpen(false)
                      setContent('')
                      setImageUrl('')
                      setVideoUrl('')
                      setVideoInput('')
                      setShowVideoInput(false)
                    }}
                    disabled={posting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={posting || uploading || (!content.trim() && !imageUrl && !videoUrl)}
                    className="bg-primary hover:bg-primary/90 gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {posting ? 'Posting...' : 'Post'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!open && (
            <div className="mt-3 flex items-center gap-1 flex-wrap">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                ref={fileRef}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    handleUpload(f)
                    setOpen(true)
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-primary" />
                <span>Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Video className="w-4 h-4 text-emerald-500" />
                <span>Video</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Write article</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
