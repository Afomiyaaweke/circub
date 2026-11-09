// v255 A BOUNTY IS MORE THAN MONEY.
// People post for the thing they need help with, offer money in return, AND
// can ask takers to be part of their business or to help with research. The
// poster ticks any combination of the three ask types on the quest form and
// the row stores them as a comma-separated whitelist string ("MONEY,BUSINESS").
// This module is the single source of truth for the tokens, their labels and
// the server-side sanitizer - unknown or empty values fall back to MONEY so
// old rows and legacy clients keep working unchanged.

export const QUEST_ASK_TYPES = ['MONEY', 'BUSINESS', 'RESEARCH'] as const

export type QuestAskType = (typeof QUEST_ASK_TYPES)[number]

export const QUEST_ASK_LABELS: Record<QuestAskType, string> = {
  MONEY: 'Money offer',
  BUSINESS: 'Join my business',
  RESEARCH: 'Research help',
}

// Client-side reader: "MONEY,BUSINESS" -> ['MONEY','BUSINESS']; anything
// unparsable reads as the classic money-only bounty.
export function parseAskTypes(raw: string | null | undefined): QuestAskType[] {
  const tokens = String(raw ?? '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is QuestAskType => (QUEST_ASK_TYPES as readonly string[]).includes(t))
  return tokens.length ? Array.from(new Set(tokens)) : ['MONEY']
}

export function hasAskType(raw: string | null | undefined, t: QuestAskType): boolean {
  return parseAskTypes(raw).includes(t)
}

// Server-side sanitizer: accepts an array (from the checkbox group) or a
// comma string, keeps whitelist order, dedupes; empty/unknown -> 'MONEY'.
export function normalizeAskTypes(raw: unknown): string {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',')
  const wanted = list.map((x) => String(x).trim().toUpperCase())
  const picked = QUEST_ASK_TYPES.filter((t) => wanted.includes(t))
  return picked.length ? picked.join(',') : 'MONEY'
}
