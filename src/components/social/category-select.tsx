'use client'

// CATEGORY PICKER (v175): main category first, then the subcategory inside
// it - the user picks the main point, then the sub point. The stored value
// stays the canonical category string, so filters, legacy aliases and the
// compare tables keep working unchanged. The SUB select keeps the historic
// data-testid="category-select" (it holds the value); the MAIN select gets
// its own testid so probes can target each level.
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CATEGORY_GROUPS, groupOfCategory, subcategoriesOf } from '@/lib/categories'

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
  triggerClassName = 'w-full',
}: CategorySelectProps) {
  const main = groupOfCategory(value)
  const subs = subcategoriesOf(main)
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select value={main} onValueChange={(g) => onChange(subcategoriesOf(g)[0])}>
        <SelectTrigger className={triggerClassName} data-testid={mainTestid} aria-label="Main category">
          <SelectValue placeholder="Main category" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_GROUPS.map((g) => (
            <SelectItem key={g.group} value={g.group}>
              {g.group}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={subs.includes(value) ? value : subs[0]} onValueChange={onChange}>
        <SelectTrigger className={triggerClassName} data-testid={subTestid} aria-label="Subcategory">
          <SelectValue placeholder="Subcategory" />
        </SelectTrigger>
        <SelectContent>
          {subs.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
