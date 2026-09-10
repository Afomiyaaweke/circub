// Client-side location helpers: geolocation + reverse geocoding via
// BigDataCloud's free, no-API-key endpoint.
// Falls back to IP-based geolocation (ipapi.co) if browser geolocation
// is denied or unavailable.

export interface ResolvedLocation {
  city: string | null
  country: string | null
  countryCode: string | null
  region: string | null
  lat: number
  lng: number
  source: 'geolocation' | 'manual' | 'ip'
}

export interface Coordinates {
  lat: number
  lng: number
}

/** Get lat/lng from the browser Geolocation API. Resolves null if denied,
 *  unavailable, or timed out. Also returns the error reason for debugging. */
export function getCoordinates(): Promise<{ coords: Coordinates | null; error: string | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ coords: null, error: 'Geolocation API not available' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, error: null }),
      (err) => {
        let reason = 'Unknown error'
        if (err.code === err.PERMISSION_DENIED) reason = 'Permission denied'
        else if (err.code === err.POSITION_UNAVAILABLE) reason = 'Position unavailable'
        else if (err.code === err.TIMEOUT) reason = 'Timeout'
        resolve({ coords: null, error: reason })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    )
  })
}

interface BdcResponse {
  city?: string | null
  locality?: string | null
  principalSubdivision?: string | null
  countryName?: string | null
  countryCode?: string | null
}

/** Reverse-geocode lat/lng to a city/country using BigDataCloud (free, no key). */
export async function reverseGeocode(
  coords: Coordinates
): Promise<ResolvedLocation | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lng}&localityLanguage=en`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as BdcResponse
    return {
      city: data.city || data.locality || null,
      region: data.principalSubdivision || null,
      country: data.countryName || null,
      countryCode: data.countryCode || null,
      lat: coords.lat,
      lng: coords.lng,
      source: 'geolocation',
    }
  } catch {
    return null
  }
}

/** IP-based geolocation fallback using ipapi.co (free, no key, ~10k/day).
 *  Works without any user permission — just uses the request IP. */
async function locateByIp(): Promise<ResolvedLocation | null> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.error) return null
    return {
      city: data.city || null,
      region: data.region || null,
      country: data.country_name || null,
      countryCode: data.country_code || null,
      lat: data.latitude || 0,
      lng: data.longitude || 0,
      source: 'ip',
    }
  } catch {
    return null
  }
}

/** Resolve a full location object.
 *  1. Try browser geolocation (most accurate, requires permission)
 *  2. If denied/unavailable, fall back to IP-based geolocation (no permission needed)
 *  3. If both fail, return null
 */
export async function resolveCurrentLocation(): Promise<ResolvedLocation | null> {
  // Step 1: browser geolocation
  const { coords, error } = await getCoordinates()
  if (coords) {
    const resolved = await reverseGeocode(coords)
    if (resolved) return resolved
  }

  // Step 2: IP-based fallback — works without user permission
  const ipLocation = await locateByIp()
  if (ipLocation) return ipLocation

  // Step 3: both failed
  return null
}

const CURRENCY_BY_COUNTRY_CODE: Record<string, string> = {
  US: 'USD', GB: 'GBP', IN: 'INR', CN: 'CNY', JP: 'JPY', KR: 'KRW',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', IE: 'EUR',
  PT: 'EUR', GR: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR',
  CA: 'CAD', AU: 'AUD', NZD: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY',
  RU: 'RUB', UA: 'UAH', BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP',
  CO: 'COP', ZA: 'ZAR', AE: 'AED', SA: 'SAR', EG: 'EGP', NG: 'NGN',
  TH: 'THB', ID: 'IDR', MY: 'MYR', SG: 'SGD', PH: 'PHP', VN: 'VND',
  HK: 'HKD', TW: 'TWD', ET: 'ETB', KE: 'KES', UG: 'UGX', TZ: 'TZS',
  RW: 'RWF', GH: 'GHS',
}

/** Best-guess currency for a country code. */
export function currencyForCountry(countryCode?: string | null): string {
  if (!countryCode) return 'USD'
  return CURRENCY_BY_COUNTRY_CODE[countryCode.toUpperCase()] || 'USD'
}

const LOCALE_BY_CURRENCY: Record<string, string> = {
  USD: 'en-US', GBP: 'en-GB', EUR: 'en-IE', INR: 'en-IN',
  CNY: 'zh-CN', JPY: 'ja-JP', KRW: 'ko-KR', CAD: 'en-CA',
  AUD: 'en-AU', NZD: 'en-NZ', CHF: 'de-CH', SEK: 'sv-SE',
  NOK: 'nb-NO', DKK: 'da-DK', PLN: 'pl-PL', CZK: 'cs-CZ',
  HUF: 'hu-HU', RON: 'ro-RO', TRY: 'tr-TR', RUB: 'ru-RU',
  UAH: 'uk-UA', BRL: 'pt-BR', MXN: 'es-MX', ARS: 'es-AR',
  CLP: 'es-CL', COP: 'es-CO', ZAR: 'en-ZA', AED: 'ar-AE',
  SAR: 'ar-SA', EGP: 'ar-EG', NGN: 'en-NG', THB: 'th-TH',
  IDR: 'id-ID', MYR: 'ms-MY', SGD: 'en-SG', PHP: 'en-PH',
  VND: 'vi-VN', HKD: 'zh-HK', TWD: 'zh-TW', ETB: 'en-ET',
  KES: 'en-KE', UGX: 'en-UG', TZS: 'en-TZ', RWF: 'en-RW',
  GHS: 'en-GH',
}

/** Format a number as a price string in the given currency. */
export function formatPrice(
  value: number | null,
  currency: string | null
): string | null {
  if (value === null || value === undefined || Number.isNaN(value))
    return null
  const cur = currency || 'USD'
  const locale = LOCALE_BY_CURRENCY[cur] || 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: cur === 'VND' || cur === 'IDR' ? 0 : 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${cur}`
  }
}

export function formatPriceRange(
  low: number | null,
  high: number | null,
  currency: string | null
): string {
  const fLow = formatPrice(low, currency)
  const fHigh = formatPrice(high, currency)
  if (fLow && fHigh) {
    if (fLow === fHigh) return fLow
    return `${fLow} \u2013 ${fHigh}`
  }
  if (fLow) return `from ${fLow}`
  if (fHigh) return `up to ${fHigh}`
  return 'Price unavailable'
}
