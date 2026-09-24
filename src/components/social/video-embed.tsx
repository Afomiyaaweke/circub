'use client'

// VideoEmbed - in-app player for pasted YouTube / Instagram video links.
// Renders a 16:9 lazy iframe; falls back to a plain link chip when the url
// does not parse (legacy rows or future platforms), so nothing ever breaks.

import { ExternalLink } from 'lucide-react'
import { parseVideoUrl } from '@/lib/video'

interface VideoEmbedProps {
  url: string
  title?: string
  className?: string
  /** Hide the fallback link chip (e.g. when the parent shows its own error). */
  quietFallback?: boolean
}

export function VideoEmbed({ url, title = 'Video', className, quietFallback }: VideoEmbedProps) {
  const parsed = parseVideoUrl(url)

  if (!parsed) {
    if (quietFallback || !url) return null
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">Watch video</span>
      </a>
    )
  }

  return (
    <div className={`relative w-full overflow-hidden rounded-lg border border-border bg-black ${className || ''}`} style={{ aspectRatio: '16 / 9' }}>
      <iframe
        src={parsed.embedUrl}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}
