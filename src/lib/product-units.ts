// v122: shared marketplace pickers for the unified price composer.
// One list of measuring units + one list of pack sizes used by the price
// composer (and the legacy add-product form) so the two flows can never
// drift apart again.

// 'each' stores as '' (no unit suffix): the price is simply the price of
// one item. Every other value renders as "50 / kg"-style suffixes through
// formatUnitSuffix().
export const MEASURE_UNITS: { value: string; label: string }[] = [
  { value: 'each', label: 'each (no unit)' },
  { value: 'kg', label: 'per kg' },
  { value: 'g', label: 'per gram' },
  { value: 'L', label: 'per litre' },
  { value: 'ml', label: 'per ml' },
  { value: 'lb', label: 'per pound' },
  { value: 'ton', label: 'per ton' },
  { value: 'piece', label: 'per piece' },
  { value: 'dozen', label: 'per dozen' },
  { value: 'pack', label: 'per pack' },
  { value: 'bag', label: 'per bag' },
  { value: 'crate', label: 'per crate' },
  { value: 'bunch', label: 'per bunch' },
  { value: 'metre', label: 'per metre' },
]

// Pack size options for a product listing ('' = not set).
export const QUANTITY_OPTIONS: string[] = [
  '100 g',
  '250 g',
  '500 g',
  '1 kg',
  '5 kg',
  '10 kg',
  '1 dozen',
  '1 piece',
]
