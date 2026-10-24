// v200: PRICE ARENA - the feed is a game between price posters and the
// best-voted item wins. This module is the single source of the game math
// so the API (/api/arena), the feed cards (poster LVL chips) and the arena
// section can never disagree about what a poster's level or XP is.
//
// The formulas, deliberately simple and public:
//   poster XP   = helpfulVotes * 100 + localPostCount * 50
//                 (every helpful vote a poster ever received is worth 100
//                 XP - votes ARE the game currency; posting a price is
//                 worth 50 XP - showing up matters too)
//   level(xp)   = floor(sqrt(xp / 50)) + 1
//                 chosen so the milestone numbers feel like a real ladder:
//                 LVL 2 at 50 XP, LVL 3 at 200, ... LVL 8 begins at 2,450
//                 XP, LVL 10 at 4,050. xpForLevel(l) = 50 * (l-1)^2.
//
// The arena window is ONE WEEK: every Monday 00:00 UTC the weekly battle
// resets, so the leaderboard and the duel always read "this week".

export interface ArenaAuthorLike {
  helpfulVotes?: number | null
  localPostCount?: number | null
}

/** Lifetime XP of a poster from the two counters the feed already loads. */
export function posterXp(author: ArenaAuthorLike | null | undefined): number {
  if (!author) return 0
  const votes = Math.max(0, Number(author.helpfulVotes ?? 0) || 0)
  const posts = Math.max(0, Number(author.localPostCount ?? 0) || 0)
  return votes * 100 + posts * 50
}

/** The level a given amount of XP puts you on. LVL 1 = brand new. */
export function levelOf(xp: number): number {
  const safe = Math.max(0, Number(xp) || 0)
  return Math.floor(Math.sqrt(safe / 50)) + 1
}

/** XP where a given level BEGINS (level 1 begins at 0). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(Number(level) || 1))
  return 50 * (l - 1) * (l - 1)
}

/** Progress toward the next level: {level, into, need, pct}. */
export function xpProgress(xp: number): { level: number; into: number; need: number; pct: number } {
  const level = levelOf(xp)
  const base = xpForLevel(level)
  const next = xpForLevel(level + 1)
  const into = Math.max(0, xp - base)
  const need = Math.max(1, next - base)
  return { level, into, need, pct: Math.min(100, Math.round((into / need) * 100)) }
}

// Bragging rights: a title per tier, shown beside the LVL chip.
export function levelTitle(level: number): string {
  if (level >= 15) return 'Market Legend'
  if (level >= 11) return 'Bargain Boss'
  if (level >= 7) return 'Price Master'
  if (level >= 4) return 'Deal Hunter'
  if (level >= 2) return 'Hustler'
  return 'Rookie'
}

/**
 * The weekly battle window: the NEXT Monday 00:00 UTC after `now`.
 * The arena section counts down to this instant; the API reports it so the
 * client never computes a different deadline than the server.
 */
export function nextWeeklyReset(now: Date = new Date()): Date {
  const d = new Date(now.getTime())
  const day = d.getUTCDay() // 0 = Sunday ... 6 = Saturday
  const daysUntilMonday = (8 - day) % 7 || 7
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0, 0)
  return new Date(target)
}

/** Start of the rolling 7-day battle window (what "this week" means). */
export function weekWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - 7 * 24 * 3600 * 1000)
}

/** Compact countdown label, e.g. "2d 14h left". */
export function countdownLabel(target: Date, now: Date = new Date()): string {
  const ms = Math.max(0, target.getTime() - now.getTime())
  const hours = Math.floor(ms / 3600_000)
  const days = Math.floor(hours / 24)
  const h = hours % 24
  if (days > 0) return `${days}d ${h}h left`
  const minutes = Math.floor((ms % 3600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

// v203: QUEST SEASON - the weekly battle reads like a season ladder:
// "SEASON 4 · DAY 5" = ISO week 4 of the year, day 5 of the current round
// (Monday = day 1 ... Sunday = day 7, matching the Monday 00:00 UTC reset).
export function seasonLabel(now: Date = new Date()): { season: number; day: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // ISO day: Monday = 1 ... Sunday = 7
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  // ISO week number (week containing the first Thursday = week 1)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (4 - day)))
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const season = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { season: Math.max(1, season), day }
}

// v203: STICKER VAULT - the titles a poster earns, computed from the SAME
// two counters that drive XP (no new tables, no new writes). `metric` picks
// the counter; `target` is the unlock threshold; `effect` is the flavor
// text shown on the earned card. Ordered by how the vault displays them:
// two post milestones, two engagement milestones, two endgame milestones.
//
// v206: DMM (Dynamic Multiplier Matrix) - stickers are no longer purely
// decorative. Every def carries a buffType (VOTE_WEIGHT / VELOCITY /
// GLOBAL_XP) and a buffValue, players equip up to TWO, and the equipped
// buffs feed the game math: voteWeight() widens a vote's influence,
// effectiveTarget() shrinks unlock thresholds, and the XP multiplier
// fattens the displayed hustle rate (oracle.ts arbitrageDepth() also
// consumes the sum for the PEDA win-probability odds).
export type StickerMetric = 'posts' | 'votes'
export type StickerBuffType = 'VOTE_WEIGHT' | 'VELOCITY' | 'GLOBAL_XP'

export interface StickerDef {
  id: string
  name: string
  tier: string
  kind: 'post' | 'engagement'
  metric: StickerMetric
  target: number
  requirement: string
  effect: string
  // v206 DMM: the algorithmic parameter this sticker modifies
  buffType: StickerBuffType
  buffValue: number
  // Tailwind gradient for the sticker tile (earned state)
  gradient: string
}

export const STICKERS: StickerDef[] = [
  { id: 'deal-spark', name: 'Deal Spark', tier: 'Bronze Tier', kind: 'post', metric: 'posts', target: 10, requirement: '10 Posts Made', effect: '+2% XP Rate', buffType: 'GLOBAL_XP', buffValue: 0.02, gradient: 'from-amber-500 via-amber-400 to-orange-500' },
  { id: 'hustle-flame', name: 'Hustle Flame', tier: 'Silver Tier', kind: 'post', metric: 'posts', target: 25, requirement: '25 Posts Made', effect: '+5% Vote Influence', buffType: 'VOTE_WEIGHT', buffValue: 0.05, gradient: 'from-slate-300 via-slate-100 to-slate-400' },
  { id: 'hype-magnet', name: 'Hype Magnet', tier: 'Cyan Radiant', kind: 'engagement', metric: 'votes', target: 100, requirement: '100+ Helpful Votes', effect: '+3% Vote Influence', buffType: 'VOTE_WEIGHT', buffValue: 0.03, gradient: 'from-cyan-400 via-sky-300 to-teal-400' },
  { id: 'conversion-king', name: 'Conversion King', tier: 'Gold Sovereign', kind: 'engagement', metric: 'votes', target: 500, requirement: '500+ Helpful Votes', effect: '+15% Roadmap Velocity', buffType: 'VELOCITY', buffValue: 0.15, gradient: 'from-yellow-400 via-amber-300 to-yellow-500' },
  { id: 'century-lister', name: 'Century Lister', tier: 'Endgame', kind: 'post', metric: 'posts', target: 100, requirement: '100 Posts Made', effect: '+5% XP Rate', buffType: 'GLOBAL_XP', buffValue: 0.05, gradient: 'from-violet-500 via-purple-400 to-fuchsia-500' },
  { id: 'viral-overlord', name: 'Viral Overlord', tier: 'Endgame', kind: 'engagement', metric: 'votes', target: 2500, requirement: '2,500 Helpful Votes', effect: '+10% XP Rate', buffType: 'GLOBAL_XP', buffValue: 0.1, gradient: 'from-fuchsia-500 via-pink-400 to-rose-500' },
]

// v206 DMM: equip handshake - up to TWO active stickers at once.
export const EQUIP_LIMIT = 2
export const EQUIPPED_STORAGE_KEY = 'circub.equipped-stickers'

/** Defs for a list of equipped sticker ids (unknown ids are dropped). */
export function equippedStickerDefs(ids: string[]): StickerDef[] {
  const wanted = new Set(ids.filter((x) => typeof x === 'string'))
  return STICKERS.filter((s) => wanted.has(s.id))
}

/** Sum of one buff type across the equipped stickers (e.g. 0.07 = +7%). */
export function sumBuff(ids: string[], type: StickerBuffType): number {
  return equippedStickerDefs(ids)
    .filter((d) => d.buffType === type)
    .reduce((sum, d) => sum + (Number(d.buffValue) || 0), 0)
}

/**
 * Spec vote-weight: W = (1 + Level/20) x (1 + M_vote). A LVL 8 hustler with
 * Hustle Flame equipped casts a 1.4 x weighted vote.
 */
export function voteWeight(level: number, voteBuffSum: number): number {
  const l = Math.max(1, Number(level) || 1)
  return (1 + l / 20) * (1 + Math.max(0, voteBuffSum))
}

/** Velocity: reduces a sticker's unlock threshold by the equipped %%. */
export function effectiveTarget(target: number, velocityBuffSum: number): number {
  const t = Math.max(1, Number(target) || 1)
  const m = Math.min(0.9, Math.max(0, velocityBuffSum))
  return Math.max(1, Math.ceil(t * (1 - m)))
}

/**
 * Read the equipped sticker ids from localStorage (client only) with the
 * safe default: the first two unlocked sticker ids. Server render always
 * gets [] and the vault falls back to the same default until hydration.
 */
export function defaultEquippedIds(unlockedIds: string[]): string[] {
  return unlockedIds.slice(0, EQUIP_LIMIT)
}
export function readEquippedIds(unlockedIds: string[]): string[] {
  if (typeof window === 'undefined') return defaultEquippedIds(unlockedIds)
  try {
    const raw = window.localStorage.getItem(EQUIPPED_STORAGE_KEY)
    if (!raw) return defaultEquippedIds(unlockedIds)
    const parsed: unknown = JSON.parse(raw)
    const ids = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    const unlockedSet = new Set(unlockedIds)
    const valid = ids.filter((id) => unlockedSet.has(id))
    return valid.slice(0, EQUIP_LIMIT)
  } catch {
    return defaultEquippedIds(unlockedIds)
  }
}
export function writeEquippedIds(ids: string[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(EQUIPPED_STORAGE_KEY, JSON.stringify(ids.slice(0, EQUIP_LIMIT))) } catch { /* private mode */ }
}

export interface StickerState {
  def: StickerDef
  unlocked: boolean
  value: number
  pct: number
  remaining: number
}

export function stickerStates(lifetimePosts: number, lifetimeVotes: number, velocityBuffSum: number = 0): StickerState[] {
  return STICKERS.map((def) => {
    const value = Math.max(0, (def.metric === 'posts' ? lifetimePosts : lifetimeVotes) || 0)
    // v206 DMM: the equipped Conversion King's velocity multiplier shrinks
    // the threshold itself, so progress reads against the buffed target.
    const target = effectiveTarget(def.target, velocityBuffSum)
    const unlocked = value >= target
    return {
      def,
      unlocked,
      value,
      pct: Math.min(100, Math.round((value / target) * 100)),
      remaining: Math.max(0, target - value),
    }
  })
}

/** The next sticker to unlock = the locked one closest to its threshold. */
export function nextSticker(lifetimePosts: number, lifetimeVotes: number, velocityBuffSum: number = 0): StickerState | null {
  const locked = stickerStates(lifetimePosts, lifetimeVotes, velocityBuffSum).filter((s) => !s.unlocked)
  if (locked.length === 0) return null
  return locked.sort((a, b) => b.pct - a.pct)[0]
}

// v208: STICKERS ON EVERY SURFACE - classify a person by the stickers their
// lifetime counters have earned. The counters ride the payloads the app
// already ships (author.helpfulVotes + author.localPostCount on deal cards,
// social posts, the arena board), so these are pure functions over data in
// hand - no new endpoints, no schema changes. Classification uses the BASE
// thresholds (the viewer does not know which stickers the person has
// equipped, so the public class is the honest, unbuffed one).
export interface StickerClass {
  id: string
  name: string
  tier: string
  gradient: string
  effect: string
}

/** Defs the person has earned, in ascending tier order (STICKERS order). */
export function unlockedStickerDefs(lifetimePosts: number, lifetimeVotes: number): StickerDef[] {
  return stickerStates(lifetimePosts, lifetimeVotes)
    .filter((s) => s.unlocked)
    .map((s) => s.def)
}

/**
 * The person's sticker class = the highest-tier sticker they earned.
 * null = no stickers yet (they simply show no sticker tiles anywhere).
 */
export function stickerClassOf(lifetimePosts: number, lifetimeVotes: number): StickerClass | null {
  const defs = unlockedStickerDefs(lifetimePosts, lifetimeVotes)
  if (defs.length === 0) return null
  const top = defs[defs.length - 1]
  return { id: top.id, name: top.name, tier: top.tier, gradient: top.gradient, effect: top.effect }
}

/** Compact tier label for a chip: 'Bronze Tier' -> 'BRONZE'. */
export function stickerTierLabel(tier: string): string {
  return tier.replace(/\s*(Tier|Radiant|Sovereign)\s*/g, ' ').trim().toUpperCase()
}

/** Tailwind chip classes per tier family (dark surfaces like the arena). */
export function stickerTierChipClass(tier: string): string {
  if (tier.startsWith('Bronze')) return 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
  if (tier.startsWith('Silver')) return 'bg-slate-300/15 text-slate-200 border border-slate-300/30'
  if (tier.startsWith('Cyan')) return 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30'
  if (tier.startsWith('Gold')) return 'bg-yellow-400/15 text-yellow-300 border border-yellow-400/30'
  return 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-400/30'
}

// v211 (Task 214): PRICE RATING - the vault's rating stat, computed from
// the two things a hustler actually does: POSTING THE PRICE and ENGAGING
// ON THE VOTING - divided by their sticker ("divide them with their
// sticker"). The sticker enters the math as a DIVISOR keyed by the person's
// top EARNED tier, and better stickers divide harder (smaller divisor), so
// the exact same activity reads higher the higher the tier ladder goes.
// Honest + public: the divisor uses the top EARNED sticker (like every
// public classification since v207), never the viewer-local equipped pair,
// so everyone sees the same rating for the same person.
//   raw    = posts x 45 + helpful votes x 10
//   rating = round(raw / divisor)   divisor: Endgame 1, Gold 1.5, Cyan 2,
//                                   Silver 2.5, Bronze 3, no sticker 4
export const PRICE_RATING_POST_WEIGHT = 45
export const PRICE_RATING_VOTE_WEIGHT = 10

/** The sticker divisor for a person's counters (their top earned tier). */
export function stickerDivisorOf(lifetimePosts: number, lifetimeVotes: number): number {
  const cls = stickerClassOf(lifetimePosts, lifetimeVotes)
  if (!cls) return 4 // no sticker yet: the heaviest divisor
  if (cls.tier.startsWith('Bronze')) return 3
  if (cls.tier.startsWith('Silver')) return 2.5
  if (cls.tier.startsWith('Cyan')) return 2
  if (cls.tier.startsWith('Gold')) return 1.5
  return 1 // Endgame
}

/** The vault's Price Rating + the parts it came from (for the explainer). */
export function priceRatingOf(lifetimePosts: number, lifetimeVotes: number): {
  rating: number
  raw: number
  divisor: number
  tier: string | null
  tierLabel: string | null
} {
  const posts = Math.max(0, Number(lifetimePosts) || 0)
  const votes = Math.max(0, Number(lifetimeVotes) || 0)
  const raw = posts * PRICE_RATING_POST_WEIGHT + votes * PRICE_RATING_VOTE_WEIGHT
  const divisor = stickerDivisorOf(posts, votes)
  const cls = stickerClassOf(posts, votes)
  return {
    rating: Math.round(raw / divisor),
    raw,
    divisor,
    tier: cls ? cls.tier : null,
    tierLabel: cls ? stickerTierLabel(cls.tier) : null,
  }
}

/** 18400 -> "18.4K" (the vault's big stat tiles). */
export function formatCompact(n: number): string {
  const v = Math.max(0, Number(n) || 0)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `${v}`
}
