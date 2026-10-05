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
  onViewDemo?: () => void
}

// v114: single source of truth for the FAQ - the visible <details> and the
// FAQPage JSON-LD are generated from the SAME strings, so a search engine's
// or AI answer engine's quoted answer can never differ from what a visitor
// actually reads on the page.
const FAQ_ITEMS = [
  {
    q: "What is circub?",
    a: "circub is a free community platform where locals post real prices for products, services, restaurants and transport, and travelers see what things actually cost before and while they travel. The community votes and rates posts, so accurate prices rise to the top.",
  },
  {
    q: "How much does circub cost?",
    a: "circub is completely free - for travelers and for locals. Creating an account, posting prices, asking locals, and installing the mobile app all cost nothing.",
  },
  {
    q: "How do I install the circub app on my phone?",
    a: "Open circub.vercel.app in your phone's browser. On Android tap 'Get the mobile app' and confirm, or use Chrome's menu > Install app. On iPhone tap the share button in Safari and choose 'Add to Home Screen'. The app opens full-screen with its own icon, like a native app.",
  },
  {
    q: "How are prices verified?",
    a: "Every price is posted by a real community member with a name and place. Other users vote and leave star ratings on posts, and repeat posts of the same item are shown together - so current, accurate prices surface while stale ones sink.",
  },
  {
    q: "Which countries and cities does circub cover?",
    a: "circub is community-driven: it covers every place where locals have posted prices, and it grows city by city as people contribute. If your destination is not covered yet, you can ask a local guide directly.",
  },
]

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
}

const FEATURES = [
  {
    title: "Real local prices",
    body: "Locals post what things actually cost - food, transport, hotels, services - in their own city and currency.",
  },
  {
    title: "AI price scanner",
    body: "Photograph any item with PriceLens and see what it typically costs nearby, backed by community prices.",
  },
  {
    title: "Ask a local",
    body: "No price posted yet? Message someone who lives there and get a straight answer.",
  },
  {
    title: "Local guides",
    body: "Find guides by city, language and specialty, with star ratings from other travelers.",
  },
  {
    title: "Trip budget planner",
    body: "List what you'll buy and see what to set aside per place - and where your budget covers the whole list.",
  },
  {
    title: "Community trust",
    body: "Votes and star ratings surface accurate prices; verification marks highlight established locals.",
  },
]

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
 *   View demo             read-only demo view: browse everything, every
 *                         action (post/vote/message) prompts sign-up
 *
 * Everything fits a single viewport on modern phones (brand row is inline
 * to keep vertical budget tight) and the theme toggle plus the legal/version
 * footer round out the corners.
 *
 * v114 SEO: below the entry card (hero stays a single viewport) sits a
 * crawlable, semantic content section - what circub is, what it does, and
 * an FAQ mirrored into FAQPage structured data - so Google, Bing and the
 * AI answer engines (ChatGPT search, Perplexity, AI Overviews) have real
 * content to index and quote. English by design: it is the site default
 * and the language search engines index.
 */
export function LandingPage({ onSignUp, onLogin, onViewDemo }: LandingPageProps) {
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

          {onViewDemo && (
            <button
              data-testid="landing-demo"
              onClick={onViewDemo}
              className="mt-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              {t('landing.demo')}
            </button>
          )}
        </div>
      </main>

      {/* v114 SEO: crawlable, human-readable content below the entry card.
          Gives search and AI engines semantic H2/H3 structure + quotable
          answers; stays visually part of the same quiet page. */}
      <section
        aria-labelledby="seo-about-h"
        data-testid="seo-about"
        className="relative mx-auto w-full max-w-2xl px-6 pb-10 text-left"
      >
        <h2 id="seo-about-h" className="text-lg font-bold text-foreground">
          What is circub?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          circub is a free community where locals post real prices for
          everyday things - street food, taxi rides, hotels, haircuts,
          repairs - and travelers see what things actually cost before and
          while they travel. Prices are posted in the local currency by
          people who live there, and the community votes and rates them, so
          the most accurate prices rise to the top. You can also ask a local
          directly when you can&apos;t find a price, or book a local guide.
          circub works in any browser and installs as a full-screen mobile
          app on Android and iPhone - no app store needed.
        </p>
      </section>

      <section
        aria-labelledby="seo-features-h"
        data-testid="seo-features"
        className="relative mx-auto w-full max-w-2xl px-6 pb-10 text-left"
      >
        <h2 id="seo-features-h" className="text-lg font-bold text-foreground">
          What circub does
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card/60 p-3.5"
            >
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="seo-faq-h"
        data-testid="seo-faq"
        className="relative mx-auto w-full max-w-2xl px-6 pb-12 text-left"
      >
        <h2 id="seo-faq-h" className="text-lg font-bold text-foreground">
          Frequently asked questions
        </h2>
        <div className="mt-3 space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={item.q}
              data-testid={`faq-item-${i}`}
              className="rounded-xl border border-border bg-card/60 px-3.5 py-2.5"
            >
              <summary className="cursor-pointer text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {item.q}
              </summary>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* FAQPage structured data - generated from the SAME array as the
          visible FAQ above, so quotes can never drift from the page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

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
