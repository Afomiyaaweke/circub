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
export type StickerMetric = 'posts' | 'votes'

export interface StickerDef {
  id: string
  name: string
  tier: string
  kind: 'post' | 'engagement'
  metric: StickerMetric
  target: number
  requirement: string
  effect: string
  // Tailwind gradient for the sticker tile (earned state)
  gradient: string
}

export const STICKERS: StickerDef[] = [
  { id: 'deal-spark', name: 'Deal Spark', tier: 'Bronze Tier', kind: 'post', metric: 'posts', target: 10, requirement: '10 Posts Made', effect: '+2% XP Rate', gradient: 'from-amber-500 via-amber-400 to-orange-500' },
  { id: 'hustle-flame', name: 'Hustle Flame', tier: 'Silver Tier', kind: 'post', metric: 'posts', target: 25, requirement: '25 Posts Made', effect: '+5% Deal Votes', gradient: 'from-slate-300 via-slate-100 to-slate-400' },
  { id: 'hype-magnet', name: 'Hype Magnet', tier: 'Cyan Radiant', kind: 'engagement', metric: 'votes', target: 100, requirement: '100+ Helpful Votes', effect: 'Live Counter {value} / 1,000', gradient: 'from-cyan-400 via-sky-300 to-teal-400' },
  { id: 'conversion-king', name: 'Conversion King', tier: 'Gold Sovereign', kind: 'engagement', metric: 'votes', target: 500, requirement: '500+ Helpful Votes', effect: '+15% Velocity', gradient: 'from-yellow-400 via-amber-300 to-yellow-500' },
  { id: 'century-lister', name: 'Century Lister', tier: 'Endgame', kind: 'post', metric: 'posts', target: 100, requirement: '100 Posts Made', effect: 'Century Badge', gradient: 'from-violet-500 via-purple-400 to-fuchsia-500' },
  { id: 'viral-overlord', name: 'Viral Overlord', tier: 'Endgame', kind: 'engagement', metric: 'votes', target: 2500, requirement: '2,500 Helpful Votes', effect: 'Overlord Badge', gradient: 'from-fuchsia-500 via-pink-400 to-rose-500' },
]

export interface StickerState {
  def: StickerDef
  unlocked: boolean
  value: number
  pct: number
  remaining: number
}

export function stickerStates(lifetimePosts: number, lifetimeVotes: number): StickerState[] {
  return STICKERS.map((def) => {
    const value = Math.max(0, (def.metric === 'posts' ? lifetimePosts : lifetimeVotes) || 0)
    const unlocked = value >= def.target
    return {
      def,
      unlocked,
      value,
      pct: Math.min(100, Math.round((value / def.target) * 100)),
      remaining: Math.max(0, def.target - value),
    }
  })
}

/** The next sticker to unlock = the locked one closest to its threshold. */
export function nextSticker(lifetimePosts: number, lifetimeVotes: number): StickerState | null {
  const locked = stickerStates(lifetimePosts, lifetimeVotes).filter((s) => !s.unlocked)
  if (locked.length === 0) return null
  return locked.sort((a, b) => b.pct - a.pct)[0]
}

/** 18400 -> "18.4K" (the vault's big stat tiles). */
export function formatCompact(n: number): string {
  const v = Math.max(0, Number(n) || 0)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `${v}`
}
