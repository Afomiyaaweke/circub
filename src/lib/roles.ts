// ============================================================================
// circub Live Zone roles.
// A registered community member picks one or more roles when they join:
//   guide     - shows travelers around (tours, bookings, hourly rate)
//   vlogger   - films the real side of their city (videos front and center)
//   local     - shares prices, places and tips (the original circub local)
//   volunteer - helps out and meets travelers, no charge expected
// Stored comma-separated on User.guideRoles (e.g. "guide,vlogger").
// Null/empty = legacy member who registered before roles existed -> guide.
// ============================================================================

export const CIRCUB_ROLES = ['guide', 'vlogger', 'local', 'volunteer'] as const
export type CircubRole = (typeof CIRCUB_ROLES)[number]

export const ROLE_META: Record<CircubRole, { label: string; blurb: string }> = {
  guide: { label: 'Guide', blurb: 'Show travelers around' },
  vlogger: { label: 'Vlogger', blurb: 'Film the real side of your city' },
  local: { label: 'Local', blurb: 'Share real prices, places and tips' },
  volunteer: { label: 'Volunteer', blurb: 'Help out and meet travelers' },
}

// Parse the stored string into valid role slugs (order follows CIRCUB_ROLES,
// so badges render in a stable order regardless of how they were saved).
export function parseGuideRoles(raw?: string | string[] | null): CircubRole[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim()
      ? raw.split(',')
      : []
  const valid = new Set<CircubRole>()
  for (const p of parts) {
    const slug = String(p).trim().toLowerCase()
    if ((CIRCUB_ROLES as readonly string[]).includes(slug)) valid.add(slug as CircubRole)
  }
  return CIRCUB_ROLES.filter((r) => valid.has(r))
}

// Back-compat: a member without stored roles is a guide (that was the only
// role before v76).
export function guideRolesOrLegacy(raw?: string | string[] | null): CircubRole[] {
  const parsed = parseGuideRoles(raw)
  return parsed.length > 0 ? parsed : ['guide']
}

// "Guide · Vlogger" - badge/eyebrow text for a role list.
export function roleListLabel(roles: CircubRole[]): string {
  return roles.map((r) => ROLE_META[r].label).join(' · ')
}
