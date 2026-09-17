// ============================================================================
// /u/[username] — the shareable public profile.
// This is where a profile's unique ID lands: circub.app/u/<username>.
// Works logged-out (that is the point of sharing), queries the DB directly
// server-side and exposes ONLY public fields — never email, never the
// verification document (that lives exclusively behind GET /api/verification
// for its owner).
// ============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { normalizeUsername } from '@/lib/username'
import { BadgeCheck as VerifiedIcon, Building2, Camera, Grid3X3, Link2, MapPin, Package, Star } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-green-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

function priceLabel(cur: string, min?: number | null, max?: number | null) {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
  if (min != null && max != null && min !== max) return `${cur} ${fmt(min)} – ${fmt(max)}`
  if (min != null) return `${cur} ${fmt(min)}`
  if (max != null) return `${cur} ${fmt(max)}`
  return cur
}

async function getProfile(usernameRaw: string) {
  const username = normalizeUsername(usernameRaw)
  if (!username) return null
  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true, name: true, username: true, avatarColor: true, profilePicture: true,
      bio: true, headline: true, location: true, accountType: true, companyName: true,
      companyIndustry: true, isLocal: true, verifiedLocal: true, idVerified: true,
      isGuide: true,
      expertiseTags: true, rating: true, createdAt: true,
      followersCount: true, likesCount: true, connectionsCount: true,
    },
  })
  if (!user) return null
  const [posts, listings, products] = await Promise.all([
    db.post.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, content: true, imageUrl: true, createdAt: true },
    }),
    db.localPricePost.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, productName: true, currency: true, priceMin: true, priceMax: true, imageUrl: true, country: true, city: true, postType: true, createdAt: true },
    }),
    db.product.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, name: true, price: true, currency: true, imageUrl: true, category: true, createdAt: true },
    }),
  ])
  return { user, posts, listings, products }
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  try {
    const data = await getProfile(username)
    if (!data) return { title: 'Profile not found · circub' }
    const { user } = data
    const title = `${user.name} (@${user.username}) · circub`
    const description = user.headline || user.bio || `See ${user.name}'s profile, posts and local price knowledge on circub.`
    return { title, description }
  } catch {
    return { title: 'Profile · circub' }
  }
}

export default async function SharedProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let data: Awaited<ReturnType<typeof getProfile>> = null
  try {
    data = await getProfile(username)
  } catch {
    data = null
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Link2 className="w-6 h-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Profile not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No one uses <span className="font-semibold">@{normalizeUsername(username)}</span> here yet — the link may be mistyped or the profile was removed.
          </p>
          <Button asChild className="mt-5 rounded-full"><Link href="/">Open circub</Link></Button>
        </div>
      </main>
    )
  }

  const { user, posts, listings, products } = data
  const colorCls = AVATAR_COLORS[user.avatarColor] || AVATAR_COLORS.teal
  const verified = Boolean(user.idVerified) || Boolean(user.verifiedLocal)
  const stats = [
    { label: 'Posts', value: posts.length },
    { label: 'Listings', value: listings.length },
    { label: 'Products', value: products.length },
    { label: 'Followers', value: user.followersCount },
  ]

  return (
    <main className="min-h-screen bg-background pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* header */}
        <div className="pt-8 flex items-center gap-6 sm:gap-10">
          <div className="shrink-0">
            {user.profilePicture ? (
              <img src={user.profilePicture} alt={user.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-accent" />
            ) : (
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-accent">
                <AvatarFallback className={`${colorCls} text-white font-bold text-2xl`}>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
          </div>
          <div className="flex-1 grid grid-cols-4 gap-1 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{s.value}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-1.5 flex-wrap">
            {user.name}
            {verified && <VerifiedIcon className="w-4 h-4 text-blue-500" aria-label="Verified with ID or passport" />}
            {user.isGuide && <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">Guide</Badge>}
          </h1>
          {user.username && (
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          )}
          {user.accountType === 'COMPANY' && user.companyName && (
            <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{user.companyName}{user.companyIndustry ? ` · ${user.companyIndustry}` : ''}</p>
          )}
          {user.headline && <p className="mt-1 text-sm text-foreground/90">{user.headline}</p>}
          {user.bio && <p className="mt-1 text-sm text-foreground/90 whitespace-pre-line">{user.bio}</p>}
          {user.location && (
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary" />{user.location}</p>
          )}
        </div>

        {/* posts grid */}
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3"><Grid3X3 className="w-3.5 h-3.5" />Posts</h2>
          {posts.length === 0 ? (
            <EmptyRow icon={<Camera className="w-5 h-5" />} text="No posts yet" />
          ) : (
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {posts.map((p) => (
                <div key={p.id} className="aspect-square rounded-md overflow-hidden bg-muted">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.content.slice(0, 80) || 'Post'} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2"><span className="text-[10px] leading-snug text-muted-foreground line-clamp-4">{p.content.slice(0, 90)}</span></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* listings */}
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3"><Star className="w-3.5 h-3.5" />Local price listings</h2>
          {listings.length === 0 ? (
            <EmptyRow icon={<Star className="w-5 h-5" />} text="No listings yet" />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {listings.map((l) => (
                <li key={l.id} className="flex items-center gap-3 p-3 bg-card">
                  {l.imageUrl ? (
                    <img src={l.imageUrl} alt={l.productName} className="w-11 h-11 rounded-lg object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Star className="w-4 h-4" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{l.productName}</p>
                    <p className="text-xs text-muted-foreground truncate">{[l.city, l.country].filter(Boolean).join(', ') || '—'} · {l.postType === 'SERVICE' ? 'Service' : 'Product'}</p>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">{priceLabel(l.currency, l.priceMin, l.priceMax)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* products */}
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3"><Package className="w-3.5 h-3.5" />Marketplace</h2>
          {products.length === 0 ? (
            <EmptyRow icon={<Package className="w-5 h-5" />} text="No products yet" />
          ) : (
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {products.map((pr) => (
                <div key={pr.id} className="aspect-square rounded-md overflow-hidden bg-muted relative">
                  {pr.imageUrl ? (
                    <img src={pr.imageUrl} alt={pr.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
                  )}
                  <span className="absolute bottom-1 left-1 right-1 text-[10px] font-bold text-white bg-black/55 rounded px-1 py-0.5 truncate">{priceLabel(pr.currency, pr.price)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* footer CTA */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground mb-3">Know what things actually cost — from the locals.</p>
          <Button asChild className="rounded-full"><Link href="/">Open circub</Link></Button>
        </div>
      </div>
    </main>
  )
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
      <div className="flex justify-center mb-1.5 opacity-60">{icon}</div>
      <p className="text-xs">{text}</p>
    </div>
  )
}
