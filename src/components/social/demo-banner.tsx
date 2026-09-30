'use client'

import { Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DemoBannerProps {
  onSignUp: () => void
  onExit: () => void
}

/**
 * The persistent "Demo view" banner - shown across the whole dashboard while
 * someone is browsing the read-only demo. Deliberately BOLD (solid amber,
 * big type, DEMO chip) and pinned together with the header in a sticky stack
 * so the mode is unmissable at every scroll position: this is not an
 * account, it is a look-only demo, and every write attempt is answered with
 * the registration form.
 */
export function DemoBanner({ onSignUp, onExit }: DemoBannerProps) {
  return (
    <div
      data-testid="demo-banner"
      className="flex items-center gap-2.5 sm:gap-3 border-b-2 border-amber-500/60 bg-amber-400 px-3 py-3 text-amber-950 sm:px-6"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-950 text-amber-400" aria-hidden="true">
        <Eye className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug sm:text-base">
        <span
          data-testid="demo-banner-chip"
          className="mr-2 inline-block rounded bg-amber-950 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-widest text-amber-400 sm:text-xs"
        >
          Demo
        </span>
        <span className="font-extrabold">Demo view — read only.</span>{' '}
        <span className="font-semibold">
          You cannot post, vote, message, or join as a guide. Register first — it is free and takes 10 seconds.
        </span>
      </p>
      <Button
        data-testid="demo-signup"
        onClick={onSignUp}
        size="sm"
        className="h-8 shrink-0 bg-amber-950 px-2.5 text-xs font-bold text-amber-50 hover:bg-amber-900 sm:px-4 sm:text-sm dark:bg-amber-950 dark:text-amber-50 dark:hover:bg-amber-900"
      >
        Register now
      </Button>
      <button
        data-testid="demo-exit"
        onClick={onExit}
        aria-label="Exit demo"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-950/70 transition-colors hover:bg-amber-950/15 hover:text-amber-950"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}
