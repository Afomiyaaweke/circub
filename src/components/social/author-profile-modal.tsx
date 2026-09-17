'use client'

// AuthorProfileModal — opens when you tap a person's name or avatar on a
// feed post (or on one of the comments). Shows who they are at a glance and
// links through to their full shareable profile at /u/<username> when they
// have one. Public data only — same fields the public profile page shows.

import { useEffect, useState } from 'react'
import { X, MapPin, BadgeCheck, Briefcase, MessageCircle, Heart, MessageSquare, User2, ExternalLink, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface AuthorProfileModalProps {
  userId: string | null
  onClose: () => void
  onMessage?: (userId: string) => void
  currentUserId?: string | null
}

interface AuthorData {
  profile: {
    id: string
    name: string
    username?: string | null
    avatarColor: string
    profilePicture?: string | null
    bio?: string | null
    headline?: string | null
    location?: string | null
    accountType?: string
    companyName?: string | null
    companyIndustry?: string | null
    isLocal?: boolean
    verifiedLocal?: boolean
    idVerified?: boolean
    isGuide?: boolean
    expertiseTags?: string[]
    createdAt?: string
    followersCount?: number
    likesCount?: number
    connectionsCount?: number
    postsCount?: number
    localPostCount?: number
  } | null
  posts: Array<{ id: string; content: string; imageUrl?: string | null; createdAt: string; likes: number; comments: number }>
  pricePosts: Array<{ id: string; productName: string; currency: string; priceMin: number; priceMax: number; country: string; city?: string | null; createdAt: string }>
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function priceLabel(cur: string, min: number, max: number) {
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2))
  return min !== max ? `${cur} ${fmt(min)} – ${fmt(max)}` : `${cur} ${fmt(min)}`
}

export function AuthorProfileModal({ userId, onClose, onMessage, currentUserId }: AuthorProfileModalProps) {
  const [data, setData] = useState<AuthorData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!userId) { setData(null); return }
    const loadData = async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/users/${userId}`)
        const d = await r.json()
        if (!cancelled) setData(d)
      } catch { if (!cancelled) setData(null) }
      finally { if (!cancelled) setLoading(false) }
    }
    loadData()
    return () => { cancelled = true }
  }, [userId])

  const profile = data?.profile

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin p-0 gap-0">
        <DialogTitle className="sr-only">Profile</DialogTitle>
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading profile...</div>
        ) : !profile ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Profile not found.</div>
        ) : (
          <div>
            {/* Cover + identity */}
            <div className="h-20 bg-gradient-to-br from-primary to-emerald-400 relative">
              <button onClick={onClose} className="absolute top-2 right-2 p-1.5 rounded-md bg-white/80 hover:bg-white text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 sm:px-6 -mt-9 flex items-end gap-4">
              <Avatar className="w-20 h-20 border-4 border-white bg-white shadow-md shrink-0 overflow-hidden">
                {profile.profilePicture ? (
                  <img src={profile.profilePicture} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <AvatarFallback className="bg-primary/15 text-primary font-bold text-2xl">{profile.name.charAt(0).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0 pb-2">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                  <span className="truncate">{profile.name}</span>
                  {profile.verifiedLocal && <BadgeCheck className="w-5 h-5 text-primary shrink-0" aria-label="Verified local" />}
                  {profile.idVerified && <BadgeCheck className="w-5 h-5 text-blue-500 shrink-0" aria-label="Verified with ID or passport" />}
                </h2>
                {profile.username && <p className="text-xs text-muted-foreground">@{profile.username}</p>}
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {/* Actions: message + full profile */}
              <div className="flex items-center gap-2">
                {onMessage && profile.id !== currentUserId && (
                  <Button size="sm" onClick={() => onMessage(profile.id)} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 h-8 flex-1">
                    <MessageCircle className="w-3.5 h-3.5" />
                    Message
                  </Button>
                )}
                {profile.username && (
                  <Button asChild size="sm" variant="outline" className="text-xs gap-1.5 h-8 flex-1">
                    <Link href={`/u/${profile.username}`} onClick={onClose}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      View full profile
                    </Link>
                  </Button>
                )}
              </div>

              {profile.headline && <p className="text-sm text-foreground/90 leading-relaxed">{profile.headline}</p>}
              {profile.bio && <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>}
              {profile.accountType === 'COMPANY' && profile.companyName && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Briefcase className="w-4 h-4 text-primary" />{profile.companyName}{profile.companyIndustry ? ` · ${profile.companyIndustry}` : ''}</p>
              )}
              {profile.location && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" />{profile.location}</p>}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-accent/30 p-3 text-center"><p className="text-lg font-bold text-foreground">{(profile.followersCount ?? 0).toLocaleString()}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Followers</p></div>
                <div className="rounded-lg bg-accent/30 p-3 text-center"><p className="text-lg font-bold text-foreground">{((profile.postsCount ?? 0) + (profile.localPostCount ?? 0)).toLocaleString()}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Posts</p></div>
                <div className="rounded-lg bg-accent/30 p-3 text-center"><p className="text-lg font-bold text-foreground">{(profile.likesCount ?? 0).toLocaleString()}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Likes</p></div>
              </div>

              {profile.expertiseTags && profile.expertiseTags.length > 0 && (
                <div className="flex items-center flex-wrap gap-1.5">
                  {profile.expertiseTags.map((tag) => <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary border border-primary/20">{tag}</Badge>)}
                </div>
              )}

              {/* Recent feed posts */}
              {data.posts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" />Recent posts</h3>
                  <div className="space-y-2">
                    {data.posts.slice(0, 4).map((p) => (
                      <div key={p.id} className="rounded-lg border border-border bg-card p-3">
                        <p className="text-sm text-foreground line-clamp-3 leading-relaxed">{p.content}</p>
                        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Heart className="w-3 h-3 text-primary" />{p.likes}</span>
                          <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{p.comments}</span>
                          <span>· {timeAgo(p.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent price posts */}
              {data.pricePosts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5"><User2 className="w-4 h-4 text-primary" />Recent price posts</h3>
                  <div className="space-y-2">
                    {data.pricePosts.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border bg-card p-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.productName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{[p.city, p.country].filter(Boolean).join(', ')}</p>
                        </div>
                        <p className="text-sm font-semibold text-primary shrink-0 text-right">{priceLabel(p.currency, p.priceMin, p.priceMax)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.createdAt && <p className="text-xs text-muted-foreground">Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
