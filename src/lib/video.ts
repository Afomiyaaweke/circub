// video.ts - parse YouTube / Instagram video links into embeddable players.
//
// Users paste a normal link ("while they register as a guide" or "anywhere"
// on a post) and the app turns it into an in-app embed - no uploads needed.
// Stores the ORIGINAL url everywhere; embed URLs are derived on the client.

export type VideoPlatform = 'youtube' | 'instagram'

export interface ParsedVideo {
  platform: VideoPlatform
  /** Video/page id extracted from the url. */
  id: string
  /** Url for the in-app <iframe> player. */
  embedUrl: string
  /** Canonical original url (what we persist). */
  canonicalUrl: string
  /** Human label for chips, e.g. "YouTube video". */
  label: string
}

const YT_ID = /[a-zA-Z0-9_-]{6,20}/
const IG_ID = /[a-zA-Z0-9_-]{5,25}/

/**
 * Parse a pasted video url.
 * Accepts:
 *  - youtube.com/watch?v=ID (+ m./www./music. subdomains, &t= etc.)
 *  - youtu.be/ID
 *  - youtube.com/shorts/ID, /embed/ID, /live/ID
 *  - instagram.com/p/ID, /reel/ID, /reels/ID, /tv/ID
 * Returns null for anything else (caller decides whether that is an error).
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  const url = (raw || '').trim()
  if (!url || url.length > 500) return null
  // Bare id ("dQw4w9WgXcQ") is NOT accepted - must look like a link.
  if (!/^https?:\/\//i.test(url) && !/^(www\.|m\.|youtu\.be|youtube\.com|instagram\.com)/i.test(url)) {
    return null
  }

  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return null
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')

  // ---------------- YouTube ----------------
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    let id: string | null = null
    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0] || null
    } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) {
      id = u.pathname.split('/')[2] || null
    } else if (u.pathname === '/watch' || u.pathname.startsWith('/watch')) {
      id = u.searchParams.get('v')
    }
    if (id && YT_ID.test(id)) {
      return {
        platform: 'youtube',
        id,
        embedUrl: `https://www.youtube.com/embed/${id}`,
        canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        label: 'YouTube video',
      }
    }
    return null
  }

  // ---------------- Instagram ----------------
  if (host === 'instagram.com' || host === 'instagr.am' || host === 'ddinstagram.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    // /p/<id>, /tv/<id>, /reel/<id>, /reels/<id> (also /<user>/p/<id> shape)
    const typeIdx = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p.toLowerCase()))
    if (typeIdx >= 0) {
      const type = parts[typeIdx].toLowerCase() === 'reels' ? 'reel' : parts[typeIdx].toLowerCase()
      const id = parts[typeIdx + 1]
      if (id && IG_ID.test(id)) {
        return {
          platform: 'instagram',
          id,
          embedUrl: `https://www.instagram.com/${type}/${id}/embed`,
          canonicalUrl: `https://www.instagram.com/${type}/${id}/`,
          label: 'Instagram video',
        }
      }
    }
    return null
  }

  return null
}

/** Max video links a guide profile may carry. */
export const MAX_GUIDE_VIDEOS = 3

/** Split a stored comma-separated list into raw url strings. */
export function splitVideoUrls(csv?: string | null): string[] {
  if (!csv) return []
  return csv.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Validate an array of raw video links (guide registration / post attach).
 * Returns the first invalid entry, or null when all links parse.
 */
export function firstInvalidVideoUrl(urls: string[]): string | null {
  for (const u of urls) {
    if (!u.trim()) continue
    if (!parseVideoUrl(u)) return u
  }
  return null
}
