// The ONE canonical category list for every category surface in circub:
// the price-post picker, the product picker, the edit modal and both filter
// dropdowns all render THIS array. Full flat alphabetical list (user's
// spec, verbatim) - no grouping, no headers, 'Other' kept last so it reads
// as the catch-all rather than a letter of the alphabet.
// v182: the stored value is still this canonical SUB category - only the
// MAIN grouping above it changed (see CATEGORY_GROUPS).
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

// v182: SEVEN main categories, exactly as the user asked ('make the
// categories one and subcategories one like food drug material wearable
// property - that but 7, and have subcategory'). The user named five of the
// seven (Food, Drug, Material, Wearable, Property); Electronics and
// Services complete the set. EVERY canonical sub category above lives in
// EXACTLY ONE main, so the stored value, the legacy aliases, the /similar
// category tables and the compare strips all keep working unchanged - the
// stored post value is and stays the SUB; the main is derived from it.
export const CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  { group: 'Food', items: ['Food & Groceries', 'Bakery & Sweets', 'Restaurants', 'Coffee & Cafés'] },
  { group: 'Drug & Health', items: ['Pharmacy & Drug Store', 'Hospitals & Clinics', 'Biomedical & Medical Supplies', 'Beauty & Personal Care', 'Fitness & Wellness Centers'] },
  { group: 'Materials', items: ['Construction & Home Repair', 'Textiles & Fabrics', 'Agriculture & Farming', 'Handicrafts', 'Pet Supplies'] },
  { group: 'Wearables', items: ['Clothing & Apparel', 'Jewelry & Accessories', 'Sports & Fitness Gear', 'Baby & Kids Products'] },
  { group: 'Property', items: ['Real Estate', 'Accommodation', 'Furniture & Home Decor', 'Movers & Relocation'] },
  { group: 'Electronics', items: ['Electronics', 'Books & Stationery'] },
  { group: 'Services', items: ['Services', 'Education & Tutoring', 'Legal & Financial Services', 'Events & Entertainment', 'Transportation', 'Automotive', 'Other'] },
]

// The main category a canonical sub belongs to. Unknown values (legacy
// strings that predate the canonical list) fall back to Services, the
// catch-all main that hosts 'Other', so the picker always renders a valid
// main -> sub pair.
export function groupOfCategory(category: string): string {
  for (const g of CATEGORY_GROUPS) if (g.items.includes(category)) return g.group
  return 'Services'
}

// The subcategories of a main category.
export function subcategoriesOf(group: string): string[] {
  return CATEGORY_GROUPS.find((g) => g.group === group)?.items || ['Other']
}

// The filter-only option shown at the top of category filter dropdowns.
// Kept here so the value string has a single source of truth (the APIs
// compare against it to mean "no filter").
export const ALL_CATEGORIES = 'All categories'

/**
 * v182: every value a category filter query must match. Filtering by a MAIN
 * category name (e.g. 'Food') expands to ALL of its subs; filtering by a
 * canonical sub matches itself plus its legacy aliases, so old posts stay
 * visible either way. The API routes pass the result straight into
 * Prisma's `{ in: ... }`.
 */
export function expandCategoryFilter(category: string): string[] {
  const values = new Set<string>([category])
  const group = CATEGORY_GROUPS.find((g) => g.group === category)
  if (group) {
    for (const sub of group.items) {
      values.add(sub)
      for (const a of CATEGORY_ALIASES[sub] || []) values.add(a)
    }
  }
  for (const a of CATEGORY_ALIASES[category] || []) values.add(a)
  return Array.from(values)
}

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
