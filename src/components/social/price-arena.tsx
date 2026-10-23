'use client'

// v200: PRICE ARENA - the weekly battle between price posters, voted on by
// everyone. The feed is the game: post a price, collect HELPFUL votes, and
// the best-voted item of the week leads the duel at the top of the feed.
//
// Sections (ONE card so it stays compact on phones):
//   header      Swords icon + "Price Arena" + the weekly reset countdown.
//   duel        the 2 best-voted items of the week, side by side (stacked
//               on phones) with vote-split % bars and a VOTE button per
//               side that reuses the card's exact vote endpoint + guest
//               gate via the onVote callback. A duel needs 2 voted items;
//               with fewer the section shows the recruit line instead.
//   leaderboard top 5 posters of the week by XP (votes*100 + posts*50),
//               each row carrying their lifetime LVL chip.
//
// Data: GET /api/arena (30s edge cache). Every committed vote refetches
// after a short delay so the percentages move live.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Swords, Trophy, Crown, ThumbsUp, Loader2, Zap, ShieldCheck, Flame } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { countdownLabel, levelTitle, stickerTierLabel, stickerTierChipClass } from '@/lib/arena'
import { avatarSrc } from '@/lib/fighters'

const AVATAR_COLORS: Record<string, string> = {
  teal: 'bg-teal-600', blue: 'bg-blue-600', green: 'bg-emerald-600', red: 'bg-red-600',
  purple: 'bg-purple-600', orange: 'bg-orange-600', pink: 'bg-pink-600', amber: 'bg-amber-600',
}

interface ArenaDuelItem {
  id: string
  side: string
  productName: string
  currency: string
  priceMin: number
  priceMax: number
  imageUrl: string | null
  city: string | null
  country: string
  helpfulCount: number
  pct: number
  author: { id: string; name: string; username: string | null; avatarColor: string; profilePicture: string | null; level: number; xp: number }
  // v208: the side's poster sticker class (their highest earned sticker)
  authorTopSticker?: { id: string; name: string; tier: string; gradient: string; effect: string } | null
  // v206 OIVE verdict + PEDA pre-match odds for this side
  oracle?: { score: number; label: string; baseXp: number }
  winProb?: number
}

interface ArenaBoardRow {
  rank: number
  authorId: string
  name: string
  avatarColor: string
  profilePicture: string | null
  weeklyXp: number
  weeklyVotes: number
  weeklyPosts: number
  level: number
  xp: number
  // v208: the ranked link's sticker class
  topSticker?: { id: string; name: string; tier: string; gradient: string; effect: string } | null
}

interface ArenaData {
  week: { posts: number; votes: number }
  resetsAt: string
  leaderboard: ArenaBoardRow[]
  duel: ArenaDuelItem[]
  myVotes: Record<string, string | null>
  // v206 PEDA: the duel's escrow envelope + deterministic invite code
  match?: { inviteCode: string; escrow: { wager: number; pot: number; winnerShare: number; votersPool: number } } | null
}

interface PriceArenaProps {
  onVote: (postId: string, voteType: 'HELPFUL' | 'NOT_ACCURATE') => Promise<void> | void
  onOpenPost: (postId: string) => void
  // True when the viewer is not signed in: the vote callback then opens the
  // register modal WITHOUT committing anything, so the optimistic bump must
  // be skipped (otherwise the split would jump and snap back on refetch).
  guest?: boolean
  // Bumped by the feed whenever its own state changes (a vote landed) so
  // the arena can resync its numbers.
  refreshSignal?: number
}

export function PriceArena({ onVote, onOpenPost, guest = false, refreshSignal = 0 }: PriceArenaProps) {
  const [data, setData] = useState<ArenaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const aliveRef = useRef(true)

  const fetchArena = useCallback(async () => {
    try {
      const res = await fetch(`/api/arena?cb=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      if (aliveRef.current) setData(d)
    } catch { /* the arena never blocks the feed */ }
    finally { if (aliveRef.current) setLoading(false) }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    void fetchArena()
    const t = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => { aliveRef.current = false; clearInterval(t) }
  }, [fetchArena])

  // The feed's vote handler mutates card state; once it settles, resync.
  useEffect(() => {
    if (refreshSignal > 0) {
      const t = setTimeout(() => { void fetchArena() }, 600)
      return () => clearTimeout(t)
    }
  }, [refreshSignal, fetchArena])

  const handleArenaVote = async (postId: string) => {
    if (votingId) return
    setVotingId(postId)
    try {
      // The feed's handler commits the vote (or, for guests, opens the
      // register modal without committing). Only then does the split move
      // optimistically - and the 600ms refetch reconciles with the server.
      await onVote(postId, 'HELPFUL')
      if (guest) return
      setData((prev) => {
        if (!prev) return prev
        const voted = prev.duel.find((d) => d.id === postId)
        if (!voted || prev.myVotes[postId] === 'HELPFUL') return prev
        const wasHelpful = prev.myVotes[postId] === 'HELPFUL'
        const duel = prev.duel.map((d) => {
          let votes = d.helpfulCount
          if (d.id === postId) votes += 1
          else if (wasHelpful && d.helpfulCount > 0) votes -= 1
          return { ...d, helpfulCount: votes }
        })
        const total = duel.reduce((s, d) => s + d.helpfulCount, 0)
        return {
          ...prev,
          duel: duel.map((d) => ({ ...d, pct: total > 0 ? Math.round((d.helpfulCount / total) * 100) : d.pct })),
          myVotes: { ...prev.myVotes, [postId]: 'HELPFUL' },
        }
      })
    } finally {
      setVotingId(null)
    }
  }

  const resetsIn = data ? countdownLabel(new Date(data.resetsAt), new Date(nowTick)) : ''
  // The crown always has a home: with 2 sides the current leader, with 1
  // side the item to beat. The 'leads by N' line stays 2-item-only.
  const leader = !data || data.duel.length === 0 ? null
    : data.duel.length === 2
      ? (data.duel[0].helpfulCount >= data.duel[1].helpfulCount ? data.duel[0] : data.duel[1])
      : data.duel[0]
  const leadBy = data && data.duel.length === 2 ? Math.abs(data.duel[0].helpfulCount - data.duel[1].helpfulCount) : 0

  // v206 OIVE tier chip palette - Extreme Alpha burns gold, Verified reads
  // cyan, Crowd Audit stays quiet slate.
  const oracleChip = (o: { score: number; label: string } | undefined, side: string) => {
    if (!o) return null
    const extreme = o.score >= 90
    const verified = o.score >= 70 && !extreme
    return (
      <span
        data-testid={`arena-oracle-${side}`}
        className={
          'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-black tracking-wide ' +
          (extreme
            ? 'bg-amber-400/15 border border-amber-400/40 text-amber-300'
            : verified
              ? 'bg-cyan-400/10 border border-cyan-400/40 text-cyan-300'
              : 'bg-slate-500/10 border border-slate-400/30 text-slate-400')
        }
        title={`Oracle Score ${o.score}/100 - Spread x45 + Proof x35 + Scarcity x20`}
      >
        {extreme ? <Flame className="w-2.5 h-2.5" /> : <ShieldCheck className="w-2.5 h-2.5" />}
        {o.label.toUpperCase()} {o.score}
      </span>
    )
  }

  return (
    <Card data-testid="arena-section" className="p-4 sm:p-5 shadow-sm bg-[#141936] border-[#2a3258] text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/30 shrink-0">
            <Swords className="w-5 h-5 text-emerald-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white leading-tight">Price Arena</h2>
            <p className="text-[11px] text-slate-400 leading-tight">Vote the best deal into the match · winner takes the crown</p>
          </div>
        </div>
        {data && (
          <span data-testid="arena-countdown" title="The weekly battle resets every Monday 00:00 UTC" className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-400/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
            <Zap className="w-3 h-3" />{resetsIn}
          </span>
        )}
      </div>

      {/* Duel */}
      {loading ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the battle…
        </div>
      ) : data && data.duel.length >= 1 ? (
        <div className="mt-3 space-y-2" data-testid="arena-duel">
          <div className={"grid grid-cols-1 gap-2 sm:gap-3 items-stretch " + (data.duel.length === 2 ? "sm:grid-cols-[1fr_auto_1fr]" : "sm:max-w-md sm:mx-auto w-full")}>
            {data.duel.map((item, idx) => (
              <div key={item.id} className="contents">
                <button
                  type="button"
                  onClick={() => onOpenPost(item.id)}
                  data-testid={`arena-side-${item.side}`}
                  className={
                    'text-left rounded-lg border p-2.5 space-y-1.5 transition-colors hover:bg-card/5 ' +
                    (leader && leader.id === item.id
                      ? 'border-amber-400/60 bg-amber-400/10'
                      : 'border-[#2a3258] bg-[#0f1329]')
                  }
                >
                  <div className="flex items-center gap-2">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-md object-cover border border-[#2a3258] shrink-0" />
                    ) : (
                      <span className="w-9 h-9 rounded-md bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-[10px] font-bold text-emerald-300 shrink-0">
                        {item.currency}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{item.productName}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.currency} {item.priceMin}{item.priceMin !== item.priceMax ? `-${item.priceMax}` : ''}
                        {item.city ? ` · ${item.city}` : ''}
                      </p>
                    </div>
                    {leader && leader.id === item.id && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 min-w-0 flex-wrap">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${AVATAR_COLORS[item.author.avatarColor] || 'bg-emerald-600'}`}>
                      {item.author.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{item.author.name}</span>
                    <span data-testid={`arena-level-${item.side}`} className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-1.5 py-px text-[9px] font-bold">LVL {item.author.level}</span>
                    {/* v208: the poster's sticker class chip */}
                    {item.authorTopSticker && (
                      <span
                        data-testid={`arena-class-${item.side}`}
                        title={`${item.authorTopSticker.name} class - ${item.authorTopSticker.effect}`}
                        className={`shrink-0 rounded-full px-1.5 py-px text-[8px] font-black tracking-wide ${stickerTierChipClass(item.authorTopSticker.tier)}`}
                      >
                        {stickerTierLabel(item.authorTopSticker.tier)}
                      </span>
                    )}
                    {oracleChip(item.oracle, item.side)}
                    {typeof item.winProb === 'number' && (
                      <span data-testid={`arena-winprob-${item.side}`} className="shrink-0 rounded-full bg-teal-500/10 border border-teal-400/30 text-teal-300 px-1.5 py-px text-[9px] font-black" title="PEDA win probability from both sides' Arbitrage Depth Indices">
                        WIN {item.winProb}%
                      </span>
                    )}
                  </div>
                  {/* vote split bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold mb-0.5">
                      <span className="text-cyan-300" data-testid={`arena-pct-${item.side}`}>{item.pct}%</span>
                      <span className="text-slate-400">{item.helpfulCount} vote{item.helpfulCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#0b0f22] overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, item.pct)}%` }}
                      />
                    </div>
                  </div>
                </button>
                {idx === 0 && data.duel.length === 2 && (
                  <div className="flex sm:flex-col items-center justify-center gap-1 sm:px-0" data-testid="arena-vs">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-xs font-black tracking-wide shadow-lg shadow-emerald-500/30">VS</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Vote row: one button per side, exactly the card's vote semantics */}
          <div className="flex items-center justify-center gap-2 pt-0.5 flex-wrap">
            {data.duel.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={data.myVotes[item.id] === 'HELPFUL' ? 'default' : 'outline'}
                disabled={votingId !== null}
                onClick={() => void handleArenaVote(item.id)}
                data-testid={`arena-vote-${item.side}`}
                className={
                  'h-7 px-3 text-xs gap-1.5 ' +
                  (data.myVotes[item.id] === 'HELPFUL'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'
                    : 'bg-transparent border-[#2a3258] text-slate-300 hover:text-cyan-300 hover:border-cyan-400/40')
                }
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                {data.myVotes[item.id] === 'HELPFUL' ? 'Voted' : 'Vote'} · {item.author.name.split(' ')[0]}
              </Button>
            ))}
          </div>
          {data.duel.length === 2 && leadBy > 0 && (
            <p className="text-center text-[11px] text-slate-400">
              <span className="font-semibold text-white">{leader?.author.name.split(' ')[0]}</span> leads by {leadBy} vote{leadBy !== 1 ? 's' : ''} · winner takes the crown
            </p>
          )}
          {data.duel.length === 1 && (
            <p className="text-center text-[11px] text-slate-400" data-testid="arena-tobeat">
              <Crown className="inline w-3 h-3 text-amber-400" /> The item to beat this week - post a price, collect Helpful votes and take the crown
            </p>
          )}
          {/* v206 PEDA: escrow envelope + deterministic invite code */}
          {data.match && (
            <div data-testid="arena-invite" className="rounded-lg border border-[#2a3258] bg-[#0f1329] px-2.5 py-1.5 flex items-center justify-center gap-1.5 flex-wrap text-[9px] font-bold tracking-wide text-slate-400">
              <Swords className="w-3 h-3 text-emerald-300 shrink-0" />
              <span className="text-emerald-300" data-testid="arena-invite-code">{data.match.inviteCode}</span>
              <span className="text-slate-600">·</span>
              <span>ESCROW {data.match.escrow.pot} XP POT</span>
              <span className="text-slate-600">·</span>
              <span className="text-cyan-300">WINNER {data.match.escrow.winnerShare} XP</span>
              <span className="text-slate-600">·</span>
              <span className="text-amber-300">VOTER POOL {data.match.escrow.votersPool} XP</span>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-400 py-3" data-testid="arena-empty">
          No battle yet this week - post a price, collect Helpful votes, and the best-voted item takes the crown.
        </p>
      )}

      {/* Leaderboard */}
      {data && data.leaderboard.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#2a3258]">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            <Trophy className="w-3.5 h-3.5 text-amber-400" /> Weekly hustle board
          </p>
          <div className="space-y-1.5">
            {data.leaderboard.map((row) => (
              <div key={row.authorId} data-testid="arena-board-row" className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-bold w-5 shrink-0 ${row.rank === 1 ? 'text-amber-400' : row.rank <= 3 ? 'text-white' : 'text-slate-500'}`}>#{row.rank}</span>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${AVATAR_COLORS[row.avatarColor] || 'bg-emerald-600'}`}>
                    {row.profilePicture ? <img src={avatarSrc(row.profilePicture)} alt="" className="w-full h-full object-cover rounded-full" /> : row.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-white truncate">{row.name}</span>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 px-1.5 py-px text-[9px] font-bold" title={`${row.xp} XP · ${levelTitle(row.level)}`}>LVL {row.level}</span>
                  {/* v208: the ranked link classified by its poster's stickers */}
                  {row.topSticker && (
                    <span
                      data-testid="arena-class-chip"
                      title={`${row.topSticker.name} class - ${row.topSticker.effect}`}
                      className={`shrink-0 rounded-full px-1.5 py-px text-[8px] font-black tracking-wide ${stickerTierChipClass(row.topSticker.tier)}`}
                    >
                      {stickerTierLabel(row.topSticker.tier)}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-cyan-300 shrink-0">{row.weeklyXp} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
