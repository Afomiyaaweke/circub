// The ONE canonical category list for every category surface in circub:
// the price-post picker, the product picker, the edit modal and both filter
// dropdowns all render THIS array. Full flat alphabetical list (user's
// spec, verbatim) - no grouping, no headers, 'Other' kept last so it reads
// as the catch-all rather than a letter of the alphabet.
export const CATEGORIES: string[] = [
  'Accommodation',
  'Agriculture & Farming',
  'Automotive',
  'Baby & Kids Products',
  'Bakery & Sweets',
  'Beauty & Personal Care',
  'Biomedical & Medical Supplies',
  'Books & Stationery',
  'Clothing & Apparel',
  'Coffee & Cafés',
  'Construction & Home Repair',
  'Education & Tutoring',
  'Electronics',
  'Events & Entertainment',
  'Fitness & Wellness Centers',
  'Food & Groceries',
  'Furniture & Home Decor',
  'Handicrafts',
  'Hospitals & Clinics',
  'Jewelry & Accessories',
  'Legal & Financial Services',
  'Movers & Relocation',
  'Pet Supplies',
  'Pharmacy & Drug Store',
  'Real Estate',
  'Restaurants',
  'Services',
  'Sports & Fitness Gear',
  'Textiles & Fabrics',
  'Transportation',
  'Other',
]

// The filter-only option shown at the top of category filter dropdowns.
// Kept here so the value string has a single source of truth (the APIs
// compare against it to mean "no filter").
export const ALL_CATEGORIES = 'All categories'

// Older posts in the database carry the pre-v82 short category names. When a
// user filters by a new umbrella category the API also matches these legacy
// values, so nothing already posted becomes invisible after the rename.
export const CATEGORY_ALIASES: Record<string, string[]> = {
  'Food & Groceries': ['Food', 'Beverages', 'Spices', 'Seafood', 'Markets'],
  'Textiles & Fabrics': ['Textiles'],
  'Clothing & Apparel': ['Clothing'],
  'Coffee & Cafés': ['Coffee'],
  'Agriculture & Farming': ['Agriculture'],
}

// Values a category filter dropdown must offer: the canonical list, plus any
// legacy values that still exist in the data (so old posts stay individually
// reachable, not only through the umbrella aliases).
export function categoryFilterOptions(existingInDb: readonly string[] = []): string[] {
  const merged = new Set<string>(CATEGORIES)
  for (const c of existingInDb) merged.add(c)
  return Array.from(merged)
}

/**
 * Loose category matcher for AI/photo-identify prefills. The canonical names
 * are now multi-word ("Coffee & Cafés"), but a search term is usually a bare
 * word ("coffee", "bakery") - so besides the full name we also try the part
 * before " & " and the first word. Falls back to 'Other'.
 */
export function matchCategoryLoose(hint: string): string {
  const hay = (hint || '').toLowerCase().trim()
  if (!hay) return 'Other'
  for (const c of CATEGORIES) {
    if (c !== 'Other' && hay.includes(c.toLowerCase())) return c
  }
  for (const c of CATEGORIES) {
    if (c === 'Other') continue
    const segment = c.split(' & ')[0].toLowerCase()
    if (segment && hay.includes(segment)) return c
  }
  for (const c of CATEGORIES) {
    if (c === 'Other') continue
    const firstWord = c.toLowerCase().split(' ')[0]
    if (firstWord.length > 3 && hay.includes(firstWord)) return c
  }
  return 'Other'
}
