// v253 BOUNTIES ARE NOT DOLLAR-LOCKED.
// The poster picks the currency next to the amount (USD, ETB, EUR, ...) and
// the amount itself has no min/max requirement - any number from 0 up is a
// valid bounty. This module is the single source of truth for the option
// list and the display format so every board (live zone, help desk, profile
// escrow) renders the same currency-aware label.

export const BOUNTY_CURRENCIES = [
  'USD', 'ETB', 'EUR', 'GBP', 'KES', 'AED', 'SAR', 'NGN', 'INR', 'CAD',
] as const

export type BountyCurrency = (typeof BOUNTY_CURRENCIES)[number]

export const BOUNTY_CURRENCY_DEFAULT: BountyCurrency = 'USD'

const BOUNTY_CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  ETB: 'Br',
  EUR: '€',
  GBP: '£',
  KES: 'KSh ',
  AED: 'AED ',
  SAR: 'SAR ',
  NGN: '₦',
  INR: '₹',
  CAD: 'C$ ',
}

// Server-side sanitizer: unknown / missing values fall back to USD so old
// rows and legacy clients keep working unchanged.
export function normalizeBountyCurrency(raw: unknown): BountyCurrency {
  const s = String(raw ?? '').trim().toUpperCase().slice(0, 8)
  return (BOUNTY_CURRENCIES as readonly string[]).includes(s)
    ? (s as BountyCurrency)
    : BOUNTY_CURRENCY_DEFAULT
}

// `ETB 500.00`, `$15.00`, `KSh 1200.00` - one formatter everywhere a bounty
// amount is shown (cards, saved labels, share text, escrow desk).
export function fmtBounty(amount: number, currency?: string | null): string {
  const cur = normalizeBountyCurrency(currency)
  const sym = BOUNTY_CURRENCY_SYMBOLS[cur] ?? `${cur} `
  const safe = Number.isFinite(amount) ? amount : 0
  return `${sym}${safe.toFixed(2)}`
}
