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
