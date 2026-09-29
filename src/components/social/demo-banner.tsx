'use client'

import { Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DemoBannerProps {
  onSignUp: () => void
  onExit: () => void
}

/**
 * The persistent "Demo view" banner - shown across the whole dashboard while
 * someone is browsing the read-only demo (the old "Continue as guest" mode,
 * reframed: there is no guest account any more, just a look-around demo).
 *
 * It labels the mode honestly ("you are looking at a demo, not signed in"),
 * keeps the two always-available actions one tap away - sign up (the real
 * way in) and exit (back to the landing page) - and scrolls away with the
 * page so it never covers the sticky header or the bottom tab bar.
 */
export function DemoBanner({ onSignUp, onExit }: DemoBannerProps) {
  return (
    <div
      data-testid="demo-banner"
      className="flex items-center gap-2 sm:gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 sm:px-6 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs leading-snug sm:text-sm">
        <span className="font-semibold">Demo view.</span>{' '}
        <span className="text-amber-900/80 dark:text-amber-200/80">
          You are looking around a read-only demo - sign up free to post prices, vote, and message.
        </span>
      </p>
      <Button
        data-testid="demo-signup"
        onClick={onSignUp}
        size="sm"
        className="h-7 shrink-0 bg-amber-900 px-2.5 text-xs text-amber-50 hover:bg-amber-800 sm:px-3 sm:text-sm dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
      >
        Sign up free
      </Button>
      <button
        data-testid="demo-exit"
        onClick={onExit}
        aria-label="Exit demo"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-amber-900/70 transition-colors hover:bg-amber-200/60 hover:text-amber-950 dark:text-amber-200/70 dark:hover:bg-amber-900/60 dark:hover:text-amber-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
