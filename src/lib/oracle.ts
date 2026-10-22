// v206: ORACLE RUNTIME - the PriceQuest operational architecture spec as
// pure functions over the data the app already writes (zero schema changes).
//
// Five engines from the spec, mapped onto existing counters:
//   OIVE  Oracle Ingestion & Verification Engine - every deal gets an
//         Oracle Score = Spread x 45 + Proof Confidence x 35 + Scarcity x 20.
//         We have no receipt OCR, so proof confidence rides the post's own
//         photo (0.92) with the spec's community-audit fallback (0.20)
//         when there is none. MSRP baseline = the market's best-known
//         price for the same product (the highest price seen this week is
//         the cross-check the crowd gives us; a lone post falls back to
//         its own priceMax range). Tiers: >=90 EXTREME ALPHA (+85 base XP,
//         instant duel eligibility, auto-broadcast), 70-89 STANDARD
//         VERIFIED (+50), <70 CROWD AUDIT (10 positive votes to validate).
//   DMM   Dynamic Multiplier Matrix - lives in arena.ts (sticker buffs).
//   PEDA  PvP Escrow & Duel Arbiter - win probability from the logistic
//         curve of both Arbitrage Depth Indices, a deterministic invite
//         code per duel, and the escrow settlement split (winner 87.5%,
//         winning voters pool 12.5% of the pot).
//   TRSE  Traveler Roadmap State Engine - state names + gates surface on
//         the quest roadmap (quest-feed.tsx).
//   VACH  Vlogger Arbitrage Clearinghouse - Extreme Alpha deals carry a
//         synergy referral link and the 60/25/15 settlement split.

// ---------------------------------------------------------------------------
// OIVE - Oracle Ingestion & Verification Engine
// ---------------------------------------------------------------------------

/** Spec weights: Score = Spread x 45 + Confidence x 35 + Scarcity x 20. */
export const ORACLE_WEIGHTS = { spread: 45, confidence: 35, scarcity: 20 } as const

export const ORACLE_TIERS = {
  EXTREME_ALPHA: { label: 'Extreme Alpha', baseXp: 85, duelEligible: true },
  STANDARD_VERIFIED: { label: 'Verified', baseXp: 50, duelEligible: false },
  CROWD_AUDIT: { label: 'Crowd Audit', baseXp: 25, duelEligible: false },
} as const

export type OracleTierName = keyof typeof ORACLE_TIERS

export interface OracleResult {
  score: number
  tier: OracleTierName
  label: string
  baseXp: number
  /** 0..100 percent form of the spread component (for the UI chip). */
  spreadPct: number
  /** 0..1 proof confidence (photo proof vs the 0.20 audit fallback). */
  confidence: number
  /** 0..1 scarcity velocity (rarer deal = closer to 1). */
  scarcity: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number(n) || 0))

/**
 * Proof confidence: a photo on the post is the deal's receipt - the closest
 * signal the app has to the spec's OCR badge. No photo = the spec's explicit
 * community-audit fallback (0.20).
 */
export function proofConfidence(hasImage: boolean): number {
  return hasImage ? 0.92 : 0.20
}

/**
 * Scarcity velocity V in [0,1]: how rare this deal is given how many
 * identical deals were logged in the recency window. Zero duplicates =
 * perfectly scarce (1.0); each identical deal decays it (1/(1+n)).
 */
export function scarcityVelocity(recentIdenticalDeals: number): number {
  return 1 / (1 + Math.max(0, Math.floor(recentIdenticalDeals)))
}

/** Spread Ratio = (MSRP - Offer) / MSRP, clamped to [0,1]. */
export function spreadRatio(baseline: number, offer: number): number {
  const base = Number(baseline) || 0
  const off = Number(offer) || 0
  if (base <= 0 || off < 0) return 0
  return clamp01((base - off) / base)
}

/** The weighted Oracle Score, 0..100. */
export function oracleScoreOf(spread: number, confidence: number, scarcity: number): number {
  const s = ORACLE_WEIGHTS.spread * clamp01(spread)
  const c = ORACLE_WEIGHTS.confidence * clamp01(confidence)
  const v = ORACLE_WEIGHTS.scarcity * clamp01(scarcity)
  return Math.round(s + c + v)
}

export function oracleTierOf(score: number): OracleTierName {
  if (score >= 90) return 'EXTREME_ALPHA'
  if (score >= 70) return 'STANDARD_VERIFIED'
  return 'CROWD_AUDIT'
}

/** Full OIVE verdict for a deal, given its market baseline. */
export function oracleVerdict(opts: {
  offerPrice: number
  baselinePrice: number
  hasImage: boolean
  recentIdenticalDeals: number
}): OracleResult {
  const spread = spreadRatio(opts.baselinePrice, opts.offerPrice)
  const confidence = proofConfidence(opts.hasImage)
  const scarcity = scarcityVelocity(opts.recentIdenticalDeals)
  const score = oracleScoreOf(spread, confidence, scarcity)
  const tier = oracleTierOf(score)
  return {
    score,
    tier,
    label: ORACLE_TIERS[tier].label,
    baseXp: ORACLE_TIERS[tier].baseXp,
    spreadPct: Math.round(spread * 100),
    confidence,
    scarcity,
  }
}

/** The market cross-check baseline: the best-known price for the product. */
export function marketBaseline(offerPrice: number, priceMax: number, otherPrices: number[]): number {
  const pool = [...otherPrices.map((p) => Number(p) || 0), Number(priceMax) || 0]
  const best = Math.max(...pool, Number(offerPrice) || 0)
  return best
}

// ---------------------------------------------------------------------------
// PEDA - PvP Escrow & Duel Arbiter
// ---------------------------------------------------------------------------

export const PEDA = {
  /** Wager tiers the spec allows (XP locked in escrow per side). */
  wagerTiers: [100, 250] as const,
  defaultWager: 100,
  /** Winner's share of the pot; the rest goes to the winning voters. */
  winnerPct: 87.5,
  votersPct: 12.5,
  /** Logistic curve temperature for the win-probability odds. */
  k: 20,
} as const

export interface EscrowSettlement {
  wager: number
  pot: number
  winnerShare: number
  votersPool: number
}

/** Escrow pot = 2 x wager; winner takes 87.5%, winning voters split 12.5%. */
export function escrowSettlement(wager: number = PEDA.defaultWager): EscrowSettlement {
  const w = Math.max(0, Math.round(Number(wager) || PEDA.defaultWager))
  const pot = w * 2
  return {
    wager: w,
    pot,
    winnerShare: Math.round((pot * PEDA.winnerPct) / 100),
    votersPool: Math.round((pot * PEDA.votersPct) / 100),
  }
}

/**
 * P(A wins) = e^((Ia-Ib)/20) / (1 + e^((Ia-Ib)/20)) x 100 - the spec's
 * logistic odds over both sides' Arbitrage Depth Indices.
 */
export function winProbability(depthA: number, depthB: number): number {
  const d = (Number(depthA) || 0) - (Number(depthB) || 0)
  const p = Math.exp(d / PEDA.k) / (1 + Math.exp(d / PEDA.k))
  return Math.round(p * 100)
}

/** Arbitrage Depth Index: I = Oracle Score x (1 + sum of equipped buffs). */
export function arbitrageDepth(oracleScore: number, buffSum: number = 0): number {
  return Math.max(0, Number(oracleScore) || 0) * (1 + Math.max(0, Number(buffSum) || 0))
}

/**
 * Deterministic duel invite code from the duel's own ids - the spec's
 * DUEL-EXPEDITION-9842 shape, stable for the same pairing.
 */
export function duelInviteCode(seed: string): string {
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0
  const words = ['EXPEDITION', 'HUSTLE', 'SHOWDOWN', 'VAULT', 'CIRCUIT', 'GAUNTLET']
  const word = words[h % words.length]
  const num = (h % 9000) + 1000
  return `DUEL-${word}-${num}`
}

// ---------------------------------------------------------------------------
// VACH - Vlogger Arbitrage Clearinghouse
// ---------------------------------------------------------------------------

export const VACH = {
  /** Affiliate settlement: 60% creator, 25% buyer cashback, 15% hunter. */
  creatorPct: 60,
  buyerPct: 25,
  hunterPct: 15,
} as const

/** The encrypted-style synergy referral link for an Extreme Alpha deal. */
export function synergyLink(origin: string, dealId: string, creatorId: string): string {
  const o = (origin || '').replace(/\/$/, '')
  return `${o}/?deal=${encodeURIComponent(dealId)}&ref=${encodeURIComponent(creatorId)}`
}
