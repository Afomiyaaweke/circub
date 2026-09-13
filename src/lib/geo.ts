// geo.ts — lightweight distance helpers for the guide "near me" feature.
//
// Guides store `location` as free text ("Addis Ababa, Ethiopia"). Instead of
// adding lat/lng columns to the schema (migration risk on prod), we resolve
// that text against a static city-coordinate table. Good enough for sorting
// guides by distance; precision to the nearest ~20km is plenty for "who is
// closest to me".

export interface Coords {
  lat: number
  lng: number
}

// ---------------------------------------------------------------------------
// City coordinate table: Ethiopia (deep) + major tourist cities worldwide.
// Keys are lowercase; lookup does substring matching in BOTH directions so
// "Addis Ababa, Ethiopia", "addis" and "Bahir Dar · Ethiopia" all resolve.
// ---------------------------------------------------------------------------
export const CITY_COORDS: Record<string, Coords> = {
  // Ethiopia
  'addis ababa': { lat: 9.03, lng: 38.74 },
  'addis': { lat: 9.03, lng: 38.74 },
  'bole': { lat: 8.98, lng: 38.79 },
  'lalibela': { lat: 12.03, lng: 39.04 },
  'gondar': { lat: 12.6, lng: 37.47 },
  'bahir dar': { lat: 11.59, lng: 37.39 },
  'bahar dar': { lat: 11.59, lng: 37.39 },
  'mekelle': { lat: 13.5, lng: 39.48 },
  'mekele': { lat: 13.5, lng: 39.48 },
  'axum': { lat: 14.12, lng: 38.73 },
  'aksum': { lat: 14.12, lng: 38.73 },
  'jimma': { lat: 7.67, lng: 36.84 },
  'hawassa': { lat: 7.06, lng: 38.47 },
  'awassa': { lat: 7.06, lng: 38.47 },
  'dire dawa': { lat: 9.59, lng: 41.86 },
  'adama': { lat: 8.54, lng: 39.27 },
  'nazret': { lat: 8.54, lng: 39.27 },
  'arba minch': { lat: 6.03, lng: 37.56 },
  'harar': { lat: 9.31, lng: 42.12 },
  'harari': { lat: 9.31, lng: 42.12 },
  'dessie': { lat: 11.13, lng: 39.63 },
  'debre markos': { lat: 10.35, lng: 37.73 },
  'nekemte': { lat: 9.09, lng: 36.55 },
  'goba': { lat: 7.02, lng: 39.98 },
  'bale': { lat: 7.02, lng: 39.98 },
  'robe': { lat: 7.12, lng: 40.0 },
  'jinka': { lat: 5.65, lng: 36.18 },
  'omo': { lat: 5.65, lng: 36.18 },
  'turmi': { lat: 4.97, lng: 36.48 },
  'dassenech': { lat: 4.97, lng: 36.48 },
  'sembel': { lat: 15.34, lng: 38.93 },
  'asmera': { lat: 15.34, lng: 38.93 },
  'danakil': { lat: 14.24, lng: 40.3 },
  'dafur': { lat: 14.24, lng: 40.3 },
  'simien': { lat: 13.19, lng: 38.06 },
  'debark': { lat: 13.15, lng: 38.08 },
  'adama university': { lat: 8.54, lng: 39.27 },
  'debre zeit': { lat: 8.75, lng: 39.02 },
  'bishoftu': { lat: 8.75, lng: 39.02 },
  'woldia': { lat: 11.83, lng: 39.6 },
  'gambela': { lat: 8.25, lng: 34.59 },
  'assosa': { lat: 10.07, lng: 34.53 },
  'semera': { lat: 11.79, lng: 41.0 },
  'afar': { lat: 11.79, lng: 41.0 },
  'tiya': { lat: 8.43, lng: 38.72 },
  'melka kunture': { lat: 8.63, lng: 38.75 },
  'aden': { lat: 12.79, lng: 45.03 },

  // Africa
  'nairobi': { lat: -1.29, lng: 36.82 },
  'mombasa': { lat: -4.04, lng: 39.67 },
  'zanzibar': { lat: -6.16, lng: 39.19 },
  'stone town': { lat: -6.16, lng: 39.19 },
  'dar es salaam': { lat: -6.79, lng: 39.21 },
  'arusha': { lat: -3.39, lng: 36.68 },
  'kilimanjaro': { lat: -3.07, lng: 37.35 },
  'serengeti': { lat: -2.33, lng: 34.83 },
  'kampala': { lat: 0.35, lng: 32.58 },
  'kigali': { lat: -1.94, lng: 30.06 },
  'cairo': { lat: 30.04, lng: 31.24 },
  'luxor': { lat: 25.69, lng: 32.64 },
  'aswan': { lat: 24.09, lng: 32.9 },
  'marrakech': { lat: 31.63, lng: -7.99 },
  'casablanca': { lat: 33.57, lng: -7.59 },
  'cape town': { lat: -33.92, lng: 18.42 },
  'johannesburg': { lat: -26.2, lng: 28.05 },
  'dakar': { lat: 14.72, lng: -17.47 },
  'accra': { lat: 5.6, lng: -0.19 },
  'lagos': { lat: 6.52, lng: 3.38 },
  'victoria falls': { lat: -17.92, lng: 25.86 },

  // Middle East / Europe / Asia / Americas
  'istanbul': { lat: 41.01, lng: 28.98 },
  'cappadocia': { lat: 38.64, lng: 34.83 },
  'dubai': { lat: 25.2, lng: 55.27 },
  'abu dhabi': { lat: 24.45, lng: 54.38 },
  'doha': { lat: 25.29, lng: 51.53 },
  'petra': { lat: 30.33, lng: 35.44 },
  'jerusalem': { lat: 31.77, lng: 35.21 },
  'paris': { lat: 48.86, lng: 2.35 },
  'rome': { lat: 41.9, lng: 12.5 },
  'venice': { lat: 45.44, lng: 12.32 },
  'barcelona': { lat: 41.39, lng: 2.17 },
  'madrid': { lat: 40.42, lng: -3.7 },
  'lisbon': { lat: 38.72, lng: -9.14 },
  'london': { lat: 51.51, lng: -0.13 },
  'amsterdam': { lat: 52.37, lng: 4.9 },
  'berlin': { lat: 52.52, lng: 13.4 },
  'prague': { lat: 50.08, lng: 14.44 },
  'athens': { lat: 37.98, lng: 23.73 },
  'moscow': { lat: 55.76, lng: 37.62 },
  'delhi': { lat: 28.61, lng: 77.21 },
  'mumbai': { lat: 19.08, lng: 72.88 },
  'jaipur': { lat: 26.91, lng: 75.79 },
  'kathmandu': { lat: 27.72, lng: 85.32 },
  'bangkok': { lat: 13.76, lng: 100.5 },
  'chiang mai': { lat: 18.79, lng: 98.98 },
  'singapore': { lat: 1.35, lng: 103.82 },
  'bali': { lat: -8.34, lng: 115.09 },
  'ubud': { lat: -8.51, lng: 115.26 },
  'kuala lumpur': { lat: 3.14, lng: 101.69 },
  'hong kong': { lat: 22.32, lng: 114.17 },
  'tokyo': { lat: 35.68, lng: 139.69 },
  'kyoto': { lat: 35.01, lng: 135.77 },
  'seoul': { lat: 37.57, lng: 126.98 },
  'beijing': { lat: 39.9, lng: 116.41 },
  'shanghai': { lat: 31.23, lng: 121.47 },
  'new york': { lat: 40.71, lng: -74.01 },
  'boston': { lat: 42.36, lng: -71.06 },
  'washington': { lat: 38.91, lng: -77.04 },
  'miami': { lat: 25.76, lng: -80.19 },
  'los angeles': { lat: 34.05, lng: -118.24 },
  'san francisco': { lat: 37.77, lng: -122.42 },
  'chicago': { lat: 41.88, lng: -87.63 },
  'toronto': { lat: 43.65, lng: -79.38 },
  'vancouver': { lat: 49.28, lng: -123.12 },
  'mexico city': { lat: 19.43, lng: -99.13 },
  'cancun': { lat: 21.16, lng: -86.85 },
  'cusco': { lat: -13.53, lng: -71.97 },
  'machu picchu': { lat: -13.16, lng: -72.55 },
  'lima': { lat: -12.05, lng: -77.04 },
  'buenos aires': { lat: -34.6, lng: -58.38 },
  'rio de janeiro': { lat: -22.91, lng: -43.17 },
  'sao paulo': { lat: -23.55, lng: -46.63 },
  'sydney': { lat: -33.87, lng: 151.21 },
  'melbourne': { lat: -37.81, lng: 144.96 },
  'auckland': { lat: -36.85, lng: 174.76 },
}

const CITY_KEYS = Object.keys(CITY_COORDS)

/** Great-circle distance in km (haversine). */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Resolve free-text location ("Gondar, Ethiopia") to coords via the table. */
export function lookupCoords(locationText?: string | null): Coords | null {
  if (!locationText) return null
  const t = locationText.toLowerCase()
  // Direct substring: city key appears in the text ("bahir dar, ethiopia").
  let best: { key: string; len: number } | null = null
  for (const key of CITY_KEYS) {
    if (t.includes(key) && (!best || key.length > best.len)) {
      best = { key, len: key.length }
    }
  }
  if (best) return CITY_COORDS[best.key]
  // Reverse: text token is a key prefix ("addis" alone already handled above;
  // this catches compound names like "gondarcity").
  for (const key of CITY_KEYS) {
    if (key.length >= 5 && (t.startsWith(key.slice(0, 6)) || key.startsWith(t))) {
      return CITY_COORDS[key]
    }
  }
  return null
}

/** Distance from user coords to a guide's free-text location, or null. */
export function guideDistanceKm(user: Coords, locationText?: string | null): number | null {
  const c = lookupCoords(locationText)
  if (!c) return null
  return Math.round(haversineKm(user, c))
}
