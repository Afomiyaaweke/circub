// "Remember where the user is if the page is not refreshed"
//
// Two mechanisms, scoped exactly to that promise:
// - MODULE state: survives client-side navigations away and back (the JS
//   runtime never unloads), dies on any full document load.
// - sessionStorage + navigation type: when the user leaves via a plain link
//   (full load) and comes back with the BROWSER BACK button, the document
//   reloads but `performance` reports navigation type 'back_forward'. That is
//   a return, not a refresh, so the position is restored. A true refresh
//   ('reload') or a fresh visit ('navigate') starts clean at the default tab.
// bfcache restores natively without any JS running, so nothing to do there.
import type { TabKey } from '@/lib/types'

export type ProfileSection = 'posts' | 'listings' | 'products' | 'saved' | 'network'

export interface LastPosition {
  tab: TabKey
  section: ProfileSection | null
}

const KEY = 'circub.position.v1'

let moduleTab: TabKey | null = null
let moduleSection: ProfileSection | null = null

export function rememberPosition(
  tab: TabKey,
  section: ProfileSection | null
): void {
  moduleTab = tab
  moduleSection = section
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ tab, section }))
  } catch {
    /* storage unavailable (private mode etc.) - module state still works */
  }
}

export function recallPosition(): LastPosition | null {
  // Same JS session (client-side navigation away + back): always restore.
  if (moduleTab) return { tab: moduleTab, section: moduleSection }
  if (typeof window === 'undefined') return null

  // Full document load: only restore when the user is RETURNING to the page
  // (browser back/forward), never after an actual refresh or a fresh visit.
  let navType = ''
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    navType = nav?.type ?? ''
  } catch {
    return null
  }
  if (navType !== 'back_forward') return null

  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LastPosition
    if (parsed?.tab) return { tab: parsed.tab, section: parsed.section ?? null }
  } catch {
    /* corrupt entry - ignore */
  }
  return null
}
