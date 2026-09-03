'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  UserPlus,
  Mail,
  X,
  Check,
  MapPin,
  MessageCircle,
  Sparkles,
  Trash2,
  Briefcase,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { User, Connection } from '@/lib/types'

interface NetworkTabProps {
  me: User | null
  onMessage: (userId: string) => void
  onRefreshUser: () => void
}

export function NetworkTab({ me, onMessage, onRefreshUser }: NetworkTabProps) {
  const [connections, setConnections] = useState<User[]>([])
  const [invitations, setInvitations] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [conns, inv, pend, sugg] = await Promise.all([
        fetch('/api/connections').then((r) => r.json()),
        fetch('/api/connections/invitations').then((r) => r.json()),
        fetch('/api/connections/pending').then((r) => r.json()),
        fetch('/api/connections/suggestions').then((r) => r.json()),
      ])
      setConnections(conns.connections || [])
      setInvitations(inv.invitations || [])
      setPending(pend.pending || [])
      setSuggestions(sugg.suggestions || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleConnect = async (userId: string, name: string) => {
    setConnecting(userId)
    try {
      const res = await fetch('/api/connections/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: userId }),
      })
      const data = await res.json()
      if (data.status === 'ACCEPTED') {
        toast({ title: `Connected with ${name}` })
      } else if (data.status === 'PENDING') {
        toast({ title: `Connection request sent to ${name}` })
      } else if (data.error === 'Already connected') {
        toast({ title: `Already connected with ${name}` })
      } else if (data.error === 'Request already pending') {
        toast({ title: `Request to ${name} is already pending` })
      } else {
        toast({ title: `Connection request sent to ${name}` })
      }
      fetchAll()
      onRefreshUser()
    } catch {
      toast({ title: 'Failed to connect', variant: 'destructive' })
    } finally {
      setConnecting(null)
    }
  }

  const handleAccept = async (connId: string, name: string) => {
    setAccepting(connId)
    try {
      const res = await fetch(`/api/connections/${connId}/accept`, {
        method: 'POST',
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      toast({ title: `You are now connected with ${name}` })
      fetchAll()
      onRefreshUser()
    } catch (e) {
      toast({
        title: 'Failed to accept',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setAccepting(null)
    }
  }

  const handleIgnore = async (connId: string) => {
    try {
      const res = await fetch(`/api/connections/${connId}/ignore`, {
        method: 'POST',
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      toast({ title: 'Invitation ignored' })
      fetchAll()
      onRefreshUser()
    } catch (e) {
      toast({
        title: 'Failed to ignore',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleCancelPending = async (connId: string) => {
    try {
      const res = await fetch(`/api/connections/${connId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      toast({ title: 'Connection request withdrawn' })
      fetchAll()
      onRefreshUser()
    } catch (e) {
      toast({
        title: 'Failed to withdraw',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleRemoveConnection = async (connId: string, name: string) => {
    try {
      const res = await fetch(`/api/connections/${connId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      toast({ title: `Removed connection with ${name}` })
      fetchAll()
      onRefreshUser()
    } catch (e) {
      toast({
        title: 'Failed to remove',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  // Need to also fetch connection IDs for the "remove" button on connections
  const [connectionIds, setConnectionIds] = useState<Record<string, string>>({})
  useEffect(() => {
    if (me?.id) {
      fetch('/api/connections').then((r) => r.json()).then(() => {
        // also need to fetch raw connections to get the connectionId
        fetch('/api/connections/list-raw')
          .then((r) => r.json())
          .then((data) => {
            const map: Record<string, string> = {}
            for (const c of data.connections || []) {
              const otherId = c.requesterId === me.id ? c.receiverId : c.requesterId
              map[otherId] = c.id
            }
            setConnectionIds(map)
          })
          .catch(() => {})
      })
    }
  }, [me?.id, connections.length])

  const filteredConnections = connections.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.headline || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.location || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Header with connections count */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Manage my network
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Stay in touch with your connections and grow your network.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/60">
              <Users className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">
                {me?.connectionsCount ?? 0}
              </span>
              <span className="text-muted-foreground">connections</span>
            </div>
            {invitations.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15">
                <Mail className="w-4 h-4 text-primary" />
                <span className="font-semibold text-primary">
                  {invitations.length}
                </span>
                <span className="text-primary/80">invitations</span>
              </div>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-4 relative">
          <Input
            placeholder="Search by name, role, or location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card"
          />
        </div>
      </Card>

      {/* Invitations (incoming) */}
      {invitations.length > 0 && (
        <Card className="p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Invitations
            <span className="ml-1 text-xs text-muted-foreground">
              ({invitations.length})
            </span>
          </h3>
          <div className="space-y-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0"
              >
                <Avatar className="w-12 h-12 border-2 border-accent shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                    {inv.user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">
                    {inv.user.name}
                  </p>
                  {inv.user.headline && (
                    <p className="text-xs text-muted-foreground truncate">
                      {inv.user.headline}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {inv.user.location || 'Unknown location'}
                  </p>
                  {inv.note && (
                    <p className="text-xs text-foreground mt-2 italic bg-accent/30 p-2 rounded">
                      &ldquo;{inv.note}&rdquo;
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    {Math.max(
                      1,
                      Math.floor(
                        (Date.now() - new Date(inv.createdAt).getTime()) /
                          86400000
                      )
                    )}{' '}
                    days ago
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-end gap-1.5 shrink-0">
                  <button
                    onClick={() => handleIgnore(inv.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                    aria-label="Ignore"
                  >
                    Ignore
                  </button>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(inv.id, inv.user.name)}
                    disabled={accepting === inv.id}
                    className="bg-primary hover:bg-primary/90 h-7 px-3 text-xs"
                  >
                    {accepting === inv.id ? (
                      '...'
                    ) : (
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Accept
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Grow your network · People you may know */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            People you may know
          </h3>
          <span className="text-xs text-muted-foreground">
            {suggestions.length} suggestions
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Loading suggestions...
          </p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            You&apos;ve connected with everyone we know! 🎉
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-12 bg-gradient-to-br from-primary/40 to-emerald-400/40" />
                <div className="px-3 pb-3 -mt-6 flex flex-col items-center text-center">
                  <Avatar className="w-12 h-12 border-2 border-white bg-white">
                    <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                      {s.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="mt-2 text-sm font-medium text-foreground truncate">
                    {s.name}
                  </p>
                  {s.headline && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-h-[2rem]">
                      {s.headline}
                    </p>
                  )}
                  {s.location && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {s.location}
                    </p>
                  )}
                  {s.mutualCount > 0 && (
                    <p className="text-[11px] text-primary mt-1">
                      {s.mutualCount} mutual connection
                      {s.mutualCount !== 1 && 's'}
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleConnect(s.id, s.name)}
                    disabled={connecting === s.id}
                    className="mt-3 bg-primary hover:bg-primary/90 h-8 px-4 text-xs w-full gap-1.5"
                  >
                    {connecting === s.id ? (
                      '...'
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        Connect
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pending sent requests */}
      {pending.length > 0 && (
        <Card className="p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Mail className="w-4 h-4 text-amber-500" />
            Pending requests
            <span className="ml-1 text-xs text-muted-foreground">
              ({pending.length})
            </span>
          </h3>
          <div className="space-y-3">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0"
              >
                <Avatar className="w-10 h-10 border-2 border-accent shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                    {p.user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">
                    {p.user.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.user.headline || '-'}
                  </p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Pending · waiting for response
                  </p>
                </div>
                <button
                  onClick={() => handleCancelPending(p.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  Withdraw
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Connections list */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Connections
            <span className="ml-1 text-xs text-muted-foreground">
              ({filteredConnections.length})
            </span>
          </h3>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Loading connections...
          </p>
        ) : filteredConnections.length === 0 ? (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {search
                ? 'No connections match your search'
                : 'No connections yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search
                ? 'Try a different search term.'
                : 'Connect with people above to grow your network.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConnections.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0"
              >
                <Avatar className="w-12 h-12 border-2 border-accent shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                    {c.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">
                    {c.name}
                  </p>
                  {c.headline && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      {c.headline}
                    </p>
                  )}
                  {c.location && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {c.location}
                    </p>
                  )}
                  {c.bio && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {c.bio}
                    </p>
                  )}
                  {c.connectionsCount && (
                    <p className="text-[11px] text-primary mt-1">
                      {c.connectionsCount} connections
                    </p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => onMessage(c.id)}
                    className="bg-primary hover:bg-primary/90 h-8 px-3 text-xs gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Message
                  </Button>
                  <button
                    onClick={() => handleRemoveConnection(connectionIds[c.id] || '', c.name)}
                    className="px-2 py-1.5 rounded-full text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
                    aria-label="Remove connection"
                    title="Remove connection"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
