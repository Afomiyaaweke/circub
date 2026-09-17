// ============================================================================
// USERNAME - the shareable profile handle (circub.app/u/<username>).
// One source of truth for normalization + validation, used by the register
// API, the profile PATCH endpoint, the availability-check endpoint and both
// UIs (sign-up modal + Edit profile). Always stored lowercase, [a-z0-9_].
// ============================================================================

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

// Handles that would collide with app routes or reserved meanings.
export const RESERVED_USERNAMES = new Set([
  'api', 'u', 'guest', 'admin', 'administrator', 'circub', 'root', 'null',
  'undefined', 'support', 'help', 'about', 'login', 'register', 'signup',
  'signin', 'settings', 'profile', 'feed', 'local', 'guides', 'network',
  'bookmark', 'saved', 'messages', 'story', 'stories', 'verify', 'verification',
])

/** Normalize raw input: trim, lowercase, strip leading @, spaces -> underscores. */
export function normalizeUsername(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
}

export type UsernameCheck =
  | { ok: true; username: string }
  | { ok: false; error: string }

/** Validate a normalized username. Returns the clean handle or a friendly error. */
export function validateUsername(raw: string): UsernameCheck {
  const username = normalizeUsername(raw)
  if (!username) return { ok: false, error: 'Username is required' }
  if (username.length < 3) return { ok: false, error: 'Username must be at least 3 characters' }
  if (username.length > 20) return { ok: false, error: 'Username must be 20 characters or fewer' }
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Only lowercase letters, numbers and underscores are allowed' }
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { ok: false, error: 'That username is reserved - please pick another' }
  }
  return { ok: true, username }
}

/** Build the public share link for a handle (client-side helper). */
export function profileLink(username: string, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/u/${normalizeUsername(username)}`
}
