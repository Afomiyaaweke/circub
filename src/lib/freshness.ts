// Freshness of a price post - aligned with the price-history endpoint's
// time windows (src/app/api/local-prices/history/route.ts), whose "Current"
// bucket covers posts from the last 45 days. Anything older than that is
// outside the current window, so the price may be outdated and the UI says so.

export type FreshnessLevel = 'fresh' | 'current' | 'stale'

const DAY = 86400000

export function postAgeDays(createdAt: string | Date): number {
  const t = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime()
  return Math.max(0, Math.floor((Date.now() - t) / DAY))
}

// "Just now", "5h ago", "Yesterday", "3d ago", "2w ago", "4mo ago", "1y+ ago"
export function timeAgoLabel(createdAt: string | Date): string {
  const t = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime()
  const diff = Date.now() - t
  if (diff < 3600000) return 'Just now'
  if (diff < DAY) return `${Math.floor(diff / 3600000)}h ago`
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 345) return `${Math.max(1, Math.round(days / 30))}mo ago`
  return '1y+ ago'
}

export function freshnessLevel(createdAt: string | Date): FreshnessLevel {
  const days = postAgeDays(createdAt)
  if (days <= 7) return 'fresh'
  if (days <= 45) return 'current' // still inside the history endpoint's "Current" window
  return 'stale'
}

export function freshnessTitle(createdAt: string | Date): string {
  const level = freshnessLevel(createdAt)
  const label = timeAgoLabel(createdAt).toLowerCase()
  if (level === 'fresh') return `Posted ${label} - fresh price`
  if (level === 'current') return `Posted ${label}`
  return `Posted ${label} - this price is old and may be outdated`
}

// Tailwind classes per level so cards and the detail modal stay consistent
export const freshnessClasses: Record<FreshnessLevel, string> = {
  fresh: 'text-emerald-600',
  current: 'text-muted-foreground',
  stale: 'bg-amber-100 text-amber-800 font-medium',
}
