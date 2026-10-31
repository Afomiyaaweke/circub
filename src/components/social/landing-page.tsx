'use client'

// v223: the landing page flips to a LIGHT, fun, sign-up-first design -
// modeled on the user's HustleHub reference screenshot (light mint page,
// bright green CTA pills with white text, white cards on alternating mint
// bands, one deep-green feature block, a dark-green rounded CTA banner).
// The whole page is now ALWAYS LIGHT - independent of the app theme
// tokens - with explicit hex classes so the landing looks identical in
// light and dark mode.
//
// What changed vs v222's dark page:
//   - palette: page #f6faf7, mint bands #eef6f0, white cards, ink
//     headings #0b2b1d, body #42604f, primary green #059669 (white-text
//     pills like the reference), lime #34d399 reserved for accents and
//     the deep-band CTA, deep green #0c2b1d for the community block and
//     the final CTA banner.
//   - nav: logo + wordmark on the LEFT (reference layout), section links
//     center, and a bright green "Join free" pill CTA in the bar - the
//     sign-up action is now reachable from the very first pixel.
//   - hero adds a social-proof row (initial-avatar cluster + 5 stars +
//     real member count from the server stats) and keeps the real-data
//     progress bar toward the next 1,000-price milestone.
//   - NEW chip strip under the hero ("Ask anything before you go") and a
//     NEW compact "Stop guessing. Start knowing." comparison table
//     (Guessing alone vs With circubAwd) - conversion framing, zero
//     invented numbers.
//   - the wide community card becomes the deep-green feature band (the
//     reference's simulator block position) and the CTA band becomes the
//     dark-green rounded banner with a lime pill, plus an
//     "Already have an account? Sign in" link for returning visitors.
//   - every section reskinned light: white cards, mint alternating bands,
//     colorful pastel icon chips on the six feature cards.
//
// Constraints that still shape it (all E2E-locked, see task101+ suites):
//   - landing-headline / landing-copy / landing-cta / landing-signup /
//     landing-signin / landing-install / landing-version
//     all still exist and stay visible on desktop (L1-L4).
//   - the hero is still the single <main> and must fit one viewport at
//     1440x900 AND 375x812 (L5 / M5-pre) - the phone mockup is
//     desktop-only for exactly that reason, and the social-proof row is
//     height-neutral vs the rows it extends.
//   - landing-root contains no <img> (L0): the phone, the avatars, every
//     visual is CSS plus inline lucide SVG icons.
//   - no em dash anywhere inside landing-root (L2c) - copy uses hyphens.
//   - seo-about / seo-features / seo-faq keep their testids; seo-features
//     keeps exactly six <h3> cards; the FAQ keeps its 5 items + JSON-LD
//     generated from the same strings (M35h/i/j/k).
//   - the Top score board (same public /api/top-posters feed the
//     v138 profile board uses) still lives here as social proof.
//   - v222 landing re-emphasis copy is preserved verbatim: the Q&A
//     headline + minutes-fast copy (i18n, 6 languages), the two-sided
//     hero paragraph (ask / answer-stickers-gigs), the locals
//     "Know your city? Get paid for it" card, the guides "guide or a
//     travel agent" line and the community stickers line.

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  Compass,
  Languages,
  MessageCircle,
  Plane,
  Play,
  Search,
  Sparkles,
  Star,
  Store,
  Tag,
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

// v223 palette - light, fun, sampled from the user's HustleHub reference.
const C = {
  page: '#f6faf7', // light mint-white page background
  band: '#eef6f0', // alternating mint section bands
  card: '#ffffff', // raised card surface
  ink: '#0b2b1d', // headings / primary text (deep green-black)
  body: '#42604f', // body text
  faint: '#6d8578', // faint meta text
  green: '#059669', // primary green - bright CTA pills (white text)
  greenDk: '#047857', // hover green
  deep: '#0c2b1d', // deep-green feature/CTA bands
  lime: '#34d399', // lime accent on dark bands + checks
  hair: '#dcebe1', // hairlines
  mint: '#e5f4ea', // tint chips
}

// Shared bright-green CTA pill - the reference's "Start Hunting Free".
const GREEN_BTN =
  'rounded-full bg-[#059669] text-white hover:bg-[#047857] hover:text-white font-bold'

// Lime pill for deep-green surfaces - pops like the reference's banner CTA.
const LIME_BTN =
  'rounded-full bg-[#34d399] text-[#0c2b1d] hover:bg-[#10b981] hover:text-white font-bold'

// Pastel icon-chip tints - the playful per-card color coding (v223).
const TINTS = [
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
]

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
    body: "No price posted yet? Ask anything and a real local replies in minutes - true prices, shop checks, translation.",
  },
  {
    icon: Compass,
    title: "Local guides & travel agents",
    body: "Find guides by city, language and specialty - or book a registered travel agent to plan the whole trip.",
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
    title: "Ask, get answers, spend smart",
    items: [
      "Ask any city or country question - real locals reply in minutes",
      "Get true prices, shop checks and translation, not guesses",
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

// The reference's comparison table, translated to circubAwd - every cell
// restates what the product actually does, nothing invented.
const GUESSING_ROWS = [
  {
    topic: "What does lunch really cost here?",
    guess: "Tourist prices and rough guesses",
    real: "Real prices posted by locals",
  },
  {
    topic: "Is this taxi fare fair?",
    guess: "No way to check before you ride",
    real: "Compare fares other locals posted",
  },
  {
    topic: "Need a shop check or translation?",
    guess: "Hope you find help",
    real: "Ask a local - answers in minutes",
  },
  {
    topic: "Planning what to spend?",
    guess: "Mental math that misses things",
    real: "A proforma built from real prices",
  },
]

// Fun chip strip under the hero - the reference's payout-logos slot,
// translated to what circubAwd actually answers.
const ASK_CHIPS = [
  { icon: Tag, label: "True prices" },
  { icon: Camera, label: "Shop checks" },
  { icon: Languages, label: "Translation" },
  { icon: Compass, label: "Guide help" },
  { icon: Plane, label: "Travel agents" },
  { icon: Sparkles, label: "Gigs & stickers" },
]

// Same avatar palette as the app (top-posters-card, /u share profiles) -
// every face on this page is an initial on a brand color, never an <img>.
const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-emerald-600', red: 'bg-red-600',
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

// The brand mark on light ground: a white disc with the green gradient C.
function BrandMark({ size = 'h-9 w-9 text-base' }: { size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-[#dcebe1]`} aria-hidden="true">
      <span className="bg-gradient-to-br from-[#10b981] via-[#059669] to-[#047857] bg-clip-text font-bold text-transparent">C</span>
    </span>
  )
}

function SectionHeading({ eyebrow, title, sub, center = true }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#059669]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0b2b1d] sm:text-3xl">{title}</h2>
      {sub && <p className="mt-3 text-sm leading-relaxed text-[#42604f] sm:text-base">{sub}</p>}
    </div>
  )
}

// Pure-CSS phone mockup of the feed - desktop only, no images (L0).
// Reskinned to the light palette (v223).
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[300px]" aria-hidden="true">
      <div className="relative rounded-[2.2rem] border border-[#0b2b1d]/10 bg-white p-2.5 shadow-2xl">
        <div className="overflow-hidden rounded-[1.8rem] bg-[#f6faf7]">
          {/* app header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-1.5">
              <div className="grid h-5 w-5 place-items-center rounded-md bg-[#059669] text-[10px] font-bold text-white">C</div>
              <span className="text-xs font-bold text-[#0b2b1d]">circubAwd</span>
            </div>
            <InitialAvatar name="M" color="amber" className="h-5 w-5 text-[9px]" />
          </div>
          {/* search pill */}
          <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-full border border-[#dcebe1] bg-white px-3 py-1.5">
            <Search className="h-3 w-3 text-[#6d8578]" />
            <span className="text-[10px] text-[#6d8578]">Find local businesses near you</span>
          </div>
          {/* price card 1 */}
          <div className="mx-3 mb-2 rounded-xl border border-[#dcebe1] bg-white p-2.5">
            <div className="flex items-center gap-2">
              <InitialAvatar name="A" color="green" className="h-7 w-7 text-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-[#0b2b1d]">Grill Machine</div>
                <div className="truncate text-[9px] text-[#6d8578]">Nica Trail - street food</div>
              </div>
              <div className="text-[11px] font-bold text-[#059669]">$80 - $100</div>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#059669]/10 px-2 py-0.5 text-[9px] font-medium text-[#047857]">
                <Check className="h-2.5 w-2.5" /> Verified local
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium text-amber-700">4.9</span>
            </div>
          </div>
          {/* event card - the one solid-green pop, like the reference */}
          <div className="mx-3 mb-2 rounded-xl bg-[#10b981] p-3 text-white">
            <div className="text-[9px] uppercase tracking-wider opacity-80">This weekend</div>
            <div className="text-xs font-bold">Annual Festival</div>
            <div className="mt-1.5 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium">Free entry</div>
          </div>
          {/* price card 2 */}
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-[#dcebe1] bg-white p-2.5">
            <InitialAvatar name="T" color="teal" className="h-7 w-7 text-[10px]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-[#0b2b1d]">Taxi - airport to center</div>
              <div className="truncate text-[9px] text-[#6d8578]">Posted 2 min ago</div>
            </div>
            <div className="text-[11px] font-bold text-[#059669]">$12 - $15</div>
          </div>
          {/* bottom nav */}
          <div className="flex items-center justify-around border-t border-[#dcebe1] bg-white py-2.5">
            <Search className="h-3.5 w-3.5 text-[#059669]" />
            <div className="grid h-7 w-7 place-items-center rounded-full bg-[#059669] text-white">
              <Camera className="h-3.5 w-3.5" />
            </div>
            <MessageCircle className="h-3.5 w-3.5 text-[#93b3a2]" />
            <Users className="h-3.5 w-3.5 text-[#93b3a2]" />
            <Plane className="h-3.5 w-3.5 text-[#93b3a2]" />
          </div>
        </div>
      </div>
      {/* floating proof chips - kept inside the column bounds */}
      <div className="absolute -left-8 top-14 rounded-xl border border-[#0b2b1d]/10 bg-white px-3 py-2 shadow-lg sm:-left-12">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#0b2b1d]">
          <Check className="h-3 w-3 text-[#059669]" /> Real price posted
        </div>
        <div className="text-[9px] text-[#6d8578]">2 minutes ago</div>
      </div>
      <div className="absolute -right-4 bottom-28 rounded-xl border border-[#0b2b1d]/10 bg-white px-3 py-2 shadow-lg sm:-right-8">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#0b2b1d]">
          <Trophy className="h-3 w-3 text-amber-500" /> #1 on Top score
        </div>
        <div className="text-[9px] text-[#6d8578]">Meron - 5 posts</div>
      </div>
    </div>
  )
}

/**
 * v223 landing - the light, fun, sign-up-first reskin. One scroll,
 * thirteen moments: nav / hero+phone+social proof / ask-chip strip /
 * real stats / what is circubAwd / 3 steps / roles + deep-green community
 * band / what circubAwd does / guessing-vs-circubAwd / Top score /
 * stories / FAQ / CTA banner + footer.
 *
 * Entry points (unchanged semantics, E2E-locked):
 *   landing-cta      the CTA banner's "Join for free" - opens sign-up
 *   landing-signup   the hero's primary "Sign up free" - opens sign-up
 *   landing-signin   the nav's "Sign in" - opens login
 *   landing-install  the nav's PWA install button (Android one-tap,
 *                    iOS step-by-step; hides once standalone)
 *   landing-version  footer version marker
 *   landing-progress the hero progress bar toward the next price milestone
 *   landing-nav-cta  NEW v223: the nav's "Join free" pill - opens sign-up
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

  const RANK_STYLES = ['text-amber-500', 'text-slate-400', 'text-orange-500']

  // v186, kept on real data: how far the community is toward the next
  // 1,000 posted prices. Never faked: when stats are missing the bar is
  // replaced by the plain social-proof row.
  const goal = stats ? Math.max(1000, Math.ceil(stats.prices / 1000) * 1000) : 0
  const progressPct = stats && goal > 0 ? Math.min(99, Math.round((stats.prices / goal) * 100)) : 0

  return (
    <div data-testid="landing-root" className="relative min-h-[100dvh] bg-[#f6faf7] text-[#0b2b1d]">
      {/* ============================== NAV ============================== */}
      <header className="sticky top-0 z-30 border-b border-[#dcebe1] bg-[#f6faf7]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* left: brand + wordmark (reference layout) */}
          <a href="#" className="flex items-center gap-2.5" aria-label="circubAwd home">
            <BrandMark />
            <span className="text-xl font-bold tracking-tight text-[#0b2b1d]">circubAwd</span>
          </a>

          {/* center: section links (desktop) */}
          <nav
            className="hidden items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#42604f] lg:flex"
            aria-label="Landing sections"
          >
            <a href="#how" className="transition-colors hover:text-[#059669]">How it works</a>
            <a href="#features" className="transition-colors hover:text-[#059669]">Features</a>
            <a href="#top-score" className="transition-colors hover:text-[#059669]">Top score</a>
            <a href="#stories" className="transition-colors hover:text-[#059669]">Stories</a>
            <a href="#faq" className="transition-colors hover:text-[#059669]">FAQs</a>
          </nav>

          {/* right: controls + the bright join pill */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <LanguageMenu />
            <ThemeToggle className="border border-[#0b2b1d]/10 bg-white/70 shadow-none hover:bg-white hover:text-[#0b2b1d]" />
            <Button
              data-testid="landing-signin"
              onClick={onLogin}
              variant="ghost"
              className="hidden h-9 px-3 font-mono text-xs uppercase tracking-[0.14em] text-[#0b2b1d] hover:bg-white hover:text-[#0b2b1d] sm:inline-flex"
            >
              {t('landing.signIn')}
            </Button>
            <span className="hidden sm:inline-flex" data-testid="landing-install">
              <PwaInstallButton
                compact
                className="h-9 border-[#059669]/30 bg-transparent px-3 text-xs text-[#059669] shadow-none hover:border-[#059669] hover:bg-[#059669] hover:text-white sm:text-sm"
              />
            </span>
            <Button
              data-testid="landing-nav-cta"
              onClick={onSignUp}
              size="sm"
              className={`h-9 px-4 text-xs shadow-sm ${GREEN_BTN}`}
            >
              Join free
            </Button>
          </div>
        </div>
      </header>

      {/* ============================== HERO (the single <main>) ============================== */}
      <main className="relative overflow-x-clip">
        {/* soft brand glows, tuned for the light mint ground */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute left-[12%] top-[-22%] h-[420px] w-[420px] rounded-full bg-[#34d399]/15 blur-3xl" />
          <div className="absolute right-[4%] top-[28%] h-[300px] w-[300px] rounded-full bg-[#059669]/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#059669]/25 bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#059669] shadow-sm">
              <Plane className="h-3 w-3" />
              Real locals. Fast answers. True prices.
            </div>

            <h1
              data-testid="landing-headline"
              className="mt-4 max-w-lg text-3xl font-bold leading-[1.12] tracking-tight text-[#0b2b1d] sm:text-4xl lg:text-[2.75rem]"
            >
              {t('landing.headline')}
            </h1>

            <p data-testid="landing-copy" className="mt-3 text-sm font-bold tracking-wide text-[#059669] sm:text-base">
              {t('landing.copy')}
            </p>

            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#42604f] sm:text-base">
              Ask anything before you go - a real local answers in minutes, with true prices, shop
              checks, translation and guide help. Know your city? Answer questions, collect
              stickers, and earn from gigs - even get booked as a travel agent.
            </p>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                data-testid="landing-signup"
                onClick={onSignUp}
                size="lg"
                className={`h-12 px-7 text-sm shadow-md shadow-[#059669]/20 transition-transform hover:-translate-y-0.5 ${GREEN_BTN}`}
              >
                {t('landing.signUpFree')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-[#0b2b1d]/15 bg-white px-6 font-mono text-sm uppercase tracking-[0.14em] text-[#0b2b1d] hover:bg-white hover:text-[#059669]"
                asChild
              >
                <a href="#how">
                  <Play className="h-4 w-4" /> See how it works
                </a>
              </Button>
            </div>

            {/* social proof + real-data progress: both rows are height-neutral
                together vs the rows they replace, so the hero still fits one
                viewport at 1440x900 AND 375x812 (L5 / M5-pre). */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3" data-testid="landing-social-proof">
              <div className="flex items-center">
                {['teal', 'amber', 'purple', 'orange', 'blue'].map((c, i) => (
                  <InitialAvatar
                    key={c}
                    name={['S', 'M', 'D', 'A', 'K'][i]}
                    color={c}
                    className="-ml-1.5 h-7 w-7 text-[10px] ring-2 ring-white first:ml-0"
                  />
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1" aria-label="5 out of 5 stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-3 w-3 fill-[#059669] text-[#059669]" />
                  ))}
                  <span className="ml-1 text-[11px] font-bold text-[#0b2b1d]">Community loved</span>
                </div>
                <p className="text-[11px] text-[#6d8578]">
                  {stats
                    ? `Joined by ${stats.people.toLocaleString('en-US')}+ locals and travelers`
                    : 'Free to join - works on any phone'}
                </p>
              </div>
            </div>

            {stats ? (
              <div className="mt-4 max-w-sm" data-testid="landing-progress">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e2ece5]">
                  <div
                    className="h-full rounded-full bg-[#059669]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#42604f]">
                  {progressPct}% completed - {stats.prices.toLocaleString('en-US')} real prices posted
                </p>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#42604f]">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#059669]" /> Free to join
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#059669]" /> No app store download
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#059669]" /> Works on any phone
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

      {/* ============================== ASK-ANYTHING CHIP STRIP ============================== */}
      <section aria-label="What you can ask" className="border-y border-[#dcebe1] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 sm:px-6">
          <p className="text-center font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#6d8578]">
            Ask anything before you go
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {ASK_CHIPS.map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcebe1] bg-[#f6faf7] px-3 py-1.5 text-xs font-semibold text-[#0b2b1d] transition-transform hover:-translate-y-0.5"
              >
                <chip.icon className="h-3.5 w-3.5 text-[#059669]" />
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== REAL STATS BAND ============================== */}
      {stats && (
        <section aria-label="Community stats" className="bg-[#eef6f0]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-[#0b2b1d]">{stats.prices.toLocaleString('en-US')}+</div>
              <div className="mt-1 text-xs text-[#42604f]">real prices posted</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-[#0b2b1d]">{stats.people.toLocaleString('en-US')}+</div>
              <div className="mt-1 text-xs text-[#42604f]">locals and travelers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-[#0b2b1d]">{stats.countries}</div>
              <div className="mt-1 text-xs text-[#42604f]">countries covered</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tracking-tight text-[#059669]">100%</div>
              <div className="mt-1 text-xs text-[#42604f]">free, no ads, no fees</div>
            </div>
          </div>
        </section>
      )}

      {/* ============================== WHAT IS circubAwd (seo-about) ============================== */}
      <section aria-labelledby="seo-about-h" data-testid="seo-about" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 id="seo-about-h" className="text-2xl font-bold tracking-tight text-[#0b2b1d] sm:text-3xl">
            What is circubAwd?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#42604f] sm:text-base">
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
      <section id="how" aria-labelledby="how-h" className="bg-[#eef6f0]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#059669]">Buy, plan, sell - in 3 steps</p>
            <h2 id="how-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-[#0b2b1d] sm:text-3xl">
              How circubAwd works in 3 simple steps
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#42604f] sm:text-base">
              No spreadsheets, no membership, no cost. Find a business, plan a
              proforma, or start selling - three steps, all free.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-[#dcebe1] bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl ${TINTS[i]}`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-bold text-[#059669]/25">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#0b2b1d]">{step.title}</h3>
                <ul className="mt-3 space-y-2">
                  {step.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs leading-relaxed text-[#42604f]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#059669]" />
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
          <div className="flex flex-col rounded-2xl border border-[#dcebe1] bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#059669]/10 text-[#059669]">
              <Plane className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#059669]">For travelers</p>
            <h3 className="mt-1 text-base font-semibold text-[#0b2b1d]">Ask before you go</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#42604f]">
              See what food, transport, hotels and services really cost - or just ask and get a fast answer from someone who lives there.
            </p>
          </div>

          {/* locals - the fun brand block: dark text on lime */}
          <div className="flex flex-col rounded-2xl bg-[#34d399] p-5 text-[#0c2b1d] shadow-md transition-transform hover:-translate-y-0.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0c2b1d]/10">
              <Store className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#0c2b1d]/70">For locals</p>
            <h3 className="mt-1 text-base font-semibold">Know your city? Get paid for it</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#0c2b1d]/80">
              Answer questions, collect stickers, and earn from gigs - your local knowledge is worth money here.
            </p>
            <Button
              onClick={onSignUp}
              className="mt-4 h-9 w-fit rounded-full bg-[#0c2b1d] font-mono text-xs uppercase tracking-[0.14em] text-white hover:bg-[#0b2b1d] hover:text-white"
              size="sm"
            >
              Post your first price
            </Button>
          </div>

          {/* guides */}
          <div className="flex flex-col rounded-2xl border border-[#dcebe1] bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#059669]/10 text-[#059669]">
              <Compass className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#059669]">For guides & agents</p>
            <h3 className="mt-1 text-base font-semibold text-[#0b2b1d]">Get booked directly</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#42604f]">
              Register as a guide or a travel agent, set your rate, and get booked by travelers - no middlemen.
            </p>
            <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:underline">
              Become a guide or agent <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* vendors */}
          <div className="flex flex-col rounded-2xl border border-[#dcebe1] bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#059669]/10 text-[#059669]">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#059669]">For sellers</p>
            <h3 className="mt-1 text-base font-semibold text-[#0b2b1d]">Sell through registered sales</h3>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-[#42604f]">
              Register as a Sales seller, list your stuff with photos and real prices, and reach people already looking to buy.
            </p>
            <button onClick={onSignUp} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:underline">
              List what you sell <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* wide community card - the deep-green feature band (reference
            simulator position): dark ground, lime accents, one bold CTA */}
        <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl bg-[#0c2b1d] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#34d399]/15 text-[#34d399]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#34d399]">Join the community</p>
              <h3 className="mt-1 text-base font-semibold text-white">Answer questions, collect stickers, earn from gigs</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#a9cdb8]">
                Help the next visitor spend like a local - every answer, vouch and gig builds your name on the Top score board.
              </p>
            </div>
          </div>
          <Button onClick={onSignUp} size="sm" className={`h-10 shrink-0 px-5 text-xs shadow-md shadow-[#34d399]/20 ${LIME_BTN}`}>
            Join the community
          </Button>
        </div>
      </section>

      {/* ============================== WHAT circubAwd DOES (seo-features, exactly 6 h3 cards) ============================== */}
      <section
        id="features"
        aria-labelledby="seo-features-h"
        data-testid="seo-features"
        className="bg-[#eef6f0]"
      >
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#059669]">Peace of mind</p>
            <h2 id="seo-features-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-[#0b2b1d] sm:text-3xl">
              What circubAwd does
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#42604f] sm:text-base">
              Everything you need to spend with complete peace of mind, in any
              city, in any currency.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="rounded-2xl border border-[#dcebe1] bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${TINTS[i % TINTS.length]}`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#0b2b1d]">{f.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#42604f]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== GUESSING VS CIRCUBAWD ============================== */}
      <section aria-labelledby="compare-h" className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-16">
        <SectionHeading
          eyebrow="Why circubAwd"
          title="Stop guessing. Start knowing."
          sub="Every question you have about a city - someone who lives there already knows the answer."
        />

        <div className="mt-10 overflow-hidden rounded-2xl border border-[#dcebe1] bg-white shadow-sm">
          <div className="grid grid-cols-[1.2fr_1fr_1fr] items-stretch border-b border-[#dcebe1] bg-[#eef6f0] text-[11px] font-bold uppercase tracking-[0.12em]">
            <div className="px-4 py-3 text-[#42604f]">Before you spend</div>
            <div className="px-4 py-3 text-[#6d8578]">Guessing alone</div>
            <div className="px-4 py-3 text-[#059669]">With circubAwd</div>
          </div>
          {GUESSING_ROWS.map((row, i) => (
            <div
              key={row.topic}
              className={`grid grid-cols-[1.2fr_1fr_1fr] items-center text-xs sm:text-sm ${i < GUESSING_ROWS.length - 1 ? 'border-b border-[#dcebe1]' : ''}`}
            >
              <div className="px-4 py-3.5 font-semibold text-[#0b2b1d]">{row.topic}</div>
              <div className="flex items-start gap-1.5 px-4 py-3.5 text-[#6d8578]">
                <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-[-45deg] text-rose-400" />
                <span>{row.guess}</span>
              </div>
              <div className="flex items-start gap-1.5 px-4 py-3.5 font-medium text-[#0b2b1d]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#059669]" />
                <span>{row.real}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Button onClick={onSignUp} className={`h-11 px-6 text-xs shadow-md shadow-[#059669]/20 ${GREEN_BTN}`}>
            Join free and ask your first question <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ============================== TOP SCORE ============================== */}
      <section id="top-score" aria-labelledby="top-score-h" data-testid="landing-top-score" className="bg-[#eef6f0]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#059669]">Community leaderboard</p>
              <h2 id="top-score-h" className="mt-2 text-2xl font-bold tracking-tight text-[#0b2b1d] sm:text-3xl">
                Top score
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[#42604f] sm:text-base">
                The most active contributors on circubAwd right now, ranked by
                prices posted. Every real price you share moves you up the
                board - and helps an entire city spend smarter.
              </p>
              <Button onClick={onSignUp} className={`mt-5 h-11 px-6 text-xs shadow-md shadow-[#059669]/20 ${GREEN_BTN}`}>
                Sign up to climb the board <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-2xl border border-[#dcebe1] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-[#0b2b1d]">Top score</span>
                <span className="ml-auto text-[11px] text-[#6d8578]">most prices posted</span>
              </div>
              <div className="space-y-2.5">
                {posters.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#6d8578]">
                    No posts yet - the board opens with the first price posted.
                  </p>
                ) : (
                  posters.map((p, i) => (
                    <div
                      key={p.id}
                      data-testid="landing-top-score-row"
                      className="flex items-center gap-3 rounded-xl border border-[#dcebe1] bg-[#f6faf7] px-3.5 py-2.5"
                    >
                      <span className={`w-6 shrink-0 text-sm font-bold ${RANK_STYLES[i] || 'text-[#6d8578]'}`}>
                        #{i + 1}
                      </span>
                      <InitialAvatar name={p.name} color={p.avatarColor} className="h-8 w-8 text-[11px]" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#0b2b1d]">{p.name}</span>
                      <span className="shrink-0 text-xs font-semibold text-amber-600">{p.postsCount} posts</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================== STORIES ============================== */}
      <section id="stories" aria-labelledby="stories-h" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
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
            <figure key={s.name} className="flex flex-col rounded-2xl border border-[#dcebe1] bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-1" aria-label="5 out of 5 stars">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#059669] text-[#059669]" />
                ))}
              </div>
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-[#0b2b1d]">
                &ldquo;{s.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 flex items-center gap-2.5">
                <InitialAvatar name={s.name} color={s.color} className="h-9 w-9 text-xs" />
                <div>
                  <div className="text-sm font-semibold text-[#0b2b1d]">{s.name}</div>
                  <div className="text-xs text-[#42604f]">{s.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ============================== FAQ (seo-faq, 5 items + JSON-LD) ============================== */}
      <section
        id="faq"
        aria-labelledby="seo-faq-h"
        data-testid="seo-faq"
        className="bg-[#eef6f0]"
      >
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#059669]">Quick answers</p>
            <h2 id="seo-faq-h" className="mt-2 text-2xl font-bold tracking-tight text-[#0b2b1d] sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-sm text-[#42604f] sm:text-base">
              Everything people ask before their first price, answered.
            </p>
          </div>

          <div className="mt-8 space-y-2.5">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={item.q}
                data-testid={`faq-item-${i}`}
                className="group rounded-xl border border-[#dcebe1] bg-white px-4 py-3"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[#0b2b1d] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-[#6d8578] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-[#42604f]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== CTA BANNER (deep green, reference style) ============================== */}
      <section aria-labelledby="cta-h" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="rounded-3xl bg-[#0c2b1d] px-6 py-12 text-center shadow-xl sm:px-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#34d399]">Join the community</p>
          <h2 id="cta-h" className="mx-auto mt-2 max-w-xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Find local businesses. Plan with a proforma. Sell with trust.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#a9cdb8] sm:text-base">
            Join free, put your business on the map, build a proforma for
            anything you need, or start selling through registered sales.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button
              data-testid="landing-cta"
              onClick={onSignUp}
              size="lg"
              className={`h-12 w-full px-8 text-sm shadow-md shadow-[#34d399]/20 sm:w-auto ${LIME_BTN}`}
            >
              Join for free
            </Button>
            <PwaInstallButton className="h-12 w-full rounded-full border-white/30 bg-transparent px-8 font-mono text-sm uppercase tracking-[0.14em] text-white hover:bg-white hover:text-[#0c2b1d] sm:w-auto" />
          </div>
          <button
            onClick={onLogin}
            className="mt-4 text-xs font-semibold text-[#a9cdb8] underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Already have an account? Sign in
          </button>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#34d399]" /> No app store download
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#34d399]" /> Free to join
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[#34d399]" /> Available worldwide
            </span>
          </div>
        </div>
      </section>

      {/* ============================== FOOTER ============================== */}
      <footer className="border-t border-[#dcebe1] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <BrandMark size="h-8 w-8 text-sm" />
                <span className="text-lg font-bold tracking-tight text-[#0b2b1d]">circubAwd</span>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-[#42604f]">
                Real prices, shared by people who live there. Free forever,
                on any phone, in any currency.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#0b2b1d]">Product</p>
              <ul className="mt-3 space-y-2 text-xs text-[#42604f]">
                <li><a href="#how" className="transition-colors hover:text-[#059669]">How it works</a></li>
                <li><a href="#features" className="transition-colors hover:text-[#059669]">Features</a></li>
                <li><a href="#top-score" className="transition-colors hover:text-[#059669]">Top score</a></li>
                <li><a href="#stories" className="transition-colors hover:text-[#059669]">Community stories</a></li>
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#0b2b1d]">Legal &amp; company</p>
              <ul className="mt-3 space-y-2 text-xs text-[#42604f]">
                <li><a href="/contact" className="transition-colors hover:text-[#059669]">Contact</a></li>
                <li><a href="/privacy" className="transition-colors hover:text-[#059669]">Privacy</a></li>
                <li><a href="/terms" className="transition-colors hover:text-[#059669]">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 border-t border-[#dcebe1] pt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#6d8578]">
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
