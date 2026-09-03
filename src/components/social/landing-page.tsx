'use client'

import { useState, useEffect } from 'react'
import {
  MapPin, Users, Building2, Sparkles, Lightbulb, ShieldCheck, Globe,
  TrendingUp, BadgeCheck, ArrowRight, MessageSquare, Eye, ThumbsUp,
  UserPlus, Search, Heart, Star, ChevronRight, Plane, Compass, PackageOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface LandingPageProps {
  onSignUp: () => void
  onLogin: () => void
}

interface RecentPrice {
  id: string
  productName: string
  postType: string
  country: string
  city: string | null
  currency: string
  priceMin: number
  priceMax: number
  category: string
  helpfulCount: number
  author: {
    id: string
    name: string
    avatarColor: string
    isLocal: boolean
    verifiedLocal: boolean
    location: string | null
  }
}

const FEATURES = [
  {
    icon: MapPin,
    title: 'Real local prices',
    description: 'Locals post what things actually cost · not tourist prices. See typical ranges, fair prices, and what tourists commonly get charged.',
    color: 'text-primary',
  },
  {
    icon: Users,
    title: 'Verified locals',
    description: 'Every contributor is a verified local. Build trust by checking their reputation, rating, and the number of helpful votes they earned.',
    color: 'text-emerald-600',
  },
  {
    icon: TrendingUp,
    title: 'Price history & consensus',
    description: 'When multiple locals post about the same product, we aggregate a community consensus and show how prices change over time.',
    color: 'text-amber-600',
  },
  {
    icon: ShieldCheck,
    title: 'Helpful voting & reports',
    description: 'Travelers vote on accuracy and flag outdated or fake posts. Community reputation keeps information trustworthy.',
    color: 'text-purple-600',
  },
  {
    icon: MessageSquare,
    title: 'Ask a local',
    description: 'Can\'t find what you need? Send a direct message to a verified local in your destination city and get personalized help.',
    color: 'text-blue-600',
  },
  {
    icon: Building2,
    title: 'Personal & Company accounts',
    description: 'Travelers join with a personal profile. Businesses · co-ops, exporters, shops, hotels · join with a company page to share listings and connect directly with travelers.',
    color: 'text-rose-600',
  },
]

const STEPS = [
  {
    number: '01',
    icon: Compass,
    title: 'Pick a destination',
    description: 'Select a country or city you\'re traveling to. Browse the Local Price Feed to see what locals have recently shared.',
  },
  {
    number: '02',
    icon: Eye,
    title: 'Check real prices',
    description: 'See typical local price ranges, recommended fair prices, and what tourists commonly get charged for the same product or service.',
  },
  {
    number: '03',
    icon: Lightbulb,
    title: 'Read local tips',
    description: 'Verified locals share tips on bargaining, quality, hidden markets, and where to find the best deals · knowledge that guidebooks don\'t have.',
  },
  {
    number: '04',
    icon: MessageSquare,
    title: 'Ask a local',
    description: 'If you can\'t find what you need, send a direct message to a local expert. Get personalized help in minutes · not from a chatbot, from a real person who lives there.',
  },
  {
    number: '05',
    icon: ThumbsUp,
    title: 'Vote & give back',
    description: 'Vote on posts you found helpful. Report outdated info. Help future travelers · and build the local\'s reputation.',
  },
]

export function LandingPage({ onSignUp, onLogin }: LandingPageProps) {
  const [recentPrices, setRecentPrices] = useState<RecentPrice[]>([])
  const [loadedPrices, setLoadedPrices] = useState(false)

  useEffect(() => {
    fetch('/api/recent-local-prices')
      .then((r) => r.json())
      .then((d) => {
        setRecentPrices(d.posts || [])
        setLoadedPrices(true)
      })
      .catch(() => setLoadedPrices(true))
  }, [])

  const formatPrice = (v: number, c: string) =>
    v >= 1000 ? `${c} ${v.toLocaleString()}` : `${c} ${v}`

  return (
    <div className="min-h-screen bg-background">
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-emerald-50">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-emerald-200/30 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              {/* Brand */}
              <div className="flex items-center gap-2">
                <img
                  src="/logo.svg"
                  alt="circub"
                  className="w-28 h-10"
                />
              </div>

              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 gap-1.5">
                <Sparkles className="w-3 h-3" />
                Local price intelligence for travelers
              </Badge>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-[1.1]">
                Know what things <span className="text-primary">actually cost</span> · before you travel.
              </h1>

              <p className="text-lg text-muted-foreground leading-relaxed">
                Locals post real prices for products, services, restaurants, transport and more in their cities.
                Travelers get verified, up-to-date local knowledge · and can ask a local directly when they can\'t find what they need.
              </p>

              <div className="flex items-center gap-3 flex-wrap pt-2">
                <Button
                  onClick={onSignUp}
                  size="lg"
                  className="bg-primary hover:bg-primary/90 gap-2 h-12 px-6"
                >
                  Get started · it&apos;s free
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button
                  onClick={onLogin}
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 gap-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  Sign in
                </Button>
              </div>

              <div className="flex items-center gap-6 pt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Verified local contributors</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-primary" />
                  <span>Available worldwide</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ThumbsUp className="w-4 h-4 text-primary" />
                  <span>Community-voted trust</span>
                </div>
              </div>
            </div>

            {/* Right: Sample price cards */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 to-emerald-200/30 rounded-3xl blur-2xl" />
              <Card className="relative p-5 shadow-2xl border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">What locals are saying</h3>
                  </div>
                  <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">Live</Badge>
                </div>
                <div className="space-y-3">
                  {!loadedPrices ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Loading recent prices...
                    </p>
                  ) : recentPrices.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent mb-2">
                        <PackageOpen className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Be the first local to post a price.
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">
                        Join circub and share what things really cost in your city.
                      </p>
                    </div>
                  ) : (
                    recentPrices.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-accent/40 hover:bg-accent transition-colors cursor-default"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                          {p.productName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{p.productName}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {[p.city, p.country].filter(Boolean).join(', ')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-primary text-sm">
                            {formatPrice(p.priceMin, p.currency)} · {formatPrice(p.priceMax, p.currency)}
                          </p>
                          {p.author.verifiedLocal && (
                            <p className="text-[10px] text-emerald-700 flex items-center justify-end gap-0.5">
                              <BadgeCheck className="w-3 h-3" />
                              Verified
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Button
                  onClick={onSignUp}
                  className="w-full mt-4 bg-primary hover:bg-primary/90 gap-1.5"
                  size="sm"
                >
                  Browse more local prices
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Features ===== */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="secondary" className="bg-primary/10 text-primary mb-3">
              <Sparkles className="w-3 h-3 mr-1" />
              Why circub
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              The local price layer for travelers
            </h2>
            <p className="mt-3 text-muted-foreground">
              No more getting ripped off. No more outdated guidebooks. Just real prices from real locals, in real time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, idx) => {
              const Icon = f.icon
              return (
                <Card key={idx} className="p-5 hover:shadow-md transition-shadow border-border">
                  <div className={cn(
                    'w-11 h-11 rounded-lg flex items-center justify-center mb-3',
                    'bg-primary/10'
                  )}>
                    <Icon className={cn('w-5 h-5', f.color)} />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-primary/5 via-background to-emerald-50">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="secondary" className="bg-primary/10 text-primary mb-3">
              <Plane className="w-3 h-3 mr-1" />
              How it works
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              From traveler to informed in 5 steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              Whether you\'re planning your next trip or already at the market, here\'s how to use circub.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {STEPS.map((s, idx) => {
              const Icon = s.icon
              return (
                <Card
                  key={idx}
                  className="p-5 hover:shadow-md transition-shadow border-border relative overflow-hidden"
                >
                  <span className="absolute top-3 right-3 text-3xl font-bold text-primary/10">
                    {s.number}
                  </span>
                  <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-foreground text-sm mb-1.5">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                </Card>
              )
            })}
          </div>

          <div className="mt-12 text-center">
            <Button
              onClick={onSignUp}
              size="lg"
              className="bg-primary hover:bg-primary/90 gap-2 h-12 px-6"
            >
              Start exploring prices
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ===== For travelers / For locals / For businesses ===== */}
      <section className="py-16 sm:py-20 bg-background">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="secondary" className="bg-primary/10 text-primary mb-3">
              <Users className="w-3 h-3 mr-1" />
              Who is it for
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Three ways to use circub
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* For travelers */}
            <Card className="p-6 hover:shadow-lg transition-shadow border-primary/20">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Plane className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">For travelers</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Browse real prices before your trip · no more tourist traps.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Read local tips on bargaining and quality.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Send a message to a local when you need help.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Vote on posts you found helpful · give back to the community.</span>
                </li>
              </ul>
            </Card>

            {/* For locals */}
            <Card className="p-6 hover:shadow-lg transition-shadow border-emerald-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">For locals</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Share what things really cost in your city · don\'t wait for travelers to ask.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Build a reputation as a verified local with helpful votes.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Get a public profile showing your expertise and contributions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Connect with travelers and other locals worldwide.</span>
                </li>
              </ul>
            </Card>

            {/* For businesses */}
            <Card className="p-6 hover:shadow-lg transition-shadow border-rose-200">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">For businesses</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>Create a company page for your shop, hotel, co-op, or export business.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>Publish your own product prices and let travelers find you directly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>Show your industry, company size, and website on your profile.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>Build trust by connecting with verified locals and customers.</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* ===== Sample post detail (showing consensus + history) ===== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-primary/5 via-background to-emerald-50">
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6">
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <Badge variant="secondary" className="bg-primary/10 text-primary mb-3">
              <TrendingUp className="w-3 h-3 mr-1" />
              Community consensus
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Multiple locals. One fair price.
            </h2>
            <p className="mt-3 text-muted-foreground">
              When several locals post about the same product, we aggregate their reports into a single trusted price range · and show how it changes over time.
            </p>
          </div>

          <Card className="p-6 shadow-xl border-primary/20 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-bold text-foreground">Example product</h3>
                  <Badge variant="secondary" className="bg-accent text-muted-foreground text-[10px]">Illustrative</Badge>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  Any city, any country
                </p>
              </div>
              <Badge className="bg-orange-500 text-white">Tourists pay more</Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-lg bg-accent/40 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Typical</p>
                <p className="text-sm font-bold text-foreground mt-0.5">Range low · high</p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-emerald-700">Fair price</p>
                <p className="text-sm font-bold text-emerald-700 mt-0.5">Recommended</p>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-orange-700">Tourists pay</p>
                <p className="text-sm font-bold text-orange-700 mt-0.5">Often much more</p>
              </div>
            </div>

            <div className="rounded-lg bg-emerald-50/50 border border-emerald-200 p-4 mb-3">
              <p className="text-sm font-semibold text-foreground mb-1">Local consensus: aggregated range</p>
              <p className="text-xs text-muted-foreground italic">Based on multiple community-reported prices.</p>
            </div>

            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold text-foreground mb-2">Price history</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-medium text-foreground">Latest range</span>
                  <span className="text-emerald-600">live data</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">3 months ago</span>
                  <span className="font-medium text-foreground">Previous range</span>
                  <span className="text-orange-600">↑ or ↓ shift</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">6 months ago</span>
                  <span className="font-medium text-foreground">Older range</span>
                  <span className="text-orange-600">trend visible</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/80 italic mt-3">
              Based on community-reported prices. Not guaranteed truth · consensus reflects what multiple locals have shared.
            </p>
          </Card>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="py-16 sm:py-20 bg-gradient-to-br from-primary to-emerald-600 text-white">
        <div className="mx-auto max-w-[1000px] px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Join the local price revolution.
          </h2>
          <p className="text-lg text-primary-foreground/90 mb-8 max-w-xl mx-auto">
            Whether you\'re a traveler looking for honest prices, a local sharing your knowledge, or a business reaching customers worldwide · there\'s a place for you on circub.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={onSignUp}
              size="lg"
              className="bg-white text-primary hover:bg-white/90 gap-2 h-12 px-6"
            >
              Create your account
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              onClick={onLogin}
              size="lg"
              variant="outline"
              className="bg-transparent border-white text-white hover:bg-white/10 hover:text-white gap-2 h-12 px-6"
            >
              I already have an account
            </Button>
          </div>
          <p className="text-xs text-primary-foreground/70 mt-6">
            Free forever. No credit card. Personal or Company account · your choice.
          </p>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="bg-foreground text-background py-10">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="circub" className="w-24 h-9" />
            </div>
            <div className="sm:ml-6">
              <p className="text-xs text-background/60">Local price intelligence for travelers</p>
            </div>
            <div className="flex items-center gap-6 text-sm text-background/80">
              <a href="#" className="hover:text-primary">Privacy</a>
              <a href="#" className="hover:text-primary">Terms</a>
              <a href="#" className="hover:text-primary">Help</a>
              <a href="#" className="hover:text-primary">About</a>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-background/10 text-xs text-background/60 text-center">
            © {new Date().getFullYear()} circub · Connecting travelers with verified local knowledge, one price at a time.
          </div>
        </div>
      </footer>
    </div>
  )
}
