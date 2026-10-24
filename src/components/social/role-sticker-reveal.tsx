'use client'

// ============================================================================
// v209: THE STICKER VAULT - the fullscreen reveal becomes the full binder.
// Touching the mystery tile still leaks NOTHING (neutral glyph, muted
// border), but the takeover now reads like the reference screen, top to
// bottom: the LV/XP header, the Sticker Vault panel (mastery + unlocked
// count), the three honest stat tiles (posts / votes / rating), the
// Algorithmic Deal Booster (ACTIVE with the equipped DMM buff, or Standby),
// the v208 role reveal (category + evidence + one row per hidden role),
// working filter chips, the 2-column badge grid for all six catalog
// stickers (tier chips, Equipped / Earned / Locked, locked cards grayscale
// with progress bars), the Live Seller Card Showcase and the Computational
// Deal Ranking explainer. Every number is REAL - posterXp over the same
// counters that drive the arena (votes x 100 + posts x 50).
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  X, Sparkles, Compass, Video, MapPin, HeartHandshake, Tag, Star, FileText,
  Zap, Flame, Heart, Award, Medal, Gem, TrendingUp, Rocket,
} from 'lucide-react'
import { circubawdRole, guideRolesOrLegacy, ROLE_META } from '@/lib/roles'
import { avatarSrc } from '@/lib/fighters'
import {
  STICKERS, StickerState, posterXp, xpProgress, levelOf, levelTitle,
  stickerStates, readEquippedIds, equippedStickerDefs,
  stickerTierLabel, stickerTierChipClass, formatCompact,
  priceRatingOf,
} from '@/lib/arena'

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
    ring: 'ring-teal-300/40',
    chip: 'bg-teal-500/15 text-teal-600 border border-teal-400/30',
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

// Per-sticker glyph in the badge grid (matches each def's identity).
const STICKER_ICON: Record<string, typeof Zap> = {
  'deal-spark': Zap,
  'hustle-flame': Flame,
  'hype-magnet': Heart,
  'conversion-king': Award,
  'century-lister': Medal,
  'viral-overlord': Gem,
}

// Short names for the showcase's equipped chips.
const STICKER_SHORT: Record<string, string> = {
  'deal-spark': 'Deal',
  'hustle-flame': 'Flame',
  'hype-magnet': 'Hype',
  'conversion-king': 'King',
  'century-lister': 'Century',
  'viral-overlord': 'Overlord',
}

function buffLabel(type: string): string {
  if (type === 'GLOBAL_XP') return 'XP Boost'
  if (type === 'VOTE_WEIGHT') return 'Vote Influence'
  return 'Roadmap Velocity'
}

type VaultChip = 'all' | 'post' | 'engagement'

export interface RoleStickerTileProps {
  name: string
  roles?: string | string[] | null
  posts?: number | null
  rating?: number | null
  ratingCount?: number | null
  votes?: number | null
  profilePicture?: string | null
  location?: string | null
}

export function RoleStickerTile({ name, roles, posts, rating, ratingCount, votes, profilePicture, location }: RoleStickerTileProps) {
  const [open, setOpen] = useState(false)
  const [equipTick, setEquipTick] = useState(0)
  const resolved = guideRolesOrLegacy(roles)
  const p = Math.max(0, Number(posts) || 0)
  const r = Math.max(0, Number(rating) || 0)
  const c = Math.max(0, Number(ratingCount) || 0)
  const v = Math.max(0, Number(votes) || 0)
  const cat = roleCategoryOf(p, r, c)
  const meta = CATEGORY_META[cat]

  // The vault's numbers: real XP math over the counters in hand, the six
  // catalog sticker states, and the DMM equip rule (first two earned).
  const vault = useMemo(() => {
    const xp = posterXp({ helpfulVotes: v, localPostCount: p })
    const prog = xpProgress(xp)
    const states: StickerState[] = stickerStates(p, v)
    const earned = states.filter((s) => s.unlocked)
    const equippedIds = readEquippedIds(earned.map((s) => s.def.id))
    void equipTick // re-read localStorage when the quest hub equips
    const equippedDefs = equippedStickerDefs(equippedIds)
    const top = equippedDefs[0] || null
    // v211: the Price Rating - posting the price + engaging on the voting,
    // divided by the person's top earned sticker tier.
    const price = priceRatingOf(p, v)
    return { xp, prog, states, earnedCount: earned.length, equippedIds, equippedDefs, top, price }
  }, [p, v, equipTick])

  // Fullscreen takeover hygiene: lock the body scroll while open, Escape
  // closes. Listen for equip changes made in the quest hub vault so the
  // booster + showcase stay honest.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onStorage = () => setEquipTick((t) => t + 1)
    window.addEventListener('keydown', onKey)
    window.addEventListener('storage', onStorage)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('storage', onStorage)
    }
  }, [open])

  const [chip, setChip] = useState<VaultChip>('all')
  const visible = vault.states.filter((s) => chip === 'all' || s.def.kind === chip)

  return (
    <>
      {/* The MYSTERY TILE - neutral glyph, muted border. No role, no category,
          no star leaks until tapped. */}
      <button
        type="button"
        data-testid="guide-sticker-tile"
        aria-label={`${name}'s sticker - touch to open the vault`}
        title="Touch to open the Sticker Vault"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="shrink-0 w-6 h-6 rounded-md border border-muted-foreground/25 bg-muted/40 flex items-center justify-center text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          data-testid="guide-sticker-overlay"
          className="fixed inset-0 z-[80] bg-background overflow-y-auto"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} - Sticker Vault`}
        >
          {/* faint stage glow behind the card */}
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]" />

          <div
            className="relative w-full max-w-lg mx-auto min-h-full bg-card border-x border-border shadow-2xl px-4 pt-4 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* close + header */}
            <button
              type="button"
              data-testid="guide-sticker-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="sticky top-3 float-right w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* LV / XP header - the same math as the arena */}
            <div data-testid="vault-header-level" className="pt-2">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">{name}</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-foreground">LV.{vault.prog.level}</span>
                <span className="text-sm font-semibold text-primary">{formatCompact(vault.xp)} XP</span>
                <span className="text-[11px] text-muted-foreground">{levelTitle(vault.prog.level)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${vault.prog.pct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{vault.prog.into} / {vault.prog.need} XP into LV.{vault.prog.level + 1}</p>
            </div>

            {/* Sticker Vault panel */}
            <div data-testid="vault-panel" className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-600/25 via-emerald-800/15 to-teal-700/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-foreground leading-tight">Sticker Vault</h2>
                  <p className="text-[11px] text-muted-foreground">Earn stickers by posting deals and collecting Helpful votes.</p>
                </div>
                <Sparkles className="w-6 h-6 text-emerald-400 shrink-0" />
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span data-testid="vault-mastery" className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Mastery LV.{vault.earnedCount}
                </span>
                <span data-testid="vault-unlocked" className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-muted/50 text-muted-foreground border border-border">
                  {vault.earnedCount}/6 Unlocked
                </span>
              </div>
            </div>

            {/* Three honest stat tiles */}
            <div className="grid grid-cols-3 gap-2">
              <div data-testid="vault-stat-posts" className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                <FileText className="w-4 h-4 mx-auto text-primary" />
                <p className="text-lg font-bold text-foreground mt-1">{p}</p>
                <p className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">Post Titan</p>
              </div>
              <div data-testid="vault-stat-votes" className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                <Heart className="w-4 h-4 mx-auto text-pink-500" />
                <p className="text-lg font-bold text-foreground mt-1">{formatCompact(v)}</p>
                <p className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">Viral Beacon</p>
              </div>
              <div data-testid="vault-stat-rating" className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-primary" />
                <p className="text-lg font-bold text-foreground mt-1">{formatCompact(vault.price.rating)}</p>
                <p className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">Price Rating</p>
                <p data-testid="vault-rating-divisor" className="text-[8px] font-bold tracking-wider text-muted-foreground/80 uppercase mt-0.5">
                  &divide;{vault.price.divisor} {vault.price.tierLabel || 'No Sticker'}
                </p>
              </div>
            </div>

            {/* Algorithmic Deal Booster - ACTIVE with the equipped DMM buff */}
            <div
              data-testid="vault-booster"
              data-active={vault.top ? 'true' : undefined}
              className="rounded-2xl border p-4"
              style={{ borderColor: vault.top ? 'rgba(34,197,94,0.35)' : 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Rocket className={`w-4 h-4 shrink-0 ${vault.top ? 'text-green-500' : 'text-muted-foreground'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground leading-tight">Algorithmic Deal Booster</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {vault.top
                        ? `${vault.top.name} is equipped - its buff is live on every vote and payout`
                        : 'Equip a sticker in the Quest Hub vault to boost the algorithm'}
                    </p>
                  </div>
                </div>
                {vault.top && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-green-500/15 text-green-500 border border-green-500/30 shrink-0">
                    Active
                  </span>
                )}
              </div>
              {vault.top && (
                <span className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                  <TrendingUp className="w-3 h-3" />
                  {vault.top.name} +{Math.round(vault.top.buffValue * 100)}% {buffLabel(vault.top.buffType)}
                </span>
              )}
            </div>

            {/* The v208 ROLE STICKER reveal - category, evidence, hidden roles */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${meta.gradient} ${meta.ring} ring-2 flex items-center justify-center text-white shadow shrink-0`}>
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Role Sticker</p>
                  <h3 className="text-base font-bold text-foreground leading-tight">{name}</h3>
                </div>
              </div>
              <span data-testid="guide-sticker-category" className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${meta.chip}`}>
                <Star className="w-3 h-3" />
                {meta.label}
              </span>
              <p className="text-sm text-muted-foreground">{meta.blurb}</p>
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

            {/* Filter chips - ALL STICKERS / POST MILESTONES / ENGAGEMENT */}
            <div className="flex items-center gap-2 flex-wrap">
              {([
                ['all', 'All Stickers', 'vault-chip-all'],
                ['post', 'Post Milestones', 'vault-chip-post'],
                ['engagement', 'Engagement', 'vault-chip-engagement'],
              ] as [VaultChip, string, string][]).map(([key, label, tid]) => (
                <button
                  key={key}
                  type="button"
                  data-testid={tid}
                  onClick={() => setChip(key)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase border transition-colors ${chip === key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* The 2-column badge grid - all six catalog stickers */}
            <div data-testid="vault-grid" className="grid grid-cols-2 gap-3">
              {visible.map((s) => {
                const Icon = STICKER_ICON[s.def.id] || Sparkles
                const equipped = vault.equippedIds.includes(s.def.id)
                return (
                  <div
                    key={s.def.id}
                    data-testid={`vault-sticker-${s.def.id}`}
                    data-state={s.unlocked ? 'earned' : 'locked'}
                    data-equipped={equipped ? 'true' : undefined}
                    className={`rounded-2xl border p-3 space-y-2 ${s.unlocked ? 'border-border bg-card' : 'border-border bg-muted/20'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.def.gradient} flex items-center justify-center text-white shadow ${s.unlocked ? '' : 'grayscale opacity-60'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase ${stickerTierChipClass(s.def.tier)}`}>
                        {stickerTierLabel(s.def.tier)}
                      </span>
                      {equipped && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase bg-primary/15 text-primary border border-primary/30">
                          Equipped
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-bold leading-tight ${s.unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{s.def.name}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{s.def.effect} &middot; {s.def.requirement}</p>
                    {s.unlocked ? (
                      <p className="text-[9px] font-black tracking-wider uppercase text-green-500">Earned</p>
                    ) : (
                      <div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden" data-testid="vault-sticker-progress">
                          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${s.pct}%` }} />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1">{s.value}/{s.def.target} &middot; {s.remaining} to go</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Live Seller Card Showcase */}
            <div data-testid="vault-showcase" className="rounded-2xl border border-border p-4">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Live Seller Card</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="w-11 h-11 rounded-full overflow-hidden border-2 border-accent shrink-0 bg-primary/15 text-primary font-bold flex items-center justify-center">
                  {profilePicture ? (
                    <img src={avatarSrc(profilePicture)} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    name.charAt(0).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{name}</p>
                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-primary/15 text-primary border border-primary/30 mt-0.5">
                    LV.{levelOf(vault.xp)}
                  </span>
                </div>
              </div>
              {vault.equippedDefs.length > 0 && (
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {vault.equippedDefs.map((d) => (
                    <span key={d.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r ${d.gradient} text-white shadow`}>
                      <Sparkles className="w-2.5 h-2.5" />
                      {STICKER_SHORT[d.id] || d.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Computational Deal Ranking explainer */}
            <div data-testid="vault-ranking" className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Computational Deal Ranking</p>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                XP = Helpful votes &times; 100 + posts &times; 50. Levels ride 50 &times; (LV&minus;1)&sup2;.
                Equipped stickers modify the math: Vote Influence widens each Helpful vote,
                Roadmap Velocity shrinks unlock targets, XP Boost fattens every payout.
                {STICKERS.length > 0 ? ' The catalog above is the full six-sticker ladder.' : ''}
              </p>
              <p data-testid="vault-rating-formula" className="text-xs text-muted-foreground mt-2 leading-relaxed">
                <span className="font-semibold text-foreground">Price Rating</span> = (posts &times; 45 + Helpful votes &times; 10)
                &divide; sticker divisor - your top earned sticker divides harder:
                Endgame &divide;1, Gold &divide;1.5, Cyan &divide;2, Silver &divide;2.5, Bronze &divide;3, none &divide;4.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
