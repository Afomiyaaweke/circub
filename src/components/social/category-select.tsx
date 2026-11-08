'use client'

// CATEGORY PICKER (v175): the user picks the main point, then the sub point.
// The stored value stays the canonical category string, so filters, legacy
// aliases and the compare tables keep working unchanged.
//
// v247 CATEGORY ONLY (user: "remove this make it category only"): the v246
// creative section - the icon-tile grid over subcategory chips - is GONE,
// together with the quick-search chip row that sat above it. The picker is
// now ONE flat wrap of every canonical category as a chip: tap a chip, that
// is the whole choice. Nothing grouped, nothing nested. The historic
// testids survive: the wrap keeps data-testid="category-select" (it holds
// the value) and the section keeps data-testid="category-section"; each
// chip carries data-testid="category-chip" for the probes.
import { CATEGORIES } from '@/lib/categories'
import { cn } from '@/lib/utils'

interface CategorySelectProps {
  value: string
  onChange: (v: string) => void
  // Kept for the four callers that still pass them - the flat list has no
  // main/sub split anymore, so they are accepted and ignored.
  mainTestid?: string
  subTestid?: string
  triggerClassName?: string
}

export function CategorySelect({
  value,
  onChange,
  subTestid = 'category-select',
  triggerClassName,
}: CategorySelectProps) {
  return (
    <div className={cn('space-y-2', triggerClassName)} data-testid="category-section">
      <div className="flex flex-wrap gap-1.5" data-testid={subTestid} role="group" aria-label="Category">
        {CATEGORIES.map((c) => {
          const on = c === value
          return (
            <button
              type="button"
              key={c}
              data-testid="category-chip"
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
