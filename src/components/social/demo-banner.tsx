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
 *
 * Mobile (v108): same bold mode, less screen - the flex row wraps so the
 * Register button drops to its own full-width line, the long locked-actions
 * sentence is replaced by a short one, and the eye badge hides. On a 390px
 * phone the banner is ~3 tight lines instead of five; desktop keeps the
 * original single-row look (order utilities restore eye > text > button > X).
 */
export function DemoBanner({ onSignUp, onExit }: DemoBannerProps) {
  return (
    <div
      data-testid="demo-banner"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-2 border-amber-500/60 bg-amber-400 px-3 py-2 text-amber-950 sm:gap-3 sm:px-6 sm:py-3"
    >
      <span
        className="order-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-950 text-amber-400 max-sm:hidden"
        aria-hidden="true"
      >
        <Eye className="h-4 w-4" />
      </span>
      <p className="order-2 min-w-0 flex-1 text-[13px] leading-snug sm:text-base">
        <span
          data-testid="demo-banner-chip"
          className="mr-2 inline-block rounded bg-amber-950 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-widest text-amber-400 sm:text-xs"
        >
          Demo
        </span>
        <span className="font-extrabold">Demo view — read only.</span>{' '}
        <span className="font-semibold max-sm:hidden">
          You cannot post, vote, message, or join as a guide. Register first — it is free and takes 10 seconds.
        </span>
        <span className="font-semibold sm:hidden">
          Register to post, vote &amp; message — free, 10 seconds.
        </span>
      </p>
      <button
        data-testid="demo-exit"
        onClick={onExit}
        aria-label="Exit demo"
        className="order-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-950/70 transition-colors hover:bg-amber-950/15 hover:text-amber-950 sm:order-4"
      >
        <X className="h-5 w-5" />
      </button>
      <Button
        data-testid="demo-signup"
        onClick={onSignUp}
        size="sm"
        className="order-4 h-8 basis-full bg-amber-950 px-2.5 text-xs font-bold text-amber-50 hover:bg-amber-900 sm:order-3 sm:basis-auto sm:px-4 sm:text-sm dark:bg-amber-950 dark:text-amber-50 dark:hover:bg-amber-900"
      >
        Register now — it&apos;s free
      </Button>
    </div>
  )
}
