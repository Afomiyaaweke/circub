'use client'

// CopyLinkButton - tiny client helper for server-rendered share pages.
// Copies the given link with the Web Share API when available (mobile),
// clipboard otherwise, with a prompt fallback for old browsers.

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CopyLinkButtonProps {
  url: string
  title: string
  text: string
  label?: string
}

export function CopyLinkButton({ url, title, text, label = 'Share guide link' }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
        return
      }
      throw new Error('no-share')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  return (
    <Button
      onClick={handleCopy}
      variant="outline"
      data-testid="guide-page-copy"
      className="gap-2 rounded-full"
    >
      {copied ? (
        <><Check className="w-4 h-4 text-emerald-600" />Link copied</>
      ) : (
        <><Share2 className="w-4 h-4" />{label}</>
      )}
      <Copy className="w-3.5 h-3.5 opacity-60" />
    </Button>
  )
}
