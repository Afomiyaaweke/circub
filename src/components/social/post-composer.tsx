'use client'

import { useState, useRef } from 'react'
import { Image as ImageIcon, Smile, Calendar, FileText, X, Send, Video } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
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
  const { toast } = useToast()

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

  const handleSubmit = async () => {
    if (!content.trim() && !imageUrl) {
      toast({
        title: 'Empty post',
        description: 'Write something or attach an image.',
        variant: 'destructive',
      })
      return
    }
    setPosting(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, imageUrl }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to post')
      }
      const data = await res.json()
      toast({ title: 'Posted to your feed' })
      setContent('')
      setImageUrl('')
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
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full max-h-64 object-cover"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-7 w-7 p-0 bg-white/90 hover:bg-white"
                    onClick={() => setImageUrl('')}
                    aria-label="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
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
                  <button
                    type="button"
                    onClick={() =>
                      toast({ title: 'Coming soon', description: 'Video uploads coming soon.' })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Video className="w-4 h-4 text-emerald-500" />
                    <span className="hidden sm:inline">Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setContent((c) => c + ' 😊')
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Smile className="w-4 h-4 text-amber-500" />
                    <span className="hidden sm:inline">Feeling</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      toast({ title: 'Coming soon', description: 'Schedule for later.' })
                    }
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
                    }}
                    disabled={posting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={posting || uploading || (!content.trim() && !imageUrl)}
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
                accept="image/png,image/jpeg,image/webp,image/gif"
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
