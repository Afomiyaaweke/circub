// v205: FIGHTER ROSTER - every player gets an anime fighter character as
// their combat avatar (user: 'give them anime fighter character image they
// can edit on there profile while they get good rating for their service').
//
// - The roster is edited on the profile: the user picks ONE equipped
//   fighter, persisted through the existing profilePicture column as
//   'fighter:<id>' (zero schema changes - PATCH /api/auth/me already
//   accepts profilePicture).
// - Fighters UNLOCK with rating: the same arena XP math that powers the
//   Weekly Hustle (poster XP = helpfulVotes*100 + localPostCount*50), so
//   every Helpful vote on the user's service both levels them up and walks
//   them toward the next fighter.
// - avatarSrc() resolves 'fighter:<id>' to the bundled image so every
//   avatar surface (profile, quest top bar, arena, cards, modals) renders
//   the equipped fighter with one helper call.
import { levelOf, posterXp, xpForLevel } from './arena'

export const FIGHTER_PREFIX = 'fighter:'

export interface FighterDef {
  id: string
  name: string
  epithet: string
  /** LVL required to equip - driven by the Helpful-vote XP math */
  unlockLevel: number
  img: string
  /** equipped-state ring (tailwind) */
  ring: string
}

export const FIGHTERS: FighterDef[] = [
  { id: 'blaze',   name: 'Blaze',   epithet: 'Rookie Brawler',  unlockLevel: 1,  img: '/fighters/blaze.png',   ring: 'ring-orange-400' },
  { id: 'volt',    name: 'Volt',    epithet: 'Volt Striker',    unlockLevel: 3,  img: '/fighters/volt.png',    ring: 'ring-cyan-400' },
  { id: 'onyx',    name: 'Onyx',    epithet: 'Shadow Duelist',  unlockLevel: 5,  img: '/fighters/onyx.png',    ring: 'ring-violet-400' },
  { id: 'tempest', name: 'Tempest', epithet: 'Storm Breaker',   unlockLevel: 7,  img: '/fighters/tempest.png', ring: 'ring-sky-400' },
  { id: 'ronin',   name: 'Ronin',   epithet: 'Cyber Ronin',     unlockLevel: 9,  img: '/fighters/ronin.png',   ring: 'ring-fuchsia-400' },
  { id: 'apex',    name: 'Apex',    epithet: 'Market Legend',   unlockLevel: 12, img: '/fighters/apex.png',    ring: 'ring-amber-400' },
]

/** Parse a stored profilePicture into its FighterDef, or null for a plain photo. */
export function fighterFromPicture(pic?: string | null): FighterDef | null {
  if (!pic || !pic.startsWith(FIGHTER_PREFIX)) return null
  const id = pic.slice(FIGHTER_PREFIX.length).trim()
  return FIGHTERS.find((f) => f.id === id) ?? null
}

/**
 * Universal avatar resolver: 'fighter:<id>' -> the bundled fighter image,
 * anything else passes through untouched (real photos keep working),
 * null/undefined -> undefined so <img src={...}> stays clean.
 */
export function avatarSrc(pic?: string | null): string | undefined {
  if (!pic) return undefined
  const f = fighterFromPicture(pic)
  return f ? f.img : pic
}

/** Equip encode - what gets stored in profilePicture. */
export function fighterPicture(id: string): string {
  return `${FIGHTER_PREFIX}${id}`
}

/** The viewer's current level from their rating counters (arena math). */
export function levelFromRating(helpfulVotes?: number | null, localPostCount?: number | null): number {
  return Math.max(1, levelOf(posterXp({ helpfulVotes: helpfulVotes ?? 0, localPostCount: localPostCount ?? 0 })))
}

/** Is this fighter equippable at the given level? */
export function fighterUnlocked(f: FighterDef, level: number): boolean {
  return level >= f.unlockLevel
}

/** Helpful votes still missing to unlock this fighter (rating progress). */
export function votesToUnlock(f: FighterDef, helpfulVotes?: number | null, localPostCount?: number | null): number {
  const need = xpForLevel(f.unlockLevel)
  const have = posterXp({ helpfulVotes: helpfulVotes ?? 0, localPostCount: localPostCount ?? 0 })
  return Math.max(0, Math.ceil((need - have) / 100))
}
