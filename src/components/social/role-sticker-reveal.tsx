'use client'

// ============================================================================
// v208: LIVE ZONE ROLES HIDE UNDER THE STICKER - touch to take the screen.
// The open Guide / Vlogger / Local / Volunteer / Sales badges are gone from
// the directory card. Every card carries ONE mystery sticker tile instead:
// a neutral glyph on a muted border - nothing leaks. Touching it takes the
// WHOLE screen: a fullscreen role reveal that categorizes the person by
// their posts + stars and spells every hidden role out, one row at a time.
// The location search, Near me sort, Available toggle and role-filter chips
// all keep working above the list - nothing about discovery changed, only
// WHERE the roles live.
// ============================================================================

import { useEffect, useState } from 'react'
import {
  X, Sparkles, Compass, Video, MapPin, HeartHandshake, Tag, Star, FileText,
} from 'lucide-react'
import { circubawdRole, guideRolesOrLegacy, ROLE_META } from '@/lib/roles'

// ---------------------------------------------------------------------------
// Category from posts + stars (pure client math over the counters the guides
// API already ships - no new endpoints, no schema changes):
//   LEGEND - 4.7+ stars from 10+ reviews               (the proven elite)
//   STAR   - 4.5+ stars from 3+ reviews, or 20+ posts  (loved / prolific)
//   PROVEN - 5+ posts or 2+ reviews                    (showed up, delivered)
//   RISING - everyone else                             (new voices)
// ---------------------------------------------------------------------------
export type RoleCategory = 'LEGEND' | 'STAR' | 'PROVEN' | 'RISING'

export function roleCategoryOf(posts: number, rating: number, ratingCount: number): RoleCategory {
  if (rating >= 4.7 && ratingCount >= 10) return 'LEGEND'
  if ((rating >= 4.5 && ratingCount >= 3) || posts >= 20) return 'STAR'
  if (posts >= 5 || ratingCount >= 2) return 'PROVEN'
  return 'RISING'
}

const CATEGORY_META: Record<RoleCategory, {
  label: string
  blurb: string
  gradient: string
  ring: string
  chip: string
}> = {
  LEGEND: {
    label: 'Legend',
    blurb: 'A top-rated name on circubAwd - travelers keep vouching.',
    gradient: 'from-amber-400 via-yellow-300 to-amber-500',
    ring: 'ring-amber-300/40',
    chip: 'bg-amber-500/15 text-amber-600 border border-amber-400/30',
  },
  STAR: {
    label: 'Star',
    blurb: 'Loved by travelers or everywhere in the feed - often both.',
    gradient: 'from-violet-500 via-fuchsia-400 to-pink-500',
    ring: 'ring-fuchsia-300/40',
    chip: 'bg-fuchsia-500/15 text-fuchsia-600 border border-fuchsia-400/30',
  },
  PROVEN: {
    label: 'Proven',
    blurb: 'A real track record - posts and reviews back them up.',
    gradient: 'from-cyan-400 via-sky-400 to-blue-500',
    ring: 'ring-cyan-300/40',
    chip: 'bg-cyan-500/15 text-cyan-600 border border-cyan-400/30',
  },
  RISING: {
    label: 'Rising',
    blurb: 'A new voice - watch the category climb as they post.',
    gradient: 'from-emerald-400 via-green-400 to-teal-500',
    ring: 'ring-emerald-300/40',
    chip: 'bg-emerald-500/15 text-emerald-600 border border-emerald-400/30',
  },
}

// Icon per hidden role (the same five roles the register question offers).
const ROLE_ICON: Record<circubawdRole, typeof Compass> = {
  guide: Compass,
  vlogger: Video,
  local: MapPin,
  volunteer: HeartHandshake,
  sales: Tag,
}

export interface RoleStickerTileProps {
  name: string
  roles?: string | string[] | null
  posts?: number | null
  rating?: number | null
  ratingCount?: number | null
  location?: string | null
}

export function RoleStickerTile({ name, roles, posts, rating, ratingCount, location }: RoleStickerTileProps) {
  const [open, setOpen] = useState(false)
  const resolved = guideRolesOrLegacy(roles)
  const p = Math.max(0, Number(posts) || 0)
  const r = Math.max(0, Number(rating) || 0)
  const c = Math.max(0, Number(ratingCount) || 0)
  const cat = roleCategoryOf(p, r, c)
  const meta = CATEGORY_META[cat]

  // Fullscreen takeover hygiene: lock the body scroll while open, Escape
  // closes (same contract as the vault overlays).
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      {/* The MYSTERY TILE - neutral glyph, muted border. No role, no category,
          no star leaks until tapped. */}
      <button
        type="button"
        data-testid="guide-sticker-tile"
        aria-label={`${name}'s sticker - touch to reveal`}
        title="Touch to reveal"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="shrink-0 w-6 h-6 rounded-md border border-muted-foreground/25 bg-muted/40 flex items-center justify-center text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          data-testid="guide-sticker-overlay"
          className="fixed inset-0 z-[80] bg-background flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} - role sticker`}
        >
          {/* faint stage glow behind the card */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(139,92,246,0.12),transparent_70%)]" />
          <div
            className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              data-testid="guide-sticker-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Big gradient tile - the sticker itself, colored by category */}
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta.gradient} ${meta.ring} ring-4 flex items-center justify-center text-white shadow-lg`}>
              <Sparkles className="w-8 h-8" />
            </div>

            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Role Sticker</p>
              <h2 className="text-xl font-bold text-foreground leading-tight mt-0.5">{name}</h2>
            </div>

            <span data-testid="guide-sticker-category" className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${meta.chip}`}>
              <Star className="w-3 h-3" />
              {meta.label}
            </span>
            <p className="text-sm text-muted-foreground">{meta.blurb}</p>

            {/* Evidence - the honest counters behind the category */}
            <div data-testid="guide-sticker-evidence" className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" />{p} {p === 1 ? 'post' : 'posts'}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />avg {r > 0 ? r.toFixed(1) : '-'} stars ({c})</span>
              {location ? (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{location}</span>
                </>
              ) : null}
            </div>

            {/* One row per hidden role */}
            <div data-testid="guide-sticker-roles" className="space-y-2">
              {resolved.map((role) => {
                const Icon = ROLE_ICON[role]
                return (
                  <div key={role} data-testid={`guide-sticker-role-${role}`} className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{ROLE_META[role].label}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_META[role].blurb}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-[11px] text-muted-foreground/80 text-center">
              category = posts + stars &middot; keep posting and collecting stars to climb
            </p>
          </div>
        </div>
      )}
    </>
  )
}
