import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * v121: display suffix for a product's measuring unit.
 * "kg" -> " / kg", "per kg" (legacy free text) -> " per kg",
 * blank or "each" -> "" (no suffix - the price is simply the item price).
 */
export function formatUnitSuffix(unit?: string | null): string {
  const u = (unit ?? '').trim()
  if (!u || u.toLowerCase() === 'each') return ''
  return /^(per\s|\/)/i.test(u) ? ` ${u}` : ` / ${u}`
}
