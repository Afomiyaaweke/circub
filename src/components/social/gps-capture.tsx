'use client'

import { useState } from 'react'
import { Navigation, X, Loader2, MapPin } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { getCoordinates, formatGps, reverseGeocode } from '@/lib/location'

interface GpsCaptureProps {
  lat: number | null
  lng: number | null
  onChange: (lat: number | null, lng: number | null) => void
  /** v123: fired after the pin is captured AND reverse geocoding resolved a
   *  place - the composers auto-fill their single "City, Country" input
   *  with it so nobody has to type their location by hand. */
  onPlaceResolved?: (place: { city: string | null; country: string | null }) => void
}

/**
 * GPS capture for the price-post composers (create + edit).
 *
 * One tap reads the device GPS (high accuracy, via the shared
 * getCoordinates() helper), shows the captured coordinates, and lets the
 * author clear them again. The stored pin is what powers the one-tap
 * "Directions" link tourists see on the price card / detail view.
 * The coordinates are also reverse-geocoded (BigDataCloud, free, no key)
 * and the resolved "City, Country" is handed to the composer through
 * onPlaceResolved so the location input fills itself.
 */
export function GpsCapture({ lat, lng, onChange, onPlaceResolved }: GpsCaptureProps) {
  const [capturing, setCapturing] = useState(false)
  const { toast } = useToast()
  const hasGps = lat != null && lng != null

  const capture = async () => {
    setCapturing(true)
    try {
      const { coords, error } = await getCoordinates()
      if (coords) {
        onChange(coords.lat, coords.lng)
        // v123: turn the raw pin into a place and fill the location input.
        // A failed lookup is non-fatal - the pin itself is already saved.
        const place = await reverseGeocode(coords)
        const placeLine = place
          ? [place.city, place.country].filter(Boolean).join(', ')
          : ''
        if (place && placeLine && onPlaceResolved) {
          onPlaceResolved({ city: place.city, country: place.country })
          toast({
            title: 'Location captured and filled',
            description: `${placeLine} - travelers get directions straight to this spot.`,
          })
        } else {
          toast({
            title: 'GPS location captured',
            description: `${formatGps(coords.lat, coords.lng)} - travelers will get directions straight to this spot.`,
          })
        }
      } else {
        toast({
          title: 'Could not read GPS',
          description: error || 'Try again outdoors, or add the location as text below the map link.',
          variant: 'destructive',
        })
      }
    } finally {
      setCapturing(false)
    }
  }

  if (hasGps) {
    return (
      <div
        data-testid="gps-capture-set"
        className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
      >
        <Navigation className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p data-testid="gps-capture-coords" className="truncate text-xs font-semibold text-foreground">
            GPS pin: {formatGps(lat, lng)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Pin set - the City, Country input was filled automatically
          </p>
        </div>
        <button
          type="button"
          data-testid="gps-capture-clear"
          onClick={() => onChange(null, null)}
          aria-label="Remove GPS pin"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      data-testid="gps-capture-button"
      onClick={capture}
      disabled={capturing}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
    >
      {capturing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Reading GPS…
        </>
      ) : (
        <>
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Use my current location (GPS)
        </>
      )}
    </button>
  )
}
