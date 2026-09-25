// ============================================================================
// /g/[username] - THE GUIDE LINK.
// A shareable, works-logged-out page per registered tour guide that travelers
// can paste anywhere (WhatsApp, Instagram bio, flyers). Shows the guide's
// profile, star rating, languages/specialties, hourly rate, their tour
// videos (YouTube / Instagram embeds) and a clear "book on circub" CTA.
// Queries the DB directly server-side and exposes ONLY public fields -
// never email, never the verification document.
// ============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { normalizeUsername } from '@/lib/username'
import { splitVideoUrls } from '@/lib/video'
import { guideRolesOrLegacy, roleListLabel, roleNoun, ROLE_META } from '@/lib/roles'
import {
  BadgeCheck as VerifiedIcon, Award, CalendarCheck, Compass, Languages,
  Link2, MapPin, ShieldCheck, Star,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { VideoEmbed } from '@/components/social/video-embed'
import { CopyLinkButton } from '@/components/social/copy-link-button'

export const dynamic = 'force-dynamic'

const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-green-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

async function getGuide(usernameRaw: string) {
  const username = normalizeUsername(usernameRaw)
  if (!username) return null
  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true, name: true, username: true, avatarColor: true, profilePicture: true,
      bio: true, headline: true, location: true, isGuide: true, verifiedLocal: true,
      idVerified: true, guideLicense: true, guideLanguages: true,
      guideSpecialties: true, guideHourlyRate: true, guideCurrency: true,
      guideBio: true, guideAvailable: true, guideVideoUrls: true,
      guideRoles: true,
      rating: true, localPostCount: true, postsCount: true,
    },
  })
  // Only registered guides get a guide link page.
  if (!user || !user.isGuide) return null
  const ratingCount = await db.guideRating.count({ where: { guideId: user.id } })
  return { user, ratingCount }
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  try {
    const data = await getGuide(username)
    if (!data) return { title: 'Not found · circub' }
    const { user, ratingCount } = data
    const roles = guideRolesOrLegacy(user.guideRoles)
    const title = `${user.name} · ${roleListLabel(roles)}${user.location ? ` in ${user.location}` : ''} · circub`
    const description = user.guideBio || user.headline || user.bio ||
      `Meet ${user.name}, a ${roleNoun(roles[0])} on circub.${ratingCount > 0 ? ` Rated ${user.rating?.toFixed(1)} by ${ratingCount} traveler${ratingCount !== 1 ? 's' : ''}.` : ''}`
    return { title, description }
  } catch {
    return { title: 'Local on circub' }
  }
}

export default async function GuideLinkPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let data: Awaited<ReturnType<typeof getGuide>> = null
  try {
    data = await getGuide(username)
  } catch {
    data = null
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Compass className="w-6 h-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No registered local uses <span className="font-semibold">@{normalizeUsername(username)}</span> - the link may be mistyped or they stepped away from the program.
          </p>
          <Button asChild className="mt-5 rounded-full"><Link href="/">Open circub</Link></Button>
        </div>
      </main>
    )
  }

  const { user, ratingCount } = data
  const colorCls = AVATAR_COLORS[user.avatarColor] || AVATAR_COLORS.teal
  const idVerified = Boolean(user.idVerified) || Boolean(user.verifiedLocal)
  // Roles drive the badges, eyebrow and CTA. Legacy members (no stored
  // roles) read as ['guide'] so existing links never change.
  const roles = guideRolesOrLegacy(user.guideRoles)
  const languages = user.guideLanguages ? user.guideLanguages.split(',').filter(Boolean) : []
  const specialties = user.guideSpecialties ? user.guideSpecialties.split(',').filter(Boolean) : []
  const videos = splitVideoUrls(user.guideVideoUrls)
  const shareUrl = `/g/${user.username}`

  return (
    <main className="min-h-screen bg-background pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* header */}
        <div className="pt-8 flex items-start gap-5">
          {user.profilePicture ? (
            <img src={user.profilePicture} alt={user.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-accent shrink-0" />
          ) : (
            <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-accent shrink-0">
              <AvatarFallback className={`${colorCls} text-white font-bold text-2xl`}>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Compass className="w-4 h-4 text-primary shrink-0" />
              <span data-testid="guide-page-eyebrow" className="text-[11px] font-semibold uppercase tracking-wider text-primary">{roleListLabel(roles)} on circub</span>
              {user.guideAvailable && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px]">Available now</Badge>
              )}
            </div>
            <h1 data-testid="guide-page-name" className="mt-1 text-xl font-bold text-foreground flex items-center gap-1.5 flex-wrap">
              {user.name}
              {idVerified && <VerifiedIcon className="w-4 h-4 text-blue-500" aria-label="Verified with ID or passport" />}
              {user.guideLicense && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px]">
                  <Award className="w-2.5 h-2.5 mr-0.5" />Licensed
                </Badge>
              )}
              {roles.map((r) => (
                <Badge key={r} variant="secondary" data-testid={`guide-page-role-${r}`} className="bg-primary/10 text-primary text-[10px]">{ROLE_META[r].label}</Badge>
              ))}
            </h1>
            {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
            {user.location && (
              <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-primary" />{user.location}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2" data-testid="guide-page-rating">
              <span className="flex items-center gap-1 text-sm font-semibold text-amber-600">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                {user.rating && user.rating > 0 ? user.rating.toFixed(1) : 'New'}
              </span>
              <span className="text-xs text-muted-foreground">
                {ratingCount > 0 ? `${ratingCount} traveler review${ratingCount !== 1 ? 's' : ''}` : 'No reviews yet'}
              </span>
              {idVerified && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  ID verified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* intro */}
        {(user.guideBio || user.headline || user.bio) && (
          <p className="mt-4 text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
            {user.guideBio || user.headline || user.bio}
          </p>
        )}

        {/* languages + specialties */}
        {(languages.length > 0 || specialties.length > 0) && (
          <div className="mt-4 space-y-2">
            {languages.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Languages className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {languages.map((l) => (
                  <Badge key={l} variant="secondary" className="bg-accent text-foreground text-[10px]">{l}</Badge>
                ))}
              </div>
            )}
            {specialties.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {specialties.map((s) => (
                  <Badge key={s} variant="secondary" className="bg-primary/10 text-primary text-[10px]">{s}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* rate */}
        {user.guideHourlyRate != null && user.guideCurrency && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-lg font-bold text-primary">{user.guideCurrency} {user.guideHourlyRate}</span>
            <span className="text-xs text-muted-foreground">/ hour</span>
          </div>
        )}

        {/* CTA row: book + share the guide link itself */}
        <div className="mt-5 flex items-center gap-2.5 flex-wrap">
          <Button asChild className="rounded-full gap-2" data-testid="guide-page-book">
            <Link href="/">
              {roles.includes('guide')
                ? <><CalendarCheck className="w-4 h-4" />Book this guide on circub</>
                : <><CalendarCheck className="w-4 h-4" />Meet {user.name.split(' ')[0]} on circub</>
              }
            </Link>
          </Button>
          <CopyLinkButton
            url={shareUrl}
            title={`${user.name} · ${roleListLabel(roles)} on circub`}
            text={`Check out ${user.name}, a ${roleNoun(roles[0])} on circub`}
          />
        </div>

        {/* tour videos (YouTube / Instagram embeds) */}
        <section className="mt-8">
          <h2 data-testid="guide-page-videos" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
            {roles.length === 1 && roles[0] === 'vlogger' ? 'Videos' : 'Tour videos'} ({videos.length})
          </h2>
          {videos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
              <div className="flex justify-center mb-1.5 opacity-60"><Link2 className="w-5 h-5" /></div>
              <p className="text-xs">No videos added yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {videos.map((v, i) => (
                <VideoEmbed key={i} url={v} title={`${user.name} tour video ${i + 1}`} />
              ))}
            </div>
          )}
        </section>

        {/* footer CTA */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground mb-3">Real prices, real locals, real guides - all on circub.</p>
          <Button asChild variant="outline" className="rounded-full"><Link href="/">Open circub</Link></Button>
        </div>
      </div>
    </main>
  )
}
