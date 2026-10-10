'use client'

// v139: the landing page becomes a full marketing page (user mockup:
// sticky nav, gradient hero with a CSS phone mockup, a real stats band,
// a 3-step guide, four role cards, the Top score leaderboard, the feature
// grid, community stories, FAQ, a dark-green CTA band and a full footer).
//
// Constraints that shaped it (all E2E-locked, see task101 suites):
//   - landing-headline / landing-copy / landing-cta / landing-signup /
//     landing-signin / landing-install / landing-version
//     all still exist and stay visible on desktop (L1-L4).
//   - the hero is still the single <main> and must fit one viewport at
//     1440x900 AND 375x812 (L5 / M5-pre) - the phone mockup is
//     desktop-only for exactly that reason.
//   - landing-root contains no <img> (L0): the phone, the avatars, every
//     visual is CSS plus inline lucide SVG icons.
//   - no em dash anywhere inside landing-root (L2c) - copy uses hyphens.
//   - seo-about / seo-features / seo-faq keep their testids; seo-features
//     keeps exactly six <h3> cards; the FAQ keeps its 5 items + JSON-LD
//     generated from the same strings (M35h/i/j/k).
//   - NEW: the Top score board (same public /api/top-posters feed the
//     v138 profile board uses) now also lives on the landing page as
//     social proof - "make the top score in the new [landing page]".

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  Compass,
  MessageCircle,
  Plane,
  Play,
  Search,
  Star,
  Store,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { LanguageMenu } from '@/components/social/header'
import { Button } from '@/components/ui/button'
import { PwaInstallButton } from '@/components/pwa-install-button'
import { APP_VERSION } from '@/lib/app-version'
import { useLanguage } from '@/lib/i18n'

// Real counts, computed on the server (page.tsx) and passed down, so the
// stats band can never drift into marketing fiction - it shows what the
// community has actually posted. If the DB hiccups, the band hides itself.
export interface LandingStats {
  prices: number
  people: number
  countries: number
}

interface LandingPageProps {
  onSignUp: () => void
  onLogin: () => void
  stats?: LandingStats | null
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

// M35j locks this at exactly SIX h3 cards inside seo-features.
const FEATURES = [
  {
    icon: Wallet,
    title: "Real local prices",
    body: "Locals post what things actually cost - food, transport, hotels, services - in their own city and currency.",
  },
  {
    icon: Camera,
    title: "AI price scanner",
    body: "Photograph any item with PriceLens and see what it typically costs nearby, backed by community prices.",
  },
  {
    icon: MessageCircle,
    title: "Ask a local",
    body: "No price posted yet? Message someone who lives there and get a straight answer.",
  },
  {
    icon: Compass,
    title: "Local guides",
    body: "Find guides by city, language and specialty, with star ratings from other travelers.",
  },
  {
    icon: TrendingUp,
    title: "Trip budget planner",
    body: "List what you'll buy and see what to set aside per place - and where your budget covers the whole list.",
  },
  {
    icon: BadgeCheck,
    title: "Community trust",
    body: "Votes and star ratings surface accurate prices; verification marks highlight established locals.",
  },
]

const STEPS = [
  {
    icon: Search,
    title: "Search or snap any price",
    items: [
      "Browse real prices by city, category and currency",
      "Snap a photo with PriceLens to price anything",
      "See the typical range before you spend",
    ],
  },
  {
    icon: Users,
    title: "Compare local consensus",
    items: [
      "Votes and star ratings rank accurate prices",
      "Repeat posts of the same item sit side by side",
      "Stale prices sink, fresh ones rise",
    ],
  },
  {
    icon: MessageCircle,
    title: "Ask or book trusted locals",
    items: [
      "Message a local when a price is missing",
      "Book guides by city, language and specialty",
      "Plan the whole trip with the budget planner",
    ],
  },
]

// Same avatar palette as the app (top-posters-card, /u share profiles) -
// every face on this page is an initial on a brand color, never an <img>.
const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-green-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

function InitialAvatar({ name, color, className = 'w-9 h-9 text-xs' }: { name: string; color?: string; className?: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className={`shrink-0 rounded-full grid place-items-center font-bold text-white ${AVATAR_COLORS[color || 'teal'] || 'bg-teal-600'} ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  )
}

function SectionHeading({ eyebrow, title, sub, center = true }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{sub}</p>}
    </div>
  )
}

// Pure-CSS phone mockup of the feed - desktop only, no images (L0).
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[300px]" aria-hidden="true">
      <div className="relative rounded-[2.2rem] border border-border bg-card p-2.5 shadow-2xl">
        <div className="overflow-hidden rounded-[1.8rem] bg-background">
          {/* app header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-1.5">
              <div className="grid h-5 w-5 place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">C</div>
              <span className="text-xs font-bold text-foreground">circub</span>
            </div>
            <InitialAvatar name="M" color="amber" className="h-5 w-5 text-[9px]" />
          </div>
          {/* search pill */}
          <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Search prices in your city</span>
          </div>
          {/* price card 1 */}
          <div className="mx-3 mb-2 rounded-xl border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <InitialAvatar name="A" color="green" className="h-7 w-7 text-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-foreground">Grill Machine</div>
                <div className="truncate text-[9px] text-muted-foreground">Nica Trail - street food</div>
              </div>
              <div className="text-[11px] font-bold text-primary">$80 - $100</div>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary">
                <Check className="h-2.5 w-2.5" /> Verified local
              </span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-medium text-amber-600">4.9</span>
            </div>
          </div>
          {/* event card */}
          <div className="mx-3 mb-2 rounded-xl bg-primary p-3 text-primary-foreground">
            <div className="text-[9px] uppercase tracking-wider opacity-80">This weekend</div>
            <div className="text-xs font-bold">Annual Festival</div>
            <div className="mt-1.5 inline-block rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[9px] font-medium">Free entry</div>
          </div>
          {/* price card 2 */}
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-border bg-card p-2.5">
            <InitialAvatar name="T" color="teal" className="h-7 w-7 text-[10px]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-foreground">Taxi - airport to center</div>
              <div className="truncate text-[9px] text-muted-foreground">Posted 2 min ago</div>
            </div>
            <div className="text-[11px] font-bold text-primary">$12 - $15</div>
          </div>
          {/* bottom nav */}
          <div className="flex items-center justify-around border-t border-border py-2.5">
            <Search className="h-3.5 w-3.5 text-primary" />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
              <Camera className="h-3.5 w-3.5" />
            </div>
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <Plane className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
      {/* floating proof chips - kept inside the column bounds */}
      <div className="absolute -left-8 top-14 rounded-xl border border-border bg-card px-3 py-2 shadow-lg sm:-left-12">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
          <Check className="h-3 w-3 text-primary" /> Real price posted
        </div>
        <div className="text-[9px] text-muted-foreground">2 minutes ago</div>
      </div>
      <div className="absolute -right-4 bottom-28 rounded-xl border border-border bg-card px-3 py-2 shadow-lg sm:-right-8">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
          <Trophy className="h-3 w-3 text-amber-500" /> #1 on Top score
        </div>
        <div className="text-[9px] text-muted-foreground">Meron - 5 posts</div>
      </div>
    </div>
  )
}

/**
 * v139 landing - one scroll, eleven moments:
 * nav / hero+phone / real stats / what is circub / 3 steps / roles /
 * what circub does / Top score / stories / FAQ / CTA band + footer.
 *
 * Entry points (unchanged semantics, E2E-locked):
 *   landing-cta      the CTA band's "Join for free" - opens sign-up
 *   landing-signup   the hero's primary "Sign up free" - opens sign-up
 *   landing-signin   the nav's "Sign in" - opens login
 *   landing-install  the nav's PWA install button (Android one-tap,
 *                    iOS step-by-step; hides once standalone)
 *   landing-version  footer version marker
 */
export function LandingPage({ onSignUp, onLogin, stats = null }: LandingPageProps) {
  const { t } = useLanguage()
  const [posters, setPosters] = useState<Array<{ id: string; name: string; avatarColor: string; postsCount: number }>>([])

  // Top score board - same public API the profile board uses (v138).
  // Best effort: a failed fetch leaves the empty state, never breaks the page.
  useEffect(() => {
    let alive = true
    fetch('/api/top-posters')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setPosters(d.posters || [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const RANK_STYLES = ['text-amber-500', 'text-slate-400', 'text-orange-600']

  return (
    <div data-testid="landing-root" className="relative min-h-[100dvh] bg-background">
      {/* ============================== NAV ============================== */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2" aria-label="circub home">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">C</div>
            <span className="text-lg font-bold tracking-tight text-foreground">circub</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex" aria-label="Landing sections">
            <a href="#how" className="transition-colors hover:text-primary">How it works</a>
            <a href="#features" className="transition-colors hover:text-primary">Features</a>
            <a href="#top-score" className="transition-colors hover:text-primary">Top score</a>
            <a href="#stories" className="transition-colors hover:text-primary">Stories</a>
            <a href="#faq" className="transition-colors hover:text-primary">FAQs</a>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageMenu />
            <ThemeToggle className="border border-border bg-card/80 shadow-sm backdrop-blur-sm" />
            <Button
              data-testid="landing-signin"
              onClick={onLogin}
              variant="ghost"
              className="hidden h-9 px-3 text-sm font-medium sm:inline-flex"
            >
              {t('landing.signIn')}
            </Button>
            <span data-testid="landing-install">
              <PwaInstallButton compact className="h-9 px-3 text-xs sm:text-sm" />
            </span>
          </div>
        </div>
      </header>

      {/* ============================== HERO (the single <main>) ============================== */}
      <main className="relative overflow-x-clip">
        {/* soft brand glow, like the mockup's pale green wash */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute left-[15%] top-[-20%] h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute right-[5%] top-[30%] h-[280px] w-[280px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Plane className="h-3 w-3" />
              Real prices. Shared by people who live there.
            </div>

            <h1
              data-testid="landing-headline"
              className="mt-4 max-w-lg text-3xl font-bold leading-[1.12] tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]"
            >
              {t('landing.headline')}
            </h1>

            <p data-testid="landing-copy" className="mt-3 text-sm font-bold tracking-wide text-primary sm:text-base">
              {t('landing.copy')}
            </p>

            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              Join the community that shows what things really cost where you live - street
              food, taxi rides, hotels, repairs - posted in the local currency by people who
              actually live there.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                data-testid="landing-signup"
                onClick={onSignUp}
                size="lg"
                className="h-12 px-7 text-base"
              >
                {t('landing.signUpFree')}
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-6 text-base" asChild>
                <a href="#how">
                  <Play className="h-4 w-4" /> See how it works
                </a>
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" /> Free to join
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" /> No app store download
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-primary" /> Works on any phone
              </span>
            </div>
          </div>

          {/* Phone mockup - desktop only so the hero keeps fitting one
              viewport on phones (L5 / M5-pre) */}
          <div className="hidden lg:block">
            <PhoneMockup />
          </div>
        </div>
      </main>

      {/* ============================== REAL STATS BAND ============================== */}
      {stats && (
        <section aria-label="Community stats" className="border-y border-border/60 bg-card/40">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-foreground">{stats.prices.toLocaleString('en-US')}+</div>
              <div className="mt-1 text-xs text-muted-foreground">real prices posted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-foreground">{stats.people.toLocaleString('en-US')}+</div>
              <div className="mt-1 text-xs text-muted-foreground">locals and travelers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-foreground">{stats.countries}</div>
              <div className="mt-1 text-xs text-muted-foreground">countries covered</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-foreground">100%</div>
              <div className="mt-1 text-xs text-muted-foreground">free, no ads, no fees</div>
            </div>
          </div>
        </section>
      )}

      {/* ============================== WHAT IS CIRCUB (seo-about) ============================== */}
      <section aria-labelledby="seo-about-h" data-testid="seo-about" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 id="seo-about-h" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            What is circub?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
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
        </div>
      </section>

      {/* ============================== HOW IT WORKS ============================== */}
      <section id="how" aria-labelledby="how-h" className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Transparency in 3 steps</p>
            <h2 id="how-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              How circub works in 3 simple steps
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              No spreadsheets, no yearly membership, no cost. Just you and a
              world of prices locals already know.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-bold text-primary/20">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
                <ul className="mt-3 space-y-2">
                  {step.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== ROLES ============================== */}
      <section aria-labelledby="roles-h" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <SectionHeading
          eyebrow="Both sides of every trip"
          title="A platform where both visitors and neighbors thrive"
          sub="circub works for everyone who touches a city - explore it, share it, or earn from what you already know."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* travelers */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Plane className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">For travelers</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">Check prices before you go</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
              See what food, transport, hotels and services really cost - posted by people who live there.
            </p>
          </div>

          {/* locals - the dark green hero card, like the mockup */}
          <div className="flex flex-col rounded-2xl bg-primary p-5 text-primary-foreground shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground/15">
              <Store className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">For locals</p>
            <h3 className="mt-1 text-base font-semibold">Post prices &amp; build reputation</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed opacity-90">
              Every price you post helps neighbors and travelers - and builds your name on the board.
            </p>
            <Button
              onClick={onSignUp}
              className="mt-4 h-9 w-fit bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              size="sm"
            >
              Post your first price
            </Button>
          </div>

          {/* guides */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Compass className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">For guides</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">Get booked directly</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
              Offer your city knowledge, set your rate, and get booked by travelers - no middlemen.
            </p>
            <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Become a guide <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* vendors */}
          <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">For vendors</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">Post your product for free</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
              List what you sell with photos and real prices, where people are already looking.
            </p>
            <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              List what you sell <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* wide community card */}
        <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Join the community</p>
              <h3 className="mt-1 text-base font-semibold text-foreground">Meet travelers and share your city</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Answer questions, vouch for prices, and help the next visitor spend like a local.
              </p>
            </div>
          </div>
          <Button onClick={onSignUp} size="sm" className="h-9 shrink-0">
            Join the community
          </Button>
        </div>
      </section>

      {/* ============================== WHAT CIRCUB DOES (seo-features, exactly 6 h3 cards) ============================== */}
      <section
        id="features"
        aria-labelledby="seo-features-h"
        data-testid="seo-features"
        className="border-t border-border/60 bg-card/40"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Peace of mind</p>
            <h2 id="seo-features-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              What circub does
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Everything you need to spend with complete peace of mind, in any
              city, in any currency.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== TOP SCORE ============================== */}
      <section id="top-score" aria-labelledby="top-score-h" data-testid="landing-top-score" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Community leaderboard</p>
            <h2 id="top-score-h" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Top score
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              The most active contributors on circub right now, ranked by
              prices posted. Every real price you share moves you up the
              board - and helps an entire city spend smarter.
            </p>
            <Button onClick={onSignUp} className="mt-5 h-11 px-6">
              Sign up to climb the board <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Top score</span>
              <span className="ml-auto text-[11px] text-muted-foreground">most prices posted</span>
            </div>
            <div className="space-y-2.5">
              {posters.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No posts yet - the board opens with the first price posted.
                </p>
              ) : (
                posters.map((p, i) => (
                  <div
                    key={p.id}
                    data-testid="landing-top-score-row"
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
                  >
                    <span className={`w-6 shrink-0 text-sm font-bold ${RANK_STYLES[i] || 'text-muted-foreground'}`}>
                      #{i + 1}
                    </span>
                    <InitialAvatar name={p.name} color={p.avatarColor} className="h-8 w-8 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-amber-600">{p.postsCount} posts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== STORIES ============================== */}
      <section id="stories" aria-labelledby="stories-h" className="border-y border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <SectionHeading
            eyebrow="Trusted community stories"
            title="Loved by travelers and locals alike"
            sub="Real people keeping each other informed, one price at a time."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                quote: "I stopped guessing what things cost. I check circub before I book anything - it saved me real money in my first week abroad.",
                name: "Selam",
                role: "Traveler",
                color: "teal",
              },
              {
                quote: "I post prices for my street food spot. Travelers find me, neighbors trust me, and my name is on the Top score board.",
                name: "Daniel",
                role: "Local cook",
                color: "orange",
              },
              {
                quote: "The budget planner plus Ask a Local planned my whole trip in one app. No app store, it just installs and works.",
                name: "Martha",
                role: "Local guide",
                color: "purple",
              },
            ].map((s) => (
              <figure key={s.name} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-1" aria-label="5 out of 5 stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground">
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5">
                  <InitialAvatar name={s.name} color={s.color} className="h-9 w-9 text-xs" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== FAQ (seo-faq, 5 items + JSON-LD) ============================== */}
      <section
        id="faq"
        aria-labelledby="seo-faq-h"
        data-testid="seo-faq"
        className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-16"
      >
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Quick answers</p>
          <h2 id="seo-faq-h" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Everything people ask before their first price, answered.
          </p>
        </div>

        <div className="mt-8 space-y-2.5">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={item.q}
              data-testid={`faq-item-${i}`}
              className="group rounded-xl border border-border bg-card px-4 py-3"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ============================== CTA BAND ============================== */}
      <section aria-labelledby="cta-h" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 lg:pb-16">
        <div className="rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-lg sm:px-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">Join the community</p>
          <h2 id="cta-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Travel smarter with real prices in your pocket.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed opacity-90 sm:text-base">
            Join for free, post what things really cost where you live, and
            help every visitor spend like a local.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button
              data-testid="landing-cta"
              onClick={onSignUp}
              size="lg"
              className="h-12 w-full bg-primary-foreground px-8 text-base text-primary hover:bg-primary-foreground/90 sm:w-auto"
            >
              Join for free
            </Button>
            <PwaInstallButton className="h-12 w-full border-primary-foreground/40 bg-transparent px-8 text-base text-primary-foreground hover:bg-primary-foreground hover:text-primary sm:w-auto" />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs opacity-90">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> No app store download
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> Free to join
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" /> Available worldwide
            </span>
          </div>
        </div>
      </section>

      {/* ============================== FOOTER ============================== */}
      <footer className="border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">C</div>
                <span className="text-lg font-bold tracking-tight text-foreground">circub</span>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Real prices, shared by people who live there. Free forever,
                on any phone, in any currency.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">Product</p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li><a href="#how" className="transition-colors hover:text-primary">How it works</a></li>
                <li><a href="#features" className="transition-colors hover:text-primary">Features</a></li>
                <li><a href="#top-score" className="transition-colors hover:text-primary">Top score</a></li>
                <li><a href="#stories" className="transition-colors hover:text-primary">Community stories</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">Legal &amp; company</p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li><a href="/contact" className="transition-colors hover:text-primary">Contact</a></li>
                <li><a href="/privacy" className="transition-colors hover:text-primary">Privacy</a></li>
                <li><a href="/terms" className="transition-colors hover:text-primary">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 border-t border-border/60 pt-5 text-[11px] text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} circub</span>
            <span aria-hidden="true">&middot;</span>
            <span data-testid="landing-version">{APP_VERSION}</span>
          </div>
        </div>
      </footer>

      {/* FAQPage structured data - generated from the SAME array as the
          visible FAQ above, so quotes can never drift from the page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
    </div>
  )
}
