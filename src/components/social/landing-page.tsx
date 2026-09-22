'use client'

import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { PwaInstallButton } from '@/components/pwa-install-button'
import { APP_VERSION } from '@/lib/app-version'

interface LandingPageProps {
  onSignUp: () => void
  onLogin: () => void
  onContinueAsGuest?: () => void
}

/**
 * Minimal landing - one small screen, no marketing sections.
 *
 * Replaces the old full landing page (hero + features + how-it-works +
 * audiences + sample post + CTA + footer, ~700 lines). What stays is the
 * bare entry point: the brand, one line of context, and the way in -
 * Sign in (primary), Sign up free, Get the mobile app, Continue as guest.
 * Everything fits in a single viewport on mobile with no scrolling, and
 * the theme toggle plus the legal/version footer round out the corners.
 *
 * "Get the mobile app" is the PWA install entry: Android/Chrome gets the
 * native one-tap install dialog, iOS/other browsers get step-by-step
 * "Add to Home Screen" instructions, and it hides itself when the app is
 * already running installed (standalone) - so the user's own phone never
 * sees it again after installing.
 */
export function LandingPage({ onSignUp, onLogin, onContinueAsGuest }: LandingPageProps) {
  return (
    <div
      data-testid="landing-root"
      className="relative flex min-h-[100dvh] flex-col bg-background"
    >
      {/* Top-right corner - theme toggle only */}
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="bg-card/80 backdrop-blur-sm border border-border shadow-sm" />
      </div>

      {/* Soft brand glow behind the entry card */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[28%] h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* The small thing: brand + one-liner + way in */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <img
          src="/logo.png"
          alt="circub"
          width={96}
          height={96}
          fetchPriority="high"
          decoding="async"
          className="h-16 w-16 object-contain sm:h-20 sm:w-20"
        />
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          circub
        </h1>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Real local prices · know what things cost before you travel.
        </p>

        <div className="mt-6 flex w-full max-w-[280px] flex-col gap-2.5">
          <Button
            data-testid="landing-signin"
            onClick={onLogin}
            size="lg"
            className="h-11 w-full"
          >
            Sign in
          </Button>
          <Button
            data-testid="landing-signup"
            onClick={onSignUp}
            size="lg"
            variant="outline"
            className="h-11 w-full"
          >
            Sign up free
          </Button>
          <div data-testid="landing-install" className="mt-0.5">
            <PwaInstallButton className="h-10 w-full text-sm" />
          </div>
          {onContinueAsGuest && (
            <button
              data-testid="landing-guest"
              onClick={onContinueAsGuest}
              className="mt-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Continue as guest
            </button>
          )}
        </div>
      </main>

      {/* Tiny footer - legal pages stay reachable, version stays visible */}
      <footer className="relative flex items-center justify-center gap-2 pb-4 text-[11px] text-muted-foreground">
        <a href="/contact" className="transition-colors hover:text-primary">Contact</a>
        <span aria-hidden="true">·</span>
        <a href="/privacy" className="transition-colors hover:text-primary">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms" className="transition-colors hover:text-primary">Terms</a>
        <span aria-hidden="true">·</span>
        <span data-testid="landing-version">{APP_VERSION}</span>
      </footer>
    </div>
  )
}
