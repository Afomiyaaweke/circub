// Client-side location helpers: device GPS + reverse geocoding.
// Falls back to IP-based geolocation if browser geolocation is denied.

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

/** Get lat/lng from the device's GPS / Geolocation API. */
export function getCoordinates(): Promise<{ coords: Coordinates | null; error: string | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ coords: null, error: 'Geolocation API not available' })
      return
    }

    let settled = false
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true
        resolve({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, error: null })
      },
      (err) => {
        if (settled) return
        settled = true
        let reason = 'Unknown error'
        if (err.code === err.PERMISSION_DENIED) reason = 'Permission denied'
        else if (err.code === err.POSITION_UNAVAILABLE) reason = 'Position unavailable'
        else if (err.code === err.TIMEOUT) reason = 'Timeout'
        resolve({ coords: null, error: reason })
      },
      options
    )

    setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ coords: null, error: 'Timed out' })
      }
    }, 16000)
  })
}

interface NominatimResponse {
  address?: {
    city?: string
    town?: string
    village?: string
    hamlet?: string
    state?: string
    region?: string
    country?: string
    country_code?: string
  }
}

/** Reverse-geocode using OpenStreetMap Nominatim (free, no key, no ban). */
export async function reverseGeocode(
  coords: Coordinates
): Promise<ResolvedLocation | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&addressdetails=1&zoom=10`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as NominatimResponse
    const addr = data.address
    if (!addr) return null
    return {
      city: addr.city || addr.town || addr.village || addr.hamlet || null,
      region: addr.state || addr.region || null,
      country: addr.country || null,
      countryCode: addr.country_code ? addr.country_code.toUpperCase() : null,
      lat: coords.lat,
      lng: coords.lng,
      source: 'geolocation',
    }
  } catch {
    return null
  }
}

/** IP-based geolocation using ipinfo.io (free, 50k/month, no key). */
async function locateByIpInfo(): Promise<ResolvedLocation | null> {
  try {
    const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.error) return null
    const [lat, lng] = (data.loc || '0,0').split(',').map(Number)
    return {
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      countryCode: data.country || null,
      lat: lat || 0,
      lng: lng || 0,
      source: 'ip',
    }
  } catch {
    return null
  }
}

/** Resolve a full location object.
 *  1. Device GPS (enableHighAccuracy: true)
 *  2. IP-based fallback (ipinfo.io)
 *  3. If both fail, return null
 */
export async function resolveCurrentLocation(): Promise<ResolvedLocation | null> {
  const { coords } = await getCoordinates()
  if (coords) {
    const resolved = await reverseGeocode(coords)
    if (resolved) return resolved
  }

  const ipLocation = await locateByIpInfo()
  if (ipLocation) return ipLocation

  return null
}

// ---- Currency helpers ----

const CURRENCY_BY_COUNTRY_CODE: Record<string, string> = {
  US: 'USD', GB: 'GBP', IN: 'INR', CN: 'CNY', JP: 'JPY', KR: 'KRW',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', IE: 'EUR',
  PT: 'EUR', GR: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY',
  RU: 'RUB', UA: 'UAH', BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP',
  CO: 'COP', ZA: 'ZAR', AE: 'AED', SA: 'SAR', EG: 'EGP', NG: 'NGN',
  TH: 'THB', ID: 'IDR', MY: 'MYR', SG: 'SGD', PH: 'PHP', VN: 'VND',
  HK: 'HKD', TW: 'TWD', ET: 'ETB', KE: 'KES', UG: 'UGX', TZ: 'TZS',
  RW: 'RWF', GH: 'GHS', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  MM: 'MMK', KH: 'KHR', LA: 'LAK', NG: 'NGN', MA: 'MAD', DZ: 'DZD',
  TN: 'TND', SN: 'XOF', CI: 'XOF', CM: 'XAF', AO: 'AOA', MZ: 'MZN',
  SD: 'SDG', LY: 'LYD', JO: 'JOD', LB: 'LBP', IQ: 'IQD', IR: 'IRR',
  AF: 'AFN', PK: 'PKR',
}

/** Best-guess currency symbol for a country code.
 *  Returns the ISO currency code (e.g. 'ETB' for Ethiopia, 'USD' for USA). */
export function currencyForCountry(countryCode?: string | null): string {
  if (!countryCode) return 'USD'
  return CURRENCY_BY_COUNTRY_CODE[countryCode.toUpperCase()] || 'USD'
}

/** Map a country name to its currency code (handles full country names). */
const CURRENCY_BY_COUNTRY_NAME: Record<string, string> = {
  'united states': 'USD', 'united states of america': 'USD', america: 'USD',
  'united kingdom': 'GBP', 'england': 'GBP',
  ethiopia: 'ETB', kenya: 'KES', uganda: 'UGX', tanzania: 'TZS',
  rwanda: 'RWF', ghana: 'GHS', nigeria: 'NGN', egypt: 'EGP',
  'south africa': 'ZAR', morocco: 'MAD', algeria: 'DZD', tunisia: 'TND',
  india: 'INR', pakistan: 'PKR', bangladesh: 'BDT', 'sri lanka': 'LKR',
  china: 'CNY', japan: 'JPY', 'south korea': 'KRW', thailand: 'THB',
  indonesia: 'IDR', malaysia: 'MYR', singapore: 'SGD', philippines: 'PHP',
  vietnam: 'VND', 'saudi arabia': 'SAR', 'united arab emirates': 'AED',
  qatar: 'QAR', kuwait: 'KWD', israel: 'ILS', turkey: 'TRY',
  germany: 'EUR', france: 'EUR', italy: 'EUR', spain: 'EUR',
  netherlands: 'EUR', belgium: 'EUR', austria: 'EUR', ireland: 'EUR',
  portugal: 'EUR', greece: 'EUR', finland: 'EUR',
  canada: 'CAD', australia: 'AUD', 'new zealand': 'NZD',
  switzerland: 'CHF', sweden: 'SEK', norway: 'NOK', denmark: 'DKK',
  brazil: 'BRL', argentina: 'ARS', mexico: 'MXN', colombia: 'COP',
  chile: 'CLP', peru: 'PEN',
}

/** Get currency code from either a country code (ISO 2) or country name. */
export function currencyForLocation(country?: string | null, countryCode?: string | null): string {
  if (countryCode) {
    const c = CURRENCY_BY_COUNTRY_CODE[countryCode.toUpperCase()]
    if (c) return c
  }
  if (country) {
    const c = CURRENCY_BY_COUNTRY_NAME[country.toLowerCase()]
    if (c) return c
  }
  return 'USD'
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
  GHS: 'en-GH', PKR: 'en-PK', BDT: 'en-BD', LKR: 'en-LK',
  NPR: 'en-NP', MMK: 'en-MM', KHR: 'en-KH', LAK: 'en-LA',
  MAD: 'ar-MA', DZD: 'ar-DZ', TND: 'ar-TN',
  PEN: 'es-PE', QAR: 'ar-QA', KWD: 'ar-KW', ILS: 'he-IL',
  JOD: 'ar-JO', LBP: 'ar-LB', IQD: 'ar-IQ', IRR: 'fa-IR',
  AFN: 'fa-AF', SDG: 'ar-SD', LYD: 'ar-LY',
  XOF: 'fr-SN', XAF: 'fr-CM', AOA: 'pt-AO', MZN: 'pt-MZ',
}

/** Format a number as a localized price string with the right currency symbol.
 *  e.g. formatPrice(1500, 'ETB') → "ETB 1,500.00"
 *       formatPrice(15.99, 'USD') → "$15.99"
 */
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
      maximumFractionDigits: cur === 'VND' || cur === 'IDR' || cur === 'UGX' || cur === 'TZS' ? 0 : 2,
    }).format(value)
  } catch {
    return `${cur} ${value.toFixed(2)}`
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
