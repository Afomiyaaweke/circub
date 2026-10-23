'use client'

// v203: QUEST FEED - the FEED tab is now the PriceQuest game page (user:
// 'make it exactly like the image i gave u - a road, a position to unlock,
// a computational poster vote on posts to be matched, a title to be earned,
// match the colors, forget the feed posting, make it only this, and make
// the stats more attractive and sharable').
//
// Sections (all computed from /api/arena - zero schema changes):
//   top bar        PriceQuest + LVL/XP chip + round day + avatar
//   battle         Weekly Hustle Battle: You vs the top rival (weekly XP,
//                  deals, votes, lead margin bar, round countdown)
//   next unlock    the vault sticker closest to unlocking, with progress
//   quest roadmap  5 positions on the circuit: done / won / current /
//                  locked / level-locked; the LIVE stage carries the
//                  'Compute & Post Deal' CTA (opens the price composer)
//   arena          the computational vote-to-match duel (price-arena.tsx,
//                  dark neon) - voting IS the matching
//   vault          Sticker Vault: mastery level + earnable title stickers
//                  with progress (posts made / helpful votes received)
//   stats          big sharable stat tiles + Share button (Web Share API,
//                  clipboard fallback)

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Trophy, Swords, Crown, Medal, Lock, Gamepad2, CheckCircle2, Share2,
  Flame, Heart, Award, Gem, Zap, ChevronRight, Copy, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { authFetch, dispatchAuthExpired } from '@/lib/auth-fetch'
import { useToast } from '@/hooks/use-toast'
import { PriceArena } from './price-arena'
import { PriceDetailModal } from './price-detail-modal'
import { CreatePricePostModal } from './create-price-post-modal'
import { AuthorProfileModal } from './author-profile-modal'
import {
  countdownLabel, seasonLabel, xpProgress, levelTitle,
  stickerStates, nextSticker, formatCompact,
  EQUIP_LIMIT, readEquippedIds, writeEquippedIds, equippedStickerDefs,
  sumBuff, voteWeight, type StickerState,
} from '@/lib/arena'
// v206 ORACLE RUNTIME - the spec's formulas for the explainer panel
import { ORACLE_WEIGHTS, PEDA, VACH } from '@/lib/oracle'
import type { User } from '@/lib/types'
import { avatarSrc } from '@/lib/fighters'

const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-emerald-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

interface ArenaMe {
  rank: number | null
  weeklyXp: number
  weeklyPosts: number
  weeklyVotes: number
  level: number
  xp: number
  title: string
  lifetimePosts: number
  lifetimeVotes: number
  name: string
  avatarColor: string
  profilePicture: string | null
}

interface ArenaRival {
  rank: number
  authorId: string
  name: string
  avatarColor: string
  profilePicture: string | null
  weeklyXp: number
  weeklyPosts: number
  weeklyVotes: number
  level: number
  xp: number
}

interface QuestData {
  week: { posts: number; votes: number }
  resetsAt: string
  me: ArenaMe | null
  rival: ArenaRival | null
  duel: Array<{ id: string; author: { id: string } }>
}

interface QuestFeedProps {
  user: User
  onMessage: (userId: string) => void
  onRefreshUser: () => void
}

type NodeState = 'done' | 'won' | 'current' | 'locked' | 'level-locked'

export function QuestFeed({ user, onMessage, onRefreshUser }: QuestFeedProps) {
  const [data, setData] = useState<QuestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [detailPostId, setDetailPostId] = useState<string | null>(null)
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [vaultFilter, setVaultFilter] = useState<'all' | 'post' | 'engagement'>('all')
  const [signal, setSignal] = useState(0)
  // v206 DMM: the two equipped stickers (client-local, zero schema change).
  const [equipped, setEquipped] = useState<string[]>([])
  const equippedHydratedRef = useRef(false)
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const isGuest = user.id === 'guest'
  const { toast } = useToast()

  const fetchQuest = useCallback(async () => {
    try {
      const res = await fetch(`/api/arena?cb=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      setData(d)
    } catch { /* the quest never blocks the tab */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void fetchQuest()
    const t = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [fetchQuest])

  // Any committed vote / fresh post moves the numbers - resync.
  useEffect(() => {
    if (signal > 0) {
      const t = setTimeout(() => { void fetchQuest() }, 600)
      return () => clearTimeout(t)
    }
  }, [signal, fetchQuest])

  const me = data?.me ?? null
  const rival = data?.rival ?? null
  const inDuel = !!(me && data?.duel?.some((d) => d.author.id === user.id))
  const round = seasonLabel(new Date(nowTick))
  const resetsIn = data ? countdownLabel(new Date(data.resetsAt), new Date(nowTick)) : ''
  const progress = me ? xpProgress(me.xp) : null

  // v206 DMM: hydrate the equipped pair once the vault knows what is
  // unlocked; then the buffs recompute on every equip toggle.
  useEffect(() => {
    if (equippedHydratedRef.current || !me) return
    equippedHydratedRef.current = true
    const unlockedIds = stickerStates(me.lifetimePosts, me.lifetimeVotes).filter((s) => s.unlocked).map((s) => s.def.id)
    setEquipped(readEquippedIds(unlockedIds))
  }, [me])

  const velBuff = sumBuff(equipped, 'VELOCITY')
  const xpBuff = sumBuff(equipped, 'GLOBAL_XP')
  const voteBuff = sumBuff(equipped, 'VOTE_WEIGHT')
  const equippedDefs = equippedStickerDefs(equipped)
  const stickers = me ? stickerStates(me.lifetimePosts, me.lifetimeVotes, velBuff) : stickerStates(0, 0, velBuff)
  const unlockedCount = stickers.filter((s) => s.unlocked).length
  const next = nextSticker(me?.lifetimePosts ?? 0, me?.lifetimeVotes ?? 0, velBuff)

  // v206 DMM equip handshake - max TWO stickers, persisted client-side.
  const toggleEquip = (s: StickerState) => {
    if (!s.unlocked || !me) return
    const has = equipped.includes(s.def.id)
    if (!has && equipped.length >= EQUIP_LIMIT) {
      toast({ title: 'Equip limit reached', description: `Only ${EQUIP_LIMIT} stickers can be active at once - unequip one first.` })
      return
    }
    const nextIds = has ? equipped.filter((x) => x !== s.def.id) : [...equipped, s.def.id]
    setEquipped(nextIds)
    writeEquippedIds(nextIds)
    toast({
      title: has ? `${s.def.name} unequipped` : `${s.def.name} equipped`,
      description: has ? 'Its multiplier is no longer active.' : `${s.def.effect} is now live on your hustle.`,
    })
  }

  // The duel vote: same endpoint + guest gate as everywhere in the game.
  const handleVote = async (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => {
    if (isGuest) {
      dispatchAuthExpired('guest-quest-vote')
      toast({ title: 'Register to vote', description: 'The demo cannot vote. Create a free account to match the best deal.' })
      return
    }
    try {
      const res = await authFetch(`/api/local-prices/${postId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voteType }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      const d = await res.json()
      if (d.vote === 'HELPFUL') toast({ title: 'Matched - marked helpful' })
      else if (d.vote === 'NOT_ACCURATE') toast({ title: 'Flagged as not accurate' })
      setSignal((s) => s + 1)
    } catch (e) {
      toast({ title: 'Vote failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  // The LIVE stage CTA: guests get the register flow, players get the composer.
  const openComposer = () => {
    if (isGuest) {
      dispatchAuthExpired('guest-quest-post')
      toast({ title: 'Register to post deals', description: 'Create a free account to compute and post deals for XP.' })
      return
    }
    setComposerOpen(true)
  }

  const shareStats = async () => {
    const m = me
    const text = m
      ? `I'm LVL ${m.level} ${m.title} on circubAwd - ${formatCompact(m.lifetimePosts)} deals shared, ${formatCompact(m.lifetimeVotes)} helpful votes collected. Join the Weekly Hustle Battle!`
      : 'PriceQuest on circubAwd - post real prices, collect Helpful votes, win the Weekly Hustle Battle!'
    const payload = `${text} ${typeof window !== 'undefined' ? window.location.origin : ''}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'My circubAwd hustle', text, url: window.location.origin })
        return
      }
      await navigator.clipboard.writeText(payload)
      toast({ title: 'Stats copied', description: 'Paste your hustle anywhere - the link is included.' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(payload)
        toast({ title: 'Stats copied', description: 'Paste your hustle anywhere - the link is included.' })
      } catch {
        toast({ title: 'Share failed', description: 'Copy the link from the address bar instead.' })
      }
    }
  }

  // Quest Roadmap - 5 positions, sequential unlocks off REAL weekly stats.
  const weeklyPosts = me?.weeklyPosts ?? 0
  const weeklyVotes = me?.weeklyVotes ?? 0
  const level = me?.level ?? 1
  const nodes: Array<{ id: string; num: string; title: string; state: NodeState; xp?: string; chip?: string; desc: string; icon: typeof Medal }> = [
    {
      id: 'n1', num: 'NODE 01', title: 'First Deal of the Week', state: weeklyPosts >= 1 ? 'done' : isGuest ? 'level-locked' : 'current',
      xp: '+50 XP', desc: 'Post this week’s first price and bank the 50 XP show-up bonus.', icon: CheckCircle2,
    },
    {
      id: 'n2', num: 'NODE 02', title: 'Vote Magnet', state: weeklyVotes >= 3 ? 'won' : weeklyPosts >= 1 ? 'current' : 'locked',
      chip: 'Sticker: Steal', desc: 'Collect 3 Helpful votes on your week’s prices - 100 XP each.', icon: Medal,
    },
    {
      id: 'n3', num: 'LIVE STAGE', title: 'Arena Price Match', state: inDuel ? 'won' : weeklyVotes >= 3 ? 'current' : 'locked',
      xp: '+450 XP', desc: 'Get your best deal into the arena duel - every Helpful vote is a match point. Gate: Spread ≥ 25% or Oracle Score ≥ 90.', icon: Gamepad2,
    },
    {
      id: 'n4', num: 'NODE 04 · BOSS FIGHT', title: 'Hustle Boss Arena', state: weeklyVotes >= 10 ? 'won' : inDuel ? 'current' : 'locked',
      chip: 'Flame Holo', desc: 'Requires: 10 Helpful votes in one week to enter the boss arena.', icon: Flame,
    },
    {
      id: 'n5', num: 'NODE 05 · GRAND FINALE', title: 'Market Legend Summit', state: level >= 10 ? 'done' : 'level-locked',
      desc: 'Reach LVL 10 (4,050 XP) to enter the master tournament.', icon: Trophy,
    },
  ]

  const leadXp = me && rival ? me.weeklyXp - rival.weeklyXp : null
  const battleBar = me && rival && (me.weeklyXp + rival.weeklyXp) > 0
    ? Math.round((me.weeklyXp / (me.weeklyXp + rival.weeklyXp)) * 100)
    : 50

  const filtered = stickers.filter((s) => vaultFilter === 'all' || s.def.kind === vaultFilter)

  return (
    <div className="space-y-4" data-testid="quest-root">
      {/* ================= TOP BAR ================= */}
      <div className="rounded-xl border border-[#2a3258] bg-gradient-to-r from-[#141936] via-[#181d3d] to-[#141936] p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 shrink-0">
            <Trophy className="w-5 h-5 text-emerald-300" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-black text-white leading-tight" data-testid="quest-title">PriceQuest</p>
            {me ? (
              <span data-testid="quest-level-chip" className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-px text-[10px] font-bold text-emerald-200">
                LVL {me.level} · {formatCompact(me.xp)} XP · {me.title}
              </span>
            ) : (
              <span className="mt-0.5 inline-flex items-center rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-px text-[10px] font-bold text-emerald-200">GUEST · REGISTER TO PLAY</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span data-testid="quest-day-chip" className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 border border-orange-400/30 px-2 py-0.5 text-[10px] font-bold text-orange-300">
            <Flame className="w-3 h-3" /> DAY {round.day}
          </span>
          <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-emerald-400/50 ${AVATAR_COLORS[user.avatarColor] || 'bg-emerald-600'} overflow-hidden`}>
            {user.profilePicture ? <img src={avatarSrc(user.profilePicture)} alt="" className="w-full h-full object-cover" /> : user.name.charAt(0).toUpperCase()}
          </span>
        </div>
      </div>

      {/* ================= WEEKLY HUSTLE BATTLE ================= */}
      <div className="rounded-xl border border-[#2a3258] bg-[#141936] p-4 space-y-3" data-testid="quest-battle">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="flex items-center gap-2 text-sm font-black text-white">
            <Swords className="w-4 h-4 text-emerald-300" /> Weekly Hustle Battle
          </h2>
          <span className="rounded-full bg-amber-400/10 border border-amber-400/30 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-amber-300">
            SEASON {round.season} · DAY {round.day}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* YOU */}
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-center space-y-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-px text-[9px] font-black tracking-wide text-amber-300">
              <Crown className="w-3 h-3" /> {me?.rank === 1 ? '#1 LEADER' : me?.rank ? `#${me.rank} CHALLENGER` : 'YOU'}
            </span>
            <div className={`mx-auto w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ${AVATAR_COLORS[me?.avatarColor || user.avatarColor] || 'bg-emerald-600'} overflow-hidden`}>
              {(me?.profilePicture || user.profilePicture)
                ? <img src={avatarSrc(me?.profilePicture || user.profilePicture)} alt="" className="w-full h-full object-cover" />
                : (me?.name || user.name).charAt(0).toUpperCase()}
            </div>
            <p className="text-xs font-bold text-white truncate">You</p>
            <p className="text-sm font-black text-cyan-300" data-testid="quest-you-xp">{me ? `${formatCompact(me.weeklyXp)} XP` : '0 XP'}</p>
            <p className="text-[10px] text-slate-400">{me?.weeklyPosts ?? 0} Deals · {me?.weeklyVotes ?? 0} Votes</p>
          </div>
          {/* RIVAL */}
          <div className="rounded-lg border border-[#2a3258] bg-[#0f1329] p-3 text-center space-y-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-px text-[9px] font-black tracking-wide text-slate-300">
              {rival ? `#${rival.rank} RIVAL` : 'OPEN ARENA'}
            </span>
            <div className={`mx-auto w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ${AVATAR_COLORS[rival?.avatarColor || ''] || 'bg-slate-600'} overflow-hidden`}>
              {rival?.profilePicture
                ? <img src={avatarSrc(rival.profilePicture)} alt="" className="w-full h-full object-cover" />
                : (rival?.name || '?').charAt(0).toUpperCase()}
            </div>
            <p className="text-xs font-bold text-white truncate">{rival ? rival.name : 'No rival yet'}</p>
            <p className="text-sm font-black text-slate-300" data-testid="quest-rival-xp">{rival ? `${formatCompact(rival.weeklyXp)} XP` : '0 XP'}</p>
            <p className="text-[10px] text-slate-400">{rival ? `${rival.weeklyPosts} Deals · ${rival.weeklyVotes} Votes` : 'Post first - dare the field'}</p>
          </div>
        </div>
        {/* lead margin + round clock */}
        <div className="rounded-lg bg-[#0f1329] border border-[#2a3258] p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-cyan-300" data-testid="quest-lead">
              {leadXp === null ? 'Post a deal to enter the battle' : leadXp >= 0 ? `↑ +${leadXp} XP Lead Margin` : `${Math.abs(leadXp)} XP Behind - close the gap`}
            </span>
            <span className="text-slate-400" data-testid="quest-round-clock">Round Ends: {resetsIn || '—'}</span>
          </div>
          <div className="h-2 rounded-full bg-[#0b0f22] overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${battleBar}%` }} />
          </div>
        </div>
        {progress && (
          <div className="space-y-1" data-testid="quest-level-progress">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>
                LVL {progress.level} · {formatCompact(progress.into)} / {formatCompact(progress.need)} XP to LVL {progress.level + 1}
                {xpBuff > 0 && <span data-testid="quest-xp-buff" className="ml-1.5 text-amber-300">+{Math.round(xpBuff * 100)}% XP rate</span>}
              </span>
              <span className="text-emerald-300">{progress.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#0b0f22] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500" style={{ width: `${Math.max(3, progress.pct)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ================= NEXT VAULT UNLOCKING ================= */}
      {next && (
        <div className="rounded-xl border border-[#2a3258] bg-[#141936] p-4 flex items-center gap-3" data-testid="quest-next-unlock">
          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${next.def.gradient} text-white shrink-0 shadow-lg`}>
            {next.def.metric === 'posts' ? <Zap className="w-6 h-6 text-white/90" /> : <Heart className="w-6 h-6 text-white/90" />}
          </span>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[10px] font-black tracking-widest text-amber-300">NEXT VAULT UNLOCKING</p>
            <p className="text-sm font-bold text-white truncate">{next.def.name} Sticker</p>
            <p className="text-[11px] text-slate-400">Unlocked at {formatCompact(next.def.target)} {next.def.metric === 'posts' ? 'posts' : 'helpful votes'} · {formatCompact(next.remaining)} to go!</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-[#0b0f22] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500" style={{ width: `${Math.max(3, next.pct)}%` }} />
              </div>
              <span className="text-[10px] font-bold text-emerald-300 shrink-0">{formatCompact(next.value)}/{formatCompact(next.def.target)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= QUEST ROADMAP ================= */}
      <div className="rounded-xl border border-[#2a3258] bg-[#141936] p-4" data-testid="quest-roadmap">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-black text-white">Quest Roadmap</h2>
            <p className="text-[11px] text-slate-400">Circuit {round.season}: Metro Price Hunter</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 border border-cyan-400/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
            <Zap className="w-3 h-3" /> Auto-Sync
          </span>
        </div>
        <div className="mt-3 space-y-0" data-testid="quest-road-nodes">
          {nodes.map((node, i) => {
            const Icon = node.icon
            const live = node.state === 'current'
            const open = node.state === 'done' || node.state === 'won' || node.state === 'current'
            return (
              <div key={node.id} className="relative flex gap-3" data-testid={`quest-road-node-${i + 1}`} data-state={node.state}>
                {/* road spine */}
                {i < nodes.length - 1 && <span className="absolute left-[19px] top-11 bottom-0 w-0.5 bg-gradient-to-b from-emerald-500/60 to-[#2a3258]" aria-hidden />}
                {/* position marker */}
                <div className={
                  'relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ' +
                  (node.state === 'done' ? 'bg-amber-400/15 border-amber-400/50'
                    : node.state === 'won' ? 'bg-emerald-500/20 border-emerald-400/50'
                    : live ? 'bg-emerald-500/25 border-emerald-400 shadow-lg shadow-emerald-500/30'
                    : 'bg-[#0f1329] border-[#2a3258]')
                }>
                  {node.state === 'done' ? <CheckCircle2 className="w-5 h-5 text-amber-300" />
                    : node.state === 'won' ? <Medal className="w-5 h-5 text-emerald-300" />
                    : live ? <Icon className="w-5 h-5 text-cyan-300" />
                    : <Lock className="w-4 h-4 text-slate-500" />}
                </div>
                {/* node card */}
                <div className={
                  'flex-1 min-w-0 rounded-lg border p-3 mb-2 space-y-1 ' +
                  (live ? 'border-emerald-400/50 bg-gradient-to-br from-emerald-500/15 to-teal-500/10'
                    : open ? 'border-[#2a3258] bg-[#0f1329]'
                    : 'border-[#20264a] bg-[#0f1329]/60 opacity-70')
                }>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={
                      'text-[9px] font-black tracking-widest ' +
                      (live ? 'text-cyan-300' : node.state === 'done' || node.state === 'won' ? 'text-slate-400' : 'text-slate-500')
                    }>
                      {node.num}{!open && ' · LOCKED'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {node.chip && <span className="rounded-full bg-teal-500/15 border border-teal-400/30 px-1.5 py-px text-[9px] font-bold text-teal-300">{node.chip}</span>}
                      {node.xp && <span className="rounded-full bg-cyan-400/10 border border-cyan-400/30 px-1.5 py-px text-[9px] font-black text-cyan-300">{node.xp}</span>}
                    </div>
                  </div>
                  <p className={'text-sm font-bold truncate ' + (open ? 'text-white' : 'text-slate-400')}>{node.title}</p>
                  <p className="text-[11px] text-slate-400">{node.desc}</p>
                  {live && node.id === 'n3' && (
                    <Button onClick={openComposer} data-testid="quest-post-deal" size="sm" className="mt-1.5 w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5" /> Compute &amp; Post Deal
                    </Button>
                  )}
                  {live && node.id === 'n4' && (
                    <p className="text-[10px] font-bold text-emerald-300 pt-0.5" data-testid="quest-boss-live">BOSS ARENA LIVE - 10 votes to clear</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ================= CHALLENGE BANNER ================= */}
      <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-600/30 via-teal-600/20 to-emerald-600/30 p-4 flex items-center justify-between gap-3" data-testid="quest-challenge">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/30 border border-emerald-300/40 shrink-0">
            <Zap className="w-5 h-5 text-emerald-200" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">Challenge {rival ? rival.name : 'the arena'}</p>
            <p className="text-[11px] text-emerald-200/80">Instant price duel - vote the best deal into the match</p>
          </div>
        </div>
        <Button onClick={() => arenaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} size="sm" data-testid="quest-start-duel" className="shrink-0 h-8 bg-cyan-500 hover:bg-cyan-400 text-[#0b0e1d] font-black text-xs">
          Start Duel <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ================= ARENA (vote to be matched) ================= */}
      <div ref={arenaRef}>
        <PriceArena onVote={handleVote} onOpenPost={setDetailPostId} guest={isGuest} refreshSignal={signal} />
      </div>

      {/* ================= STICKER VAULT ================= */}
      <div className="rounded-xl border border-[#2a3258] bg-[#141936] p-4 space-y-3" data-testid="quest-vault">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 shrink-0">
              <Award className="w-5 h-5 text-emerald-300" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white">Sticker Vault</h2>
              <p className="text-[11px] text-slate-400">Titles to be earned · computational ranking</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-black tracking-widest text-emerald-300">MASTERY</p>
            <p className="text-xs font-black text-white">LVL {me?.level ?? 1}</p>
            <p className="text-[10px] text-slate-400" data-testid="quest-vault-count">{unlockedCount} / {stickers.length} Unlocked</p>
          </div>
        </div>

        {/* v206 DMM: the equipped pair drives the multiplier matrix */}
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2.5 space-y-1.5" data-testid="quest-buffs">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[9px] font-black tracking-widest text-emerald-300">
              <Sparkles className="w-3 h-3" /> ACTIVE BUFFS · DMM
            </p>
            <span className="text-[9px] font-bold text-slate-400" data-testid="quest-buff-count">{equipped.length}/{EQUIP_LIMIT} EQUIPPED</span>
          </div>
          <p className="text-[11px] font-bold text-white" data-testid="quest-buff-line">
            Vote weight ×{voteWeight(level ?? 1, voteBuff).toFixed(2)} · XP +{Math.round(xpBuff * 100)}% · Unlock targets −{Math.round(velBuff * 100)}%
          </p>
          {equippedDefs.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {equippedDefs.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-[#0f1329] border border-[#2a3258] px-1.5 py-px text-[9px] font-bold text-cyan-300">
                  {d.name} · {d.effect}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">Equip up to {EQUIP_LIMIT} earned stickers below to arm their multipliers.</p>
          )}
        </div>

        {/* sharable stat tiles */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Your hustle in numbers</p>
          <Button onClick={() => void shareStats()} size="sm" variant="outline" data-testid="quest-share" className="h-7 px-2.5 text-[11px] gap-1 bg-transparent border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-200">
            <Share2 className="w-3.5 h-3.5" /> Share
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2" data-testid="quest-stats">
          {[
            { label: 'POST TITAN', big: formatCompact(me?.lifetimePosts ?? 0), sub: 'Deals Shared', icon: Zap },
            { label: 'VIRAL BEACON', big: formatCompact(me?.lifetimeVotes ?? 0), sub: 'Votes & Views', icon: Heart },
            { label: 'HUSTLE XP', big: formatCompact(me?.xp ?? 0), sub: levelTitle(me?.level ?? 1), icon: Trophy },
          ].map((tile) => {
            const Icon = tile.icon
            return (
              <div key={tile.label} className="rounded-lg border border-[#2a3258] bg-[#0f1329] p-2.5 space-y-0.5">
                <p className="flex items-center gap-1 text-[8px] font-black tracking-widest text-slate-500"><Icon className="w-2.5 h-2.5 text-emerald-300" />{tile.label}</p>
                <p className="text-lg font-black text-white leading-tight" data-testid="quest-stat-value">{tile.big}</p>
                <p className="text-[9px] text-slate-400 truncate">{tile.sub}</p>
              </div>
            )
          })}
        </div>

        {/* vault filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {([['all', `ALL STICKERS (${unlockedCount}/${stickers.length})`], ['post', 'POST MILESTONES'], ['engagement', 'ENGAGEMENT']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setVaultFilter(key)}
              data-testid={`quest-vault-filter-${key}`}
              className={
                'rounded-full px-3 py-1 text-[10px] font-black tracking-wide transition-colors ' +
                (vaultFilter === key
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-[#0f1329] border border-[#2a3258] text-slate-400 hover:text-slate-200')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* sticker grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="quest-sticker-grid">
          {filtered.map((s) => {
            const StickerIcon = s.def.metric === 'posts' ? Zap : s.def.id === 'hype-magnet' ? Heart : s.def.id === 'viral-overlord' ? Gem : Award
            return (
              <div key={s.def.id} data-testid={`quest-sticker-${s.def.id}`} className={
                'rounded-lg border p-3 space-y-2 ' +
                (s.unlocked ? 'border-[#2a3258] bg-[#0f1329]' : 'border-[#20264a] bg-[#0f1329]/60')
              }>
                <div className="flex items-center justify-between gap-1.5">
                  <span className={
                    'rounded-full px-1.5 py-px text-[8px] font-black tracking-widest ' +
                    (s.def.tier.startsWith('Bronze') ? 'bg-amber-500/15 text-amber-300'
                      : s.def.tier.startsWith('Silver') ? 'bg-slate-300/15 text-slate-200'
                      : s.def.tier.startsWith('Cyan') ? 'bg-cyan-400/15 text-cyan-300'
                      : s.def.tier.startsWith('Gold') ? 'bg-yellow-400/15 text-yellow-300'
                      : 'bg-teal-500/15 text-teal-300')
                  }>{s.def.tier.toUpperCase()}</span>
                  {s.unlocked ? (
                    <button
                      type="button"
                      onClick={() => toggleEquip(s)}
                      data-testid={`quest-equip-${s.def.id}`}
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-black transition-colors ' +
                        (equipped.includes(s.def.id)
                          ? 'bg-emerald-600 text-white shadow shadow-emerald-500/30'
                          : 'bg-transparent border border-[#2a3258] text-slate-400 hover:text-cyan-300 hover:border-cyan-400/40')
                      }
                    >
                      {equipped.includes(s.def.id) ? (<><CheckCircle2 className="w-3 h-3" /> EQUIPPED</>) : 'EQUIP'}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-500"><Lock className="w-3 h-3" /> LOCKED</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={
                    'inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br shrink-0 ' +
                    (s.unlocked ? s.def.gradient + ' text-white shadow-lg' : 'from-[#1a2040] to-[#141936] text-slate-600 border border-[#2a3258]')
                  }>
                    <StickerIcon className="w-7 h-7" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={'text-sm font-bold truncate ' + (s.unlocked ? 'text-white' : 'text-slate-300')}>{s.def.name}</p>
                    <p className="text-[10px] text-slate-500">{s.def.requirement}</p>
                    <p className="text-[10px] font-bold text-cyan-300">
                      {s.def.effect.replace('{value}', formatCompact(s.value))}
                    </p>
                  </div>
                </div>
                {!s.unlocked && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[#0b0f22] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${Math.max(2, s.pct)}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 shrink-0">{formatCompact(s.value)}/{formatCompact(s.def.target)} · {s.pct}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* computational ranking explainer */}
        <div className="rounded-lg border border-[#2a3258] bg-[#0f1329] p-3 space-y-2" data-testid="quest-ranking-note">
          <p className="flex items-center gap-1.5 text-xs font-black text-white"><Gamepad2 className="w-4 h-4 text-emerald-300" /> Computational Deal Ranking</p>
          <p className="text-[11px] text-slate-400" data-testid="quest-note-oracle">
            <span className="font-bold text-emerald-300">Oracle Score (OIVE):</span> every deal is scored live - Spread × {ORACLE_WEIGHTS.spread} + Proof × {ORACLE_WEIGHTS.confidence} + Scarcity × {ORACLE_WEIGHTS.scarcity}. Score ≥ 90 is Extreme Alpha (+{85} XP, instant duel seat), 70-89 Verified (+{50} XP), below 70 goes to Crowd Audit (10 Helpful votes to validate).
          </p>
          <p className="text-[11px] text-slate-400" data-testid="quest-note-peda">
            <span className="font-bold text-cyan-300">Escrow duels (PEDA):</span> {PEDA.defaultWager} XP locked per side - the winner takes {PEDA.winnerPct}% of the pot, and the winning side's voters split the remaining {PEDA.votersPct}%.
          </p>
          <p className="text-[11px] text-slate-400" data-testid="quest-note-vach">
            <span className="font-bold text-amber-300">Vlogger Arbitrage (VACH):</span> Extreme Alpha deals auto-broadcast to the creator hub with a synergy link - {VACH.creatorPct}% to the creator, {VACH.buyerPct}% buyer cashback, {VACH.hunterPct}% back to the original hunter.
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="font-bold text-emerald-300">Real-time multipliers (DMM):</span> equip up to {EQUIP_LIMIT} stickers - vote influence scales as (1 + LVL/20) × (1 + buff), and 100 XP per Helpful vote, 50 XP per post, reset every Monday 00:00 UTC.
          </p>
        </div>
      </div>

      {/* ================= MODALS ================= */}
      <PriceDetailModal postId={detailPostId} onClose={() => setDetailPostId(null)} onAuthorClick={setAuthorProfileId} onMessage={onMessage} currentUserId={user.id} onOpenPost={setDetailPostId} />
      <AuthorProfileModal userId={authorProfileId} onClose={() => setAuthorProfileId(null)} onMessage={onMessage} currentUserId={user.id} />
      <CreatePricePostModal open={composerOpen} onOpenChange={setComposerOpen} onCreated={() => { setSignal((s) => s + 1); onRefreshUser(); toast({ title: 'Deal posted', description: '+50 XP banked - collect Helpful votes to match.' }) }} />
    </div>
  )
}
