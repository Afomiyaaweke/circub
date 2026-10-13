// ============================================================================
// circubawd Live Zone roles.
// The SAME role question ("I am joining as *") is asked while a member
// registers (register-modal) and again inside the Live Zone join modal,
// where the sign-up answer arrives prefilled:
//   guide     - shows travelers around (tours, bookings, hourly rate)
//   vlogger   - films the real side of their city (videos front and center)
//   local     - shares prices, places and tips (the original circubawd local)
//   volunteer - helps out and meets travelers, no charge expected
//   sales     - sells real products to travelers (souvenirs, goods, crafts)
// Stored comma-separated on User.guideRoles (e.g. "guide,vlogger").
// Null/empty = legacy member who registered before roles existed -> guide.
// ============================================================================

export const circubawd_ROLES = ['guide', 'vlogger', 'local', 'volunteer', 'sales'] as const
export type circubawdRole = (typeof circubawd_ROLES)[number]

export const ROLE_META: Record<circubawdRole, { label: string; blurb: string; noun?: string }> = {
  guide: { label: 'Guide', blurb: 'Show travelers around' },
  vlogger: { label: 'Vlogger', blurb: 'Film the real side of your city' },
  local: { label: 'Local', blurb: 'Share real prices, places and tips' },
  volunteer: { label: 'Volunteer', blurb: 'Help out and meet travelers' },
  sales: { label: 'Sales', blurb: 'Sell your products to travelers', noun: 'seller' },
}

// Parse the stored string into valid role slugs (order follows circubawd_ROLES,
// so badges render in a stable order regardless of how they were saved).
export function parseGuideRoles(raw?: string | string[] | null): circubawdRole[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim()
      ? raw.split(',')
      : []
  const valid = new Set<circubawdRole>()
  for (const p of parts) {
    const slug = String(p).trim().toLowerCase()
    if ((circubawd_ROLES as readonly string[]).includes(slug)) valid.add(slug as circubawdRole)
  }
  return circubawd_ROLES.filter((r) => valid.has(r))
}

// Back-compat: a member without stored roles is a guide (that was the only
// role before v76).
export function guideRolesOrLegacy(raw?: string | string[] | null): circubawdRole[] {
  const parsed = parseGuideRoles(raw)
  return parsed.length > 0 ? parsed : ['guide']
}

// "Guide · Vlogger" - badge/eyebrow text for a role list.
export function roleListLabel(roles: circubawdRole[]): string {
  return roles.map((r) => ROLE_META[r].label).join(' · ')
}

// Noun for sentences like "Meet X, a seller on circubawd" - falls back to the
// lowercased label ("guide", "vlogger", ...) when no special noun is set.
export function roleNoun(role: circubawdRole): string {
  return ROLE_META[role].noun ?? ROLE_META[role].label.toLowerCase()
}

// Toggle a role in a selection, never allowing zero roles (the program needs
// at least one). Shared by the sign-up role question and the Live Zone modal.
export function togglecircubawdRole(prev: circubawdRole[], role: circubawdRole): circubawdRole[] {
  if (prev.includes(role)) {
    if (prev.length === 1) return prev
    return prev.filter((r) => r !== role)
  }
  // Stable chip order follows circubawd_ROLES.
  return circubawd_ROLES.filter((r) => prev.includes(r) || r === role)
}
