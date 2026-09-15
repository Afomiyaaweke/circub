'use client'

/**
 * Picture → identification + price comparison for the add-product /
 * post-price forms.
 *
 * When a user attaches a photo while adding a product, we send it to the
 * same pipeline the camera search uses (/api/visual-search): AI identifies
 * the product, matching price posts are pulled from the feed and ranked by
 * the location typed in the form. The form then shows a compact
 * "similar posts" comparison BEFORE publishing, and can pre-fill empty
 * fields (name, description, price range) from the result.
 *
 * The caller is responsible for compressing the file first (compressImage)
 * — pass the compressed File/Blob here so it can be uploaded AND identified
 * without compressing twice.
 */

export interface IdentifyLocalMatch {
  id: string
  productName: string
  category: string
  currency: string
  priceMin: number
  priceMax: number
  recommendedPrice: number | null
  city: string | null
  country: string
  helpfulCount: number
  locMatch: string
  author: { id: string; name: string }
}

export interface IdentifyCompareResult {
  identified: boolean
  searchTerm: string
  aiDescription: string | null
  aiPriceEstimate: { min: number; max: number; currency: string } | null
  localMatches: IdentifyLocalMatch[]
  locationCompare: {
    scope: string
    place: string
    count: number
    min: number
    max: number
    currency: string
  } | null
}

export async function identifyPhoto(
  file: File | Blob,
  loc?: { city?: string | null; country?: string | null }
): Promise<IdentifyCompareResult> {
  const fd = new FormData()
  fd.append('file', file)
  if (loc && (loc.city || loc.country)) {
    fd.append(
      'location',
      JSON.stringify({ city: loc.city || null, country: loc.country || null })
    )
  }
  const res = await fetch('/api/visual-search', { method: 'POST', body: fd })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Could not identify the product.')
  }
  const data = await res.json()
  return {
    identified: !!data.identified,
    searchTerm: typeof data.searchTerm === 'string' ? data.searchTerm : '',
    aiDescription: typeof data.aiDescription === 'string' && data.aiDescription ? data.aiDescription : null,
    aiPriceEstimate: data.aiPriceEstimate || null,
    localMatches: Array.isArray(data.localMatches) ? data.localMatches : [],
    locationCompare: data.locationCompare || null,
  }
}

/** First category from `categories` mentioned in the free-text hint, if any. */
export function matchCategory(hint: string, categories: string[]): string | null {
  const hay = (hint || '').toLowerCase()
  if (!hay) return null
  const hit = categories.find((c) => c !== 'Other' && hay.includes(c.toLowerCase()))
  return hit || null
}
