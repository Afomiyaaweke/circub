'use client'

// v186: the landing page is reskinned to the user's dark-teal design mockup
// (screenshot: dark #162930 header band, centered white-circle logo +
// wordmark, lime #e6ff32 monospace uppercase CTA pill, a thin #e4e4e4
// hairline under the header, and a green progress bar with a "% completed"
// caption). The whole page is now ALWAYS dark - independent of the app
// theme tokens - with explicit hex classes so the landing looks identical
// in light and dark mode.
//
// What changed vs v139's light marketing page:
//   - palette: page #162930, deep wells #0a1e25, cards #1b3340, headings
//     white, body #a8bcc4, accent LIME #e6ff32, progress green #41a050,
//     track #e5e7eb - sampled from the user's screenshot.
//   - nav mirrors the mockup: centered logo + wordmark (absolute), mono
//     uppercase section links on the left, controls on the right, and a
//     light hairline along the bottom edge.
//   - every primary CTA is a lime mono uppercase pill (hero signup, CTA
//     band, top-score, locals card inverts to lime with dark text).
//   - NEW landing-progress block in the hero (replaces the old 3-check
//     row): a real progress bar driven by the server-computed prices count
//     toward the next 1,000-price milestone, captioned "N% completed - M
//     real prices posted". If stats are unavailable the old checks return.
//
// Constraints that shape it (all E2E-locked, see task101 suites):
//   - landing-headline / landing-copy / landing-cta / landing-signup /
//     landing-signin / landing-install / landing-version
//     all still exist and stay visible on desktop (L1-L4).
//   - the hero is still the single <main> and must fit one viewport at
//     1440x900 AND 375x812 (L5 / M5-pre) - the phone mockup is
//     desktop-only for exactly that reason, and the progress block is
//     height-neutral vs the check row it replaced.
//   - landing-root contains no <img> (L0): the phone, the avatars, every
//     visual is CSS plus inline lucide SVG icons.
//   - no em dash anywhere inside landing-root (L2c) - copy uses hyphens.
//   - seo-about / seo-features / seo-faq keep their testids; seo-features
//     keeps exactly six <h3> cards; the FAQ keeps its 5 items + JSON-LD
//     generated from the same strings (M35h/i/j/k).
//   - the Top score board (same public /api/top-posters feed the
//     v138 profile board uses) still lives here as social proof.

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

// v186 palette - sampled from the user's dark mockup (upload screenshot).
const C = {
  page: '#162930', // dark teal page background
  well: '#0a1e25', // deeper wells: BACK-style pills, board rows, CTA band
  card: '#1b3340', // raised card surface
  band: '#0f232b', // alternating section bands
  lime: '#e6ff32', // primary accent (CTAs, eyebrows, checks)
  limeHover: '#d9f226',
  green: '#41a050', // progress fill / logo gradient
  greenDk: '#068521',
  track: '#e5e7eb', // progress track
  hair: '#e4e4e4', // the mockup's light hairline
  body: '#a8bcc4', // body text
  faint: '#8fa6ae', // faint meta text
}

// Shared lime CTA treatment - the mockup's "SUBMIT APPLICATION" pill.
const LIME_BTN =
  'bg-[#e6ff32] text-[#0a1e25] hover:bg-[#d9f226] hover:text-[#0a1e25] font-mono uppercase tracking-[0.16em]'

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
    q: "What is circubAwd?",
    a: "circubAwd is a free community platform that helps you find local businesses with real, current prices, plan what you'll buy with an itemized proforma, and sell your stuff through registered Sales sellers. The community votes and rates posts, so accurate prices rise to the top.",
  },
  {
    q: "How much does circubAwd cost?",
    a: "circubAwd is completely free - for travelers and for locals. Creating an account, posting prices, asking locals, and installing the mobile app all cost nothing.",
  },
  {
    q: "How do I install the circubAwd app on my phone?",
    a: "Open circub.vercel.app in your phone's browser. On Android tap 'Get the mobile app' and confirm, or use Chrome's menu > Install app. On iPhone tap the share button in Safari and choose 'Add to Home Screen'. The app opens full-screen with its own icon, like a native app.",
  },
  {
    q: "How are prices verified?",
    a: "Every price is posted by a real community member with a name and place. Other users vote and leave star ratings on posts, and repeat posts of the same item are shown together - so current, accurate prices surface while stale ones sink.",
  },
  {
    q: "Which countries and cities does circubAwd cover?",
    a: "circubAwd is community-driven: it covers every place where locals have posted prices, and it grows city by city as people contribute. If your destination is not covered yet, you can ask a local guide directly.",
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
    body: "Locals and businesses post what things actually cost - food, transport, hotels, services - in their own city and currency.",
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
    title: "Proforma planner",
    body: "List what you'll buy, compare real local prices place by place, and get the best result - an itemized proforma of what to set aside.",
  },
  {
    icon: BadgeCheck,
    title: "Registered sales",
    body: "Register as a Sales seller and sell your stuff to buyers already looking - your name and ratings behind every post.",
  },
]

const STEPS = [
  {
    icon: Search,
    title: "Find local businesses",
    items: [
      "Search businesses and prices by city, category and currency",
      "See the name and star ratings behind every price",
      "Compare real offers side by side before you spend",
    ],
  },
  {
    icon: Wallet,
    title: "Plan with a proforma",
    items: [
      "List the things you need to buy or get done",
      "Turn real local prices into an itemized estimate",
      "See where your budget covers the list, place by place",
    ],
  },
  {
    icon: Store,
    title: "Sell through registered sales",
    items: [
      "Register as a Sales seller in minutes",
      "Post your stuff with photos and real prices",
      "Reach buyers while they are already looking to buy",
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

// The mockup's centered brand mark: a white disc with the green gradient C.
function BrandMark({ size = 'h-9 w-9 text-base' }: { size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-white shadow-sm`} aria-hidden="true">
      <span className="bg-gradient-to-br from-[#41a050] via-[#0f8a33] to-[#068521] bg-clip-text font-bold text-transparent">C</span>
    </span>
  )
}

function SectionHeading({ eyebrow, title, sub, center = true }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-sm leading-relaxed text-[#a8bcc4] sm:text-base">{sub}</p>}
    </div>
  )
}

// Pure-CSS phone mockup of the feed - desktop only, no images (L0).
// Reskinned to the dark teal palette (v186).
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[300px]" aria-hidden="true">
      <div className="relative rounded-[2.2rem] border border-white/15 bg-[#0a1e25] p-2.5 shadow-2xl">
        <div className="overflow-hidden rounded-[1.8rem] bg-[#162930]">
          {/* app header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-1.5">
              <div className="grid h-5 w-5 place-items-center rounded-md bg-[#41a050] text-[10px] font-bold text-white">C</div>
              <span className="text-xs font-bold text-white">circubAwd</span>
            </div>
            <InitialAvatar name="M" color="amber" className="h-5 w-5 text-[9px]" />
          </div>
          {/* search pill */}
          <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1b3340] px-3 py-1.5">
            <Search className="h-3 w-3 text-[#8fa6ae]" />
            <span className="text-[10px] text-[#8fa6ae]">Find local businesses near you</span>
          </div>
          {/* price card 1 */}
          <div className="mx-3 mb-2 rounded-xl border border-white/10 bg-[#1b3340] p-2.5">
            <div className="flex items-center gap-2">
              <InitialAvatar name="A" color="green" className="h-7 w-7 text-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-white">Grill Machine</div>
                <div className="truncate text-[9px] text-[#8fa6ae]">Nica Trail - street food</div>
              </div>
              <div className="text-[11px] font-bold text-[#e6ff32]">$80 - $100</div>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#41a050]/15 px-2 py-0.5 text-[9px] font-medium text-[#7ed491]">
                <Check className="h-2.5 w-2.5" /> Verified local
              </span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-medium text-amber-400">4.9</span>
            </div>
          </div>
          {/* event card */}
          <div className="mx-3 mb-2 rounded-xl bg-[#41a050] p-3 text-white">
            <div className="text-[9px] uppercase tracking-wider opacity-80">This weekend</div>
            <div className="text-xs font-bold">Annual Festival</div>
            <div className="mt-1.5 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-medium">Free entry</div>
          </div>
          {/* price card 2 */}
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-[#1b3340] p-2.5">
            <InitialAvatar name="T" color="teal" className="h-7 w-7 text-[10px]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-white">Taxi - airport to center</div>
              <div className="truncate text-[9px] text-[#8fa6ae]">Posted 2 min ago</div>
            </div>
            <div className="text-[11px] font-bold text-[#e6ff32]">$12 - $15</div>
          </div>
          {/* bottom nav */}
          <div className="flex items-center justify-around border-t border-white/10 py-2.5">
            <Search className="h-3.5 w-3.5 text-[#e6ff32]" />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-[#41a050] text-white">
              <Camera className="h-3.5 w-3.5" />
            </div>
            <MessageCircle className="h-3.5 w-3.5 text-[#5f7780]" />
            <Users className="h-3.5 w-3.5 text-[#5f7780]" />
            <Plane className="h-3.5 w-3.5 text-[#5f7780]" />
          </div>
        </div>
      </div>
      {/* floating proof chips - kept inside the column bounds */}
      <div className="absolute -left-8 top-14 rounded-xl border border-white/10 bg-[#0a1e25] px-3 py-2 shadow-lg sm:-left-12">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-white">
          <Check className="h-3 w-3 text-[#e6ff32]" /> Real price posted
        </div>
        <div className="text-[9px] text-[#8fa6ae]">2 minutes ago</div>
      </div>
      <div className="absolute -right-4 bottom-28 rounded-xl border border-white/10 bg-[#0a1e25] px-3 py-2 shadow-lg sm:-right-8">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-white">
          <Trophy className="h-3 w-3 text-amber-400" /> #1 on Top score
        </div>
        <div className="text-[9px] text-[#8fa6ae]">Meron - 5 posts</div>
      </div>
    </div>
  )
}

/**
 * v186 landing - the dark-teal reskin. One scroll, eleven moments:
 * nav / hero+phone+progress / real stats / what is circubAwd / 3 steps /
 * roles / what circubAwd does / Top score / stories / FAQ / CTA band + footer.
 *
 * Entry points (unchanged semantics, E2E-locked):
 *   landing-cta      the CTA band's "Join for free" - opens sign-up
 *   landing-signup   the hero's primary "Sign up free" - opens sign-up
 *   landing-signin   the nav's "Sign in" - opens login
 *   landing-install  the nav's PWA install button (Android one-tap,
 *                    iOS step-by-step; hides once standalone)
 *   landing-version  footer version marker
 *   landing-progress NEW: hero progress bar toward the next price milestone
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

  const RANK_STYLES = ['text-amber-400', 'text-slate-400', 'text-orange-500']

  // v186: the mockup's "40% completed" progress bar, driven by REAL data -
  // how far the community is toward the next 1,000 posted prices. Never
  // faked: when stats are missing the block is replaced by the old checks.
  const goal = stats ? Math.max(1000, Math.ceil(stats.prices / 1000) * 1000) : 0
  const progressPct = stats && goal > 0 ? Math.min(99, Math.round((stats.prices / goal) * 100)) : 0

  return (
    <div data-testid="landing-root" className="relative min-h-[100dvh] bg-[#162930] text-white">
      {/* ============================== NAV ============================== */}
      <header className="sticky top-0 z-30 border-b border-[#e4e4e4]/25 bg-[#162930]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* left: mono uppercase section links (desktop) */}
          <nav
            className="hidden items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#a8bcc4] lg:flex"
            aria-label="Landing sections"
          >
            <a href="#how" className="transition-colors hover:text-[#e6ff32]">How it works</a>
            <a href="#features" className="transition-colors hover:text-[#e6ff32]">Features</a>
            <a href="#top-score" className="transition-colors hover:text-[#e6ff32]">Top score</a>
            <a href="#stories" className="transition-colors hover:text-[#e6ff32]">Stories</a>
            <a href="#faq" className="transition-colors hover:text-[#e6ff32]">FAQs</a>
          </nav>

          {/* center: the mockup's logo + wordmark, absolutely centered */}
          <a
            href="#"
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5"
            aria-label="circubAwd home"
          >
            <BrandMark />
            <span className="text-xl font-bold tracking-tight text-white">circubAwd</span>
          </a>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <LanguageMenu />
            <ThemeToggle className="border border-white/15 bg-transparent text-white shadow-none hover:bg-white/10 hover:text-white" />
            <Button
              data-testid="landing-signin"
              onClick={onLogin}
              variant="ghost"
              className="hidden h-9 px-3 font-mono text-xs uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              {t('landing.signIn')}
            </Button>
            <span data-testid="landing-install">
              <PwaInstallButton
                compact
                className="h-9 border-[#e6ff32]/40 bg-transparent px-3 text-xs text-[#e6ff32] shadow-none hover:bg-[#e6ff32] hover:text-[#0a1e25] sm:text-sm"
              />
            </span>
          </div>
        </div>
      </header>

      {/* ============================== HERO (the single <main>) ============================== */}
      <main className="relative overflow-x-clip">
        {/* soft brand glows, tuned for the dark teal ground */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute left-[15%] top-[-20%] h-[420px] w-[420px] rounded-full bg-[#41a050]/10 blur-3xl" />
          <div className="absolute right-[5%] top-[30%] h-[280px] w-[280px] rounded-full bg-[#e6ff32]/5 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e6ff32]/30 bg-[#e6ff32]/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#e6ff32]">
              <Plane className="h-3 w-3" />
              Real prices. Real businesses. Real registered sellers.
            </div>

            <h1
              data-testid="landing-headline"
              className="mt-4 max-w-lg text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]"
            >
              {t('landing.headline')}
            </h1>

            <p data-testid="landing-copy" className="mt-3 text-sm font-bold tracking-wide text-[#e6ff32] sm:text-base">
              {t('landing.copy')}
            </p>

            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#a8bcc4] sm:text-base">
              Find the local businesses behind real prices, plan what you will buy with an
              itemized proforma, and sell your stuff through registered Sales sellers -
              everything posted in the local currency by people who actually live there.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                data-testid="landing-signup"
                onClick={onSignUp}
                size="lg"
                className={`h-12 px-7 text-sm font-bold ${LIME_BTN}`}
              >
                {t('landing.signUpFree')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 border-white/25 bg-transparent px-6 font-mono text-sm uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <a href="#how">
                  <Play className="h-4 w-4" /> See how it works
                </a>
              </Button>
            </div>

            {/* v186: the mockup's progress bar, on real community data.
                Height-neutral replacement for the old 3-check row so the
                hero still fits one viewport at 1440x900 AND 375x812. */}
            {stats ? (
              <div className="mt-6 max-w-sm" data-testid="landing-progress">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
                  <div
                    className="h-full rounded-full bg-[#41a050]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">
                  {progressPct}% completed - {stats.prices.toLocaleString('en-US')} real prices posted
                </p>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#a8bcc4]">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#e6ff32]" /> Free to join
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#e6ff32]" /> No app store download
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#e6ff32]" /> Works on any phone
                </span>
              </div>
            )}
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
        <section aria-label="Community stats" className="border-y border-white/10 bg-[#0f232b]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-white">{stats.prices.toLocaleString('en-US')}+</div>
              <div className="mt-1 text-xs text-[#a8bcc4]">real prices posted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-white">{stats.people.toLocaleString('en-US')}+</div>
              <div className="mt-1 text-xs text-[#a8bcc4]">locals and travelers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-white">{stats.countries}</div>
              <div className="mt-1 text-xs text-[#a8bcc4]">countries covered</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-[#e6ff32]">100%</div>
              <div className="mt-1 text-xs text-[#a8bcc4]">free, no ads, no fees</div>
            </div>
          </div>
        </section>
      )}

      {/* ============================== WHAT IS circubAwd (seo-about) ============================== */}
      <section aria-labelledby="seo-about-h" data-testid="seo-about" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 id="seo-about-h" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            What is circubAwd?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#a8bcc4] sm:text-base">
            circubAwd is a free community that helps you find local businesses -
            street food spots, taxi rides, hotels, salons, repairs - with real,
            current prices posted in the local currency by people who live
            there. Planning something? Build a proforma: list the items you
            need and the budget planner turns real local prices into an
            itemized cost estimate, place by place. Selling? Register as a
            Sales seller and post your products where buyers are already
            looking - your name and ratings travel with every post. The
            community votes and rates posts, so the most accurate prices rise
            to the top. circubAwd works in any browser and installs as a
            full-screen mobile app on Android and iPhone - no app store needed.
          </p>
        </div>
      </section>

      {/* ============================== HOW IT WORKS ============================== */}
      <section id="how" aria-labelledby="how-h" className="border-t border-white/10 bg-[#0f232b]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">Buy, plan, sell - in 3 steps</p>
            <h2 id="how-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
              How circubAwd works in 3 simple steps
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#a8bcc4] sm:text-base">
              No spreadsheets, no membership, no cost. Find a business, plan a
              proforma, or start selling - three steps, all free.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-white/10 bg-[#1b3340] p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6ff32]/10 text-[#e6ff32]">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-bold text-[#e6ff32]/25">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{step.title}</h3>
                <ul className="mt-3 space-y-2">
                  {step.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-[#a8bcc4]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e6ff32]" />
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
          eyebrow="Buy, plan, and sell in one place"
          title="Find businesses, plan your proforma, sell with trust"
          sub="circubAwd works for everyone who touches a city - explore it, plan what you will spend, or earn from what you already sell."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* travelers */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-[#1b3340] p-5 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6ff32]/10 text-[#e6ff32]">
              <Plane className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">For travelers</p>
            <h3 className="mt-1 text-base font-semibold text-white">Check prices before you go</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#a8bcc4]">
              See what food, transport, hotels and services really cost - posted by people who live there.
            </p>
          </div>

          {/* locals - the mockup's lime block: dark text on #e6ff32 */}
          <div className="flex flex-col rounded-2xl bg-[#e6ff32] p-5 text-[#0a1e25] shadow-md">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0a1e25]/10">
              <Store className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#0a1e25]/70">For locals</p>
            <h3 className="mt-1 text-base font-semibold">Put your business on the map</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#0a1e25]/80">
              Post your business with real prices - neighbors and travelers find you, and every post builds your name.
            </p>
            <Button
              onClick={onSignUp}
              className="mt-4 h-9 w-fit bg-[#0a1e25] font-mono text-xs uppercase tracking-[0.14em] text-white hover:bg-[#162930] hover:text-white"
              size="sm"
            >
              Post your first price
            </Button>
          </div>

          {/* guides */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-[#1b3340] p-5 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6ff32]/10 text-[#e6ff32]">
              <Compass className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">For guides</p>
            <h3 className="mt-1 text-base font-semibold text-white">Get booked directly</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#a8bcc4]">
              Offer your city knowledge, set your rate, and get booked by travelers - no middlemen.
            </p>
            <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#e6ff32] hover:underline">
              Become a guide <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* vendors */}
          <div className="flex flex-col rounded-2xl border border-white/10 bg-[#1b3340] p-5 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6ff32]/10 text-[#e6ff32]">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">For sellers</p>
            <h3 className="mt-1 text-base font-semibold text-white">Sell through registered sales</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#a8bcc4]">
              Register as a Sales seller, list your stuff with photos and real prices, and reach people already looking to buy.
            </p>
            <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#e6ff32] hover:underline">
              List what you sell <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* wide community card */}
        <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-[#e6ff32]/25 bg-[#e6ff32]/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6ff32]/10 text-[#e6ff32]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">Join the community</p>
              <h3 className="mt-1 text-base font-semibold text-white">Meet travelers and share your city</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#a8bcc4]">
                Answer questions, vouch for prices, and help the next visitor spend like a local.
              </p>
            </div>
          </div>
          <Button onClick={onSignUp} size="sm" className={`h-9 shrink-0 text-xs font-bold ${LIME_BTN}`}>
            Join the community
          </Button>
        </div>
      </section>

      {/* ============================== WHAT circubAwd DOES (seo-features, exactly 6 h3 cards) ============================== */}
      <section
        id="features"
        aria-labelledby="seo-features-h"
        data-testid="seo-features"
        className="border-t border-white/10 bg-[#0f232b]"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">Peace of mind</p>
            <h2 id="seo-features-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
              What circubAwd does
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#a8bcc4] sm:text-base">
              Everything you need to spend with complete peace of mind, in any
              city, in any currency.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-[#1b3340] p-5 shadow-sm">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6ff32]/10 text-[#e6ff32]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#a8bcc4]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== TOP SCORE ============================== */}
      <section id="top-score" aria-labelledby="top-score-h" data-testid="landing-top-score" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">Community leaderboard</p>
            <h2 id="top-score-h" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Top score
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#a8bcc4] sm:text-base">
              The most active contributors on circubAwd right now, ranked by
              prices posted. Every real price you share moves you up the
              board - and helps an entire city spend smarter.
            </p>
            <Button onClick={onSignUp} className={`mt-5 h-11 px-6 text-xs font-bold ${LIME_BTN}`}>
              Sign up to climb the board <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#1b3340] p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[#e6ff32]" />
              <span className="text-sm font-semibold text-white">Top score</span>
              <span className="ml-auto text-[11px] text-[#8fa6ae]">most prices posted</span>
            </div>
            <div className="space-y-2.5">
              {posters.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#8fa6ae]">
                  No posts yet - the board opens with the first price posted.
                </p>
              ) : (
                posters.map((p, i) => (
                  <div
                    key={p.id}
                    data-testid="landing-top-score-row"
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0a1e25] px-3.5 py-2.5"
                  >
                    <span className={`w-6 shrink-0 text-sm font-bold ${RANK_STYLES[i] || 'text-[#8fa6ae]'}`}>
                      #{i + 1}
                    </span>
                    <InitialAvatar name={p.name} color={p.avatarColor} className="h-8 w-8 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{p.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-amber-400">{p.postsCount} posts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== STORIES ============================== */}
      <section id="stories" aria-labelledby="stories-h" className="border-y border-white/10 bg-[#0f232b]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <SectionHeading
            eyebrow="Trusted community stories"
            title="Loved by travelers and locals alike"
            sub="Real people keeping each other informed, one price at a time."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                quote: "I stopped guessing what things cost. I check circubAwd before I book anything - it saved me real money in my first week abroad.",
                name: "Selam",
                role: "Traveler",
                color: "teal",
              },
              {
                quote: "I registered as a Sales seller and posted my street food spot with real prices. Travelers find me, neighbors trust me, and my name is on the Top score board.",
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
              <figure key={s.name} className="flex flex-col rounded-2xl border border-white/10 bg-[#1b3340] p-5 shadow-sm">
                <div className="flex items-center gap-1" aria-label="5 out of 5 stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-[#e6ff32] text-[#e6ff32]" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-white">
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5">
                  <InitialAvatar name={s.name} color={s.color} className="h-9 w-9 text-xs" />
                  <div>
                    <div className="text-sm font-semibold text-white">{s.name}</div>
                    <div className="text-xs text-[#a8bcc4]">{s.role}</div>
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
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">Quick answers</p>
          <h2 id="seo-faq-h" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-sm text-[#a8bcc4] sm:text-base">
            Everything people ask before their first price, answered.
          </p>
        </div>

        <div className="mt-8 space-y-2.5">
          {FAQ_ITEMS.map((item, i) => (
            <details
              key={item.q}
              data-testid={`faq-item-${i}`}
              className="group rounded-xl border border-white/10 bg-[#1b3340] px-4 py-3"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-[#8fa6ae] transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-[#a8bcc4]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ============================== CTA BAND ============================== */}
      <section aria-labelledby="cta-h" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 lg:pb-16">
        <div className="rounded-3xl border border-white/10 bg-[#0a1e25] px-6 py-12 text-center shadow-lg sm:px-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#e6ff32]">Join the community</p>
          <h2 id="cta-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Find local businesses. Plan with a proforma. Sell with trust.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#a8bcc4] sm:text-base">
            Join free, put your business on the map, build a proforma for
            anything you need, or start selling through registered sales.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button
              data-testid="landing-cta"
              onClick={onSignUp}
              size="lg"
              className={`h-12 w-full px-8 text-sm font-bold sm:w-auto ${LIME_BTN}`}
            >
              Join for free
            </Button>
            <PwaInstallButton className="h-12 w-full border-white/30 bg-transparent px-8 font-mono text-sm uppercase tracking-[0.14em] text-white hover:bg-white hover:text-[#0a1e25] sm:w-auto" />
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-white/75">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#e6ff32]" /> No app store download
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#e6ff32]" /> Free to join
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#e6ff32]" /> Available worldwide
            </span>
          </div>
        </div>
      </section>

      {/* ============================== FOOTER ============================== */}
      <footer className="border-t border-white/15 bg-[#0f232b]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark size="h-8 w-8 text-sm" />
                <span className="text-lg font-bold tracking-tight text-white">circubAwd</span>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-[#a8bcc4]">
                Real prices, shared by people who live there. Free forever,
                on any phone, in any currency.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">Product</p>
              <ul className="mt-3 space-y-2 text-xs text-[#a8bcc4]">
                <li><a href="#how" className="transition-colors hover:text-[#e6ff32]">How it works</a></li>
                <li><a href="#features" className="transition-colors hover:text-[#e6ff32]">Features</a></li>
                <li><a href="#top-score" className="transition-colors hover:text-[#e6ff32]">Top score</a></li>
                <li><a href="#stories" className="transition-colors hover:text-[#e6ff32]">Community stories</a></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">Legal &amp; company</p>
              <ul className="mt-3 space-y-2 text-xs text-[#a8bcc4]">
                <li><a href="/contact" className="transition-colors hover:text-[#e6ff32]">Contact</a></li>
                <li><a href="/privacy" className="transition-colors hover:text-[#e6ff32]">Privacy</a></li>
                <li><a href="/terms" className="transition-colors hover:text-[#e6ff32]">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 border-t border-white/10 pt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#8fa6ae]">
            <span>&copy; {new Date().getFullYear()} circubAwd</span>
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

