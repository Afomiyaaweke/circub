'use client'

import { useEffect, useState } from 'react'
import { X, MapPin, Star, BadgeCheck, ThumbsUp, Calendar, Briefcase, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

interface LocalProfileModalProps {
  userId: string | null
  onClose: () => void
  onOpenPost: (postId: string) => void
}

interface ProfileData {
  profile: {
    id: string; name: string; avatarColor: string; profilePicture?: string | null
    bio?: string | null; headline?: string | null; location?: string | null
    isLocal?: boolean; verifiedLocal?: boolean; rating?: number
    expertiseTags?: string[]; helpfulVotes?: number; localPostCount?: number; createdAt?: string
  } | null
  posts: Array<{
    id: string; productName: string; postType: string; country: string; city?: string | null
    neighborhood?: string | null; market?: string | null; currency: string
    priceMin: number; priceMax: number; recommendedPrice?: number | null
    category: string; imageUrl?: string | null; helpfulCount: number; notAccurateCount: number; createdAt: string
  }>
}

function formatPrice(value: number | null | undefined, currency: string) {
  if (value == null) return '-'
  if (value >= 1000) return `${currency} ${value.toLocaleString()}`
  return `${currency} ${value}`
}

export function LocalProfileModal({ userId, onClose, onOpenPost }: LocalProfileModalProps) {
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!userId) return
    const loadData = async () => {
      setLoading(true)
      try { const r = await fetch(`/api/local-profiles/${userId}`); const d = await r.json(); if (!cancelled) setData(d) }
      catch { if (!cancelled) setData(null) }
      finally { if (!cancelled) setLoading(false) }
    }
    loadData()
    return () => { cancelled = true }
  }, [userId])

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin p-0 gap-0">
        <DialogTitle className="sr-only">Local Profile</DialogTitle>
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading profile...</div>
        ) : !data?.profile ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Profile not found.</div>
        ) : (
          <div>
            <div className="h-20 bg-gradient-to-br from-primary to-emerald-400 relative">
              <button onClick={onClose} className="absolute top-2 right-2 p-1.5 rounded-md bg-white/80 hover:bg-white text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 sm:px-6 -mt-9 flex items-end gap-4">
              <Avatar className="w-20 h-20 border-4 border-white bg-white shadow-md shrink-0 overflow-hidden">
                {data.profile.profilePicture ? (
                  <img src={data.profile.profilePicture} alt={data.profile.name} className="w-full h-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-primary/15 text-primary font-bold text-2xl">{data.profile.name.charAt(0).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0 pb-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-1.5">
                  {data.profile.name}
                  {data.profile.verifiedLocal && <BadgeCheck className="w-5 h-5 text-primary" />}
                </h2>
                {data.profile.verifiedLocal && <p className="text-xs text-primary font-medium">Verified Local</p>}
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              {data.profile.bio && <p className="text-sm text-foreground/90 leading-relaxed">{data.profile.bio}</p>}
              {data.profile.location && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />{data.profile.location}</p>}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-accent/30 p-3 text-center"><p className="text-lg font-bold text-foreground">{data.profile.localPostCount ?? 0}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Posts</p></div>
                <div className="rounded-lg bg-accent/30 p-3 text-center"><p className="text-lg font-bold text-foreground">{data.profile.helpfulVotes ?? 0}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Helpful Votes</p></div>
                <div className="rounded-lg bg-accent/30 p-3 text-center"><p className="text-lg font-bold text-foreground flex items-center justify-center gap-0.5"><Star className="w-4 h-4 fill-amber-400 text-amber-400" />{(data.profile.rating ?? 0).toFixed(1)}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rating</p></div>
              </div>
              {data.profile.expertiseTags && data.profile.expertiseTags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-primary" />Expertise</h3>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {data.profile.expertiseTags.map((tag) => <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary border border-primary/20">{tag}</Badge>)}
                  </div>
                </div>
              )}
              {data.profile.createdAt && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Member since {new Date(data.profile.createdAt).toLocaleDateString()}</p>}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" />Recent price posts ({data.posts.length})</h3>
                {data.posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts yet.</p> : (
                  <div className="space-y-2">
                    {data.posts.slice(0, 12).map((p) => (
                      <Card key={p.id} className="p-3 hover:shadow-md transition-shadow cursor-pointer">
                        <button onClick={() => onOpenPost(p.id)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">{p.productName}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{[p.market, p.neighborhood, p.city, p.country].filter(Boolean).join(' · ')}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-primary">{formatPrice(p.priceMin, p.currency)} · {formatPrice(p.priceMax, p.currency)}</p>
                              {p.recommendedPrice != null && <p className="text-[10px] text-emerald-700">Fair: {formatPrice(p.recommendedPrice, p.currency)}</p>}
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><ThumbsUp className="w-3 h-3 text-primary" />{p.helpfulCount}</span><span>· {p.category}</span>
                          </div>
                        </button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
