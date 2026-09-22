'use client'

import { useEffect, useState } from 'react'
import { Download, Link2, Loader2, Share2, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  buildSharePoster,
  posterFileName,
  posterShareText,
  type SharePosterTarget,
} from '@/lib/share-poster'

interface SharePosterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: SharePosterTarget | null
  linkUrl: string
}

/**
 * Share-to-social poster dialog (Task 77): renders the green futuristic
 * circub poster for a feed post or price post, then offers one-tap routes
 * to other social media - native share (with the PNG file on mobile),
 * WhatsApp, X, Telegram, Facebook, copy link and PNG download.
 */
export function SharePosterModal({ open, onOpenChange, target, linkUrl }: SharePosterModalProps) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null)
  const [building, setBuilding] = useState(false)
  const [nativeShare, setNativeShare] = useState(false)
  const { toast } = useToast()

  // Build the poster PNG whenever the dialog opens for a target. The raw Blob
  // is kept for download/native-share: fetching the blob: preview URL back is
  // blocked by the app's Content-Security-Policy (connect-src).
  useEffect(() => {
    if (!open || !target) return
    let revoked: string | null = null
    let cancelled = false
    setBuilding(true)
    setPosterUrl(null)
    setPosterBlob(null)
    buildSharePoster(target, linkUrl)
      .then((blob) => {
        if (cancelled) return
        if (blob) {
          setPosterBlob(blob)
          revoked = URL.createObjectURL(blob)
          setPosterUrl(revoked)
        }
      })
      .finally(() => {
        if (!cancelled) setBuilding(false)
      })
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [open, target, linkUrl])

  // Native share row only when the browser can share (mobile mostly).
  useEffect(() => {
    if (!open) return
    try {
      setNativeShare(typeof navigator !== 'undefined' && !!navigator.share)
    } catch {
      setNativeShare(false)
    }
  }, [open])

  if (!target) return null

  const text = posterShareText(target, linkUrl)
  const enc = encodeURIComponent
  const fileBase = posterFileName(target)

  const getBlob = async (): Promise<Blob | null> => {
    if (posterBlob) return posterBlob
    return buildSharePoster(target, linkUrl)
  }

  const handleDownload = async () => {
    try {
      const blob = await getBlob()
      if (!blob) throw new Error('Poster failed to render')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fileBase
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      toast({ title: 'Poster downloaded', description: 'Share it on any social media.' })
    } catch (e) {
      toast({ title: 'Download failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const handleNativeShare = async () => {
    try {
      const blob = await getBlob()
      const file = blob ? new File([blob], fileBase, { type: 'image/png' }) : undefined
      const payload: ShareData = { title: 'circub', text, url: linkUrl }
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ ...payload, files: [file] })
      } else {
        await navigator.share(payload)
      }
    } catch {
      /* user cancelled or share failed - silent */
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl)
      toast({ title: 'Link copied!', description: 'Paste it anywhere.' })
    } catch {
      window.prompt('Copy this link:', linkUrl)
    }
  }

  const openExternal = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="share-poster-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            Share poster
          </DialogTitle>
          <DialogDescription>
            A ready-made circub poster you can post on WhatsApp, X, Telegram, Facebook or stories.
          </DialogDescription>
        </DialogHeader>

        {/* Poster preview */}
        <div className="rounded-xl border border-border bg-accent/20 p-3 flex justify-center">
          {building && (
            <div className="h-[380px] flex flex-col items-center justify-center text-muted-foreground gap-2" data-testid="share-poster-loading">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-sm">Building your poster…</span>
            </div>
          )}
          {!building && posterUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              data-testid="share-poster-preview"
              src={posterUrl}
              alt="circub share poster"
              className="max-h-[380px] w-auto rounded-lg shadow-lg"
            />
          )}
        </div>

        {/* Share actions */}
        <div className="grid grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-14 flex-col gap-1 text-[11px]"
            data-testid="share-poster-whatsapp"
            onClick={() => openExternal(`https://wa.me/?text=${enc(`${text} ${linkUrl}`)}`)}
          >
            <MessageCircle className="w-4 h-4 text-green-600" />
            WhatsApp
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-14 flex-col gap-1 text-[11px]"
            data-testid="share-poster-x"
            onClick={() => openExternal(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(linkUrl)}`)}
          >
            <span className="font-bold text-sm leading-none">𝕏</span>
            <span>X</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-14 flex-col gap-1 text-[11px]"
            data-testid="share-poster-telegram"
            onClick={() => openExternal(`https://t.me/share/url?url=${enc(linkUrl)}&text=${enc(text)}`)}
          >
            <Send className="w-4 h-4 text-sky-500" />
            Telegram
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-14 flex-col gap-1 text-[11px]"
            data-testid="share-poster-facebook"
            onClick={() => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${enc(linkUrl)}`)}
          >
            <span className="font-bold text-sm leading-none text-blue-600">f</span>
            <span>Facebook</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button data-testid="share-poster-download" onClick={handleDownload} className="gap-1.5">
            <Download className="w-4 h-4" />
            Download poster
          </Button>
          <Button variant="outline" data-testid="share-poster-copy" onClick={handleCopy} className="gap-1.5">
            <Link2 className="w-4 h-4" />
            Copy link
          </Button>
        </div>

        {nativeShare && (
          <Button variant="secondary" data-testid="share-poster-native" onClick={handleNativeShare} className="w-full gap-1.5">
            <Share2 className="w-4 h-4" />
            More share options…
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
