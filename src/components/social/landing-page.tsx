'use client'

import { ThemeToggle } from '@/components/theme-toggle'
import { LanguageMenu } from '@/components/social/header'
import { Button } from '@/components/ui/button'
import { PwaInstallButton } from '@/components/pwa-install-button'
import { APP_VERSION } from '@/lib/app-version'
import { useLanguage } from '@/lib/i18n'

interface LandingPageProps {
  onSignUp: () => void
  onLogin: () => void
  onContinueAsGuest?: () => void
}

/**
 * Single-page landing: the pitch + every way in, all on one screen.
 *
 * The user's brief: "make the landing page messege like this" - the message
 * is "Know before you go." + "Prices. Places. Products. People." - four
 * words that name exactly what the app graph shows, and every entry point
 * lives on this same single page, no separate marketing sections or extra
 * routes:
 *
 *   Post a real price →   the pitch's own CTA (posting needs an account,
 *                         so it opens sign-up - the fastest path to posting)
 *   Sign up free          explicit account creation
 *   Sign in               returning users
 *   Get the mobile app    PWA install (Android/Chrome one-tap dialog,
 *                         iOS step-by-step Add-to-Home-Screen; hides itself
 *                         once the app already runs installed/standalone)
 *   Continue as guest     browse everything, post/vote prompts sign-up
 *
 * Everything fits a single viewport on modern phones (brand row is inline
 * to keep vertical budget tight) and the theme toggle plus the legal/version
 * footer round out the corners.
 */
export function LandingPage({ onSignUp, onLogin, onContinueAsGuest }: LandingPageProps) {
  const { t } = useLanguage()
  return (
    <div
      data-testid="landing-root"
      className="relative flex min-h-[100dvh] flex-col bg-background"
    >
      {/* Top-right corner - language switcher + theme toggle */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
        <LanguageMenu />
        <ThemeToggle className="bg-card/80 backdrop-blur-sm border border-border shadow-sm" />
      </div>

      {/* Soft brand glow behind the entry card */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[28%] h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* One page: pitch copy + all the buttons */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        {/* Brand row - wordmark only (logo image removed per user request) */}
        <div className="flex items-center justify-center">
          <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            circub
          </span>
        </div>

        <h1
          data-testid="landing-headline"
          className="mt-6 max-w-md text-3xl font-bold tracking-tight text-foreground sm:text-4xl sm:leading-[1.15]"
        >
          {t('landing.headline')}
        </h1>

        <p
          data-testid="landing-copy"
          className="mt-3 max-w-md text-sm font-medium tracking-wide text-muted-foreground sm:text-base"
        >
          {t('landing.copy')}
        </p>

        <div className="mt-7 flex w-full max-w-[300px] flex-col gap-2.5">
          {/* The pitch's own CTA - posting needs an account, so this opens sign-up */}
          <Button
            data-testid="landing-cta"
            onClick={onSignUp}
            size="lg"
            className="h-12 w-full text-base"
          >
            {t('landing.cta')} <span aria-hidden="true">&rarr;</span>
          </Button>

          <div className="grid grid-cols-2 gap-2.5">
            <Button
              data-testid="landing-signup"
              onClick={onSignUp}
              size="lg"
              variant="outline"
              className="h-11 w-full"
            >
              {t('landing.signUpFree')}
            </Button>
            <Button
              data-testid="landing-signin"
              onClick={onLogin}
              size="lg"
              variant="outline"
              className="h-11 w-full"
            >
              {t('landing.signIn')}
            </Button>
          </div>

          <div data-testid="landing-install" className="mt-0.5">
            <PwaInstallButton className="h-10 w-full text-sm" />
          </div>

          {onContinueAsGuest && (
            <button
              data-testid="landing-guest"
              onClick={onContinueAsGuest}
              className="mt-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              {t('landing.guest')}
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
