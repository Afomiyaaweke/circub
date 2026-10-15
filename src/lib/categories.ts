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

// v175: the two-level picker - the user picks a MAIN category (the group)
// first, then the SUB category (the canonical value every surface stores,
// filters and compares on). Every canonical category above lives in EXACTLY
// ONE group, so the stored value, the flat filter dropdowns, the legacy
// aliases and the /similar category tables all keep working unchanged -
// only the choosing UX gains the main -> sub step.
export const CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Food & Drink', items: ['Food & Groceries', 'Bakery & Sweets', 'Restaurants', 'Coffee & Cafés'] },
  { group: 'Shopping', items: ['Clothing & Apparel', 'Electronics', 'Jewelry & Accessories', 'Baby & Kids Products', 'Pet Supplies', 'Sports & Fitness Gear', 'Books & Stationery', 'Handicrafts', 'Furniture & Home Decor', 'Textiles & Fabrics'] },
  { group: 'Health & Beauty', items: ['Beauty & Personal Care', 'Fitness & Wellness Centers', 'Pharmacy & Drug Store', 'Hospitals & Clinics', 'Biomedical & Medical Supplies'] },
  { group: 'Home & Property', items: ['Accommodation', 'Real Estate', 'Construction & Home Repair', 'Movers & Relocation'] },
  { group: 'Services', items: ['Services', 'Education & Tutoring', 'Legal & Financial Services', 'Events & Entertainment'] },
  { group: 'Transport & Farming', items: ['Transportation', 'Automotive', 'Agriculture & Farming'] },
  { group: 'Other', items: ['Other'] },
]

// The main category a canonical sub belongs to. Unknown values (legacy
// strings that predate the canonical list) fall back to the Other group so
// the picker always renders a valid pair.
export function groupOfCategory(category: string): string {
  for (const g of CATEGORY_GROUPS) if (g.items.includes(category)) return g.group
  return 'Other'
}

// The subcategories of a main category.
export function subcategoriesOf(group: string): string[] {
  return CATEGORY_GROUPS.find((g) => g.group === group)?.items || ['Other']
}

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
