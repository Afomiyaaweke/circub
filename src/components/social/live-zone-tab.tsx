'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Compass, MapPin, Languages, Award, DollarSign, Star, BadgeCheck, MessageSquare, Radio, UserCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { User } from '@/lib/types'

interface LiveZoneTabProps {
  me: User | null
  onMessage: (userId: string) => void
  onBecomeGuide: () => void
  onToggleAvailability: () => void
}

export function LiveZoneTab({ me, onMessage, onBecomeGuide, onToggleAvailability }: LiveZoneTabProps) {
  const [guides, setGuides] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)

  const fetchGuides = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (language) params.set('language', language)
      if (specialty) params.set('specialty', specialty)
      if (availableOnly) params.set('available', 'true')
      const res = await fetch(`/api/guides?${params.toString()}`)
      const data = await res.json()
      setGuides(data.guides || [])
    } catch { setGuides([]) } finally { setLoading(false) }
  }, [search, language, specialty, availableOnly])

  useEffect(() => {
    const t = setTimeout(fetchGuides, 250)
    return () => clearTimeout(t)
  }, [fetchGuides])

  const isGuide = me?.isGuide
  const isAvailable = (me as any)?.guideAvailable

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-lg font-bold text-foreground truncate">Live Zone</h2>
              {guides.length > 0 && (
                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                  {guides.length} guide{guides.length !== 1 && 's'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Find registered tour guides from the local community. Message them directly to book a tour.
            </p>
          </div>
          {!isGuide ? (
            <Button onClick={onBecomeGuide} className="bg-primary hover:bg-primary/90 gap-1.5 shrink-0">
              <Compass className="w-4 h-4" />
              Become a guide
            </Button>
          ) : (
            <Button
              onClick={onToggleAvailability}
              variant="outline"
              className={cn(
                'gap-1.5 shrink-0',
                isAvailable
                  ? 'border-emerald-500 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                  : 'border-muted text-muted-foreground'
              )}
            >
              <Radio className={cn('w-4 h-4', isAvailable && 'animate-pulse')} />
              {isAvailable ? 'Available' : 'Offline'}
            </Button>
          )}
        </div>
      </Card>

      {/* Search bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, location, or specialty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-card text-sm text-foreground"
        >
          <option value="">All languages</option>
          <option value="English">English</option>
          <option value="Amharic">Amharic</option>
          <option value="French">French</option>
          <option value="Arabic">Arabic</option>
          <option value="Swahili">Swahili</option>
          <option value="Spanish">Spanish</option>
          <option value="Mandarin">Mandarin</option>
          <option value="Japanese">Japanese</option>
          <option value="German">German</option>
        </select>
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="h-9 px-3 rounded-md border border-border bg-card text-sm text-foreground"
        >
          <option value="">All specialties</option>
          <option value="Historical">Historical</option>
          <option value="Food">Food</option>
          <option value="Adventure">Adventure</option>
          <option value="Cultural">Cultural</option>
          <option value="Nature">Nature</option>
          <option value="Photography">Photography</option>
          <option value="Shopping">Shopping</option>
          <option value="Nightlife">Nightlife</option>
        </select>
        <button
          onClick={() => setAvailableOnly(!availableOnly)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border transition-colors',
            availableOnly
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-card text-muted-foreground border-border'
          )}
        >
          <Radio className={cn('w-3.5 h-3.5', availableOnly && 'animate-pulse')} />
          Available now
        </button>
      </div>

      {/* Guide cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
      ) : guides.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
            <Compass className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">No guides found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            No guides match your filters. Try adjusting search, or be the first to register as a guide!
          </p>
          {!isGuide && (
            <Button onClick={onBecomeGuide} className="mt-5 bg-primary hover:bg-primary/90 gap-1.5">
              <Compass className="w-4 h-4" />
              Become a guide
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {guides.map((g) => {
            const isOwn = me?.id === g.id
            return (
              <Card key={g.id} className="p-4 shadow-sm hover:shadow-md transition-shadow">
                {/* Top row: availability + rating */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    {g.guideAvailable ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <Radio className="w-3 h-3 animate-pulse" />
                        Available now
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Radio className="w-3 h-3" />
                        Offline
                      </span>
                    )}
                  </div>
                  {g.rating > 0 && (
                    <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {g.rating.toFixed(1)}
                    </span>
                  )}
                </div>

                {/* Avatar + name + location */}
                <div className="flex items-start gap-3">
                  <Avatar className="w-12 h-12 border-2 border-accent overflow-hidden shrink-0">
                    {g.profilePicture ? (
                      <img src={g.profilePicture} alt={g.name} className="w-full h-full object-cover" />
                    ) : (
                      <AvatarFallback className="bg-primary/15 text-primary font-semibold">{g.name.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="font-semibold text-foreground truncate">{g.name}</h3>
                      {g.verifiedLocal && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                      {g.guideLicense && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[9px] shrink-0">
                          <Award className="w-2.5 h-2.5 mr-0.5" />
                          Licensed
                        </Badge>
                      )}
                    </div>
                    {g.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {g.location}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {g.guideBio && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{g.guideBio}</p>
                )}

                {/* Languages */}
                {g.guideLanguages.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <Languages className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {g.guideLanguages.map((lang: string) => (
                      <Badge key={lang} variant="secondary" className="bg-accent text-foreground text-[10px]">{lang}</Badge>
                    ))}
                  </div>
                )}

                {/* Specialties */}
                {g.guideSpecialties.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {g.guideSpecialties.map((spec: string) => (
                      <Badge key={spec} variant="secondary" className="bg-primary/10 text-primary text-[10px]">{spec}</Badge>
                    ))}
                  </div>
                )}

                {/* Rate + message */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                  {g.guideHourlyRate != null && g.guideCurrency ? (
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="w-3.5 h-3.5 text-primary" />
                      <span className="font-semibold text-foreground">{g.guideCurrency} {g.guideHourlyRate}</span>
                      <span className="text-xs text-muted-foreground">/hr</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Rate on request</span>
                  )}
                  {!isOwn ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onMessage(g.id)}
                      className="border-primary text-primary hover:bg-primary hover:text-primary-foreground text-xs gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Message
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">You</Badge>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
