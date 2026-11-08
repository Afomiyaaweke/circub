'use client'

// CATEGORY PICKER (v175): main category first, then the subcategory inside
// it - the user picks the main point, then the sub point. The stored value
// stays the canonical category string, so filters, legacy aliases and the
// compare tables keep working unchanged.
//
// v246 CREATIVE CATEGORY SECTION (user: "have creative category section"):
// the two stacked dropdowns are gone. The MAIN category is now a grid of
// icon tiles (emoji + label, tap to switch), and the SUBS render as a wrap
// of chips under it - the whole section is visible and one-tap, no hidden
// dropdown menus on a phone. The historic testids survive: the SUB group
// keeps data-testid="category-select" (it holds the value), the MAIN tile
// grid keeps data-testid="category-select-main", and each tile/chip carries
// its own testid for probes.
import { CATEGORY_GROUPS, CATEGORY_GROUP_ICONS, groupOfCategory, subcategoriesOf } from '@/lib/categories'
import { cn } from '@/lib/utils'

interface CategorySelectProps {
  value: string
  onChange: (v: string) => void
  mainTestid?: string
  subTestid?: string
  triggerClassName?: string
}

export function CategorySelect({
  value,
  onChange,
  mainTestid = 'category-select-main',
  subTestid = 'category-select',
  triggerClassName,
}: CategorySelectProps) {
  const main = groupOfCategory(value)
  const subs = subcategoriesOf(main)
  return (
    <div className={cn('space-y-2', triggerClassName)} data-testid="category-section">
      {/* Main categories - icon tiles. The selected one wears the filled
          pill so the choice reads instantly on a small screen. */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" data-testid={mainTestid} role="group" aria-label="Main category">
        {CATEGORY_GROUPS.map((g) => {
          const on = g.group === main
          return (
            <button
              type="button"
              key={g.group}
              data-testid="category-main-tile"
              aria-pressed={on}
              onClick={() => onChange(subcategoriesOf(g.group)[0])}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 text-center transition-colors cursor-pointer',
                on
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-accent/50',
              )}
            >
              <span className="text-lg leading-none" aria-hidden>{CATEGORY_GROUP_ICONS[g.group] || '🏷️'}</span>
              <span className={cn('text-[10px] leading-tight font-medium', on ? 'text-primary font-bold' : 'text-muted-foreground')}>
                {g.group}
              </span>
            </button>
          )
        })}
      </div>
      {/* Subcategories - chips of the chosen main. The active chip is the
          filled one; this group holds the stored canonical value. */}
      <div className="flex flex-wrap gap-1.5" data-testid={subTestid} role="group" aria-label="Subcategory">
        {subs.map((c) => {
          const on = c === value
          return (
            <button
              type="button"
              key={c}
              data-testid="category-sub-chip"
              aria-pressed={on}
              onClick={() => onChange(c)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                on
                  ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/40',
              )}
            >
              {c}
            </button>
          )
        })}
      </div>
    </div>
  )
}
