// LocalStorage-based saved posts/price posts. No DB changes needed —
// the saves are per-device (browser localStorage). This is intentionally
// simple so guests can save items too (they don't have a DB user account).

const STORAGE_KEY = 'circub_saved_items'

export interface SavedItem {
  id: string
  type: 'post' | 'localPrice'
  title: string
  subtitle?: string | null
  priceLabel?: string | null
  imageUrl?: string | null
  href?: string | null
  savedAt: number
}

export function getSavedItems(): SavedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedItem[]
  } catch {
    return []
  }
}

export function isSaved(itemId: string): boolean {
  return getSavedItems().some((s) => s.id === itemId)
}

export function saveItem(item: Omit<SavedItem, 'savedAt'>): void {
  if (typeof window === 'undefined') return
  const items = getSavedItems()
  if (items.some((s) => s.id === item.id)) return // already saved
  const newItem: SavedItem = { ...item, savedAt: Date.now() }
  const updated = [newItem, ...items].slice(0, 100) // max 100 saved items
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  // Dispatch event so other components can react
  window.dispatchEvent(new CustomEvent('circub:saved-changed'))
}

export function unsaveItem(itemId: string): void {
  if (typeof window === 'undefined') return
  const items = getSavedItems().filter((s) => s.id !== itemId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('circub:saved-changed'))
}

export function toggleSaved(item: Omit<SavedItem, 'savedAt'>): boolean {
  if (isSaved(item.id)) {
    unsaveItem(item.id)
    return false
  } else {
    saveItem(item)
    return true
  }
}
