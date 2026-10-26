'use client'
// Community Help Board (v216) - ONE page hosting BOTH help experiences with
// zero navigation between pages (user: "keep it in the same page of link
// don't take it on other page"):
//   Tab 1 "Questions & Answers" - the v213 board: anyone asks, registered
//   members help with answers.
//   Tab 2 "Instant Quests" - the v215 instant side-hustle bounties: upload
//   an instant quest ("I need help around Merkato") with a cash bounty,
//   guides 1-Click Claim and instantly receive the poster's contact.
// The separate /quests page is gone - /quests now redirects to /help#quests.
// Deep links: /help#quests opens the quest tab, /help#post-quest opens the
// quest tab with the upload form already open. Both panels stay mounted
// (inactive one is visually hidden) so every v213 + v215 testid contract
// survives on this single page.
// Style: theme tokens only (v212 discipline), teal = Q&A, emerald = quests.
import { useCallback, useEffect, useState } from 'react'
import {
  HelpCircle,
  Send,
  Zap,
  MapPin,
  Clock,
  CheckCircle2,
  Plus,
} from 'lucide-react'

type Answer = { id: string; authorName: string; body: string; createdAt: string }
type Question = {
  id: string
  name: string
  question: string
  createdAt: string
  answers: Answer[]
}
type Quest = {
  id: string
  title: string
  details: string | null
  location: string
  deadlineText: string
  bountyUsd: number
  posterName: string
  claimed: boolean
  claimedBy: string | null
  createdAt: string
}

function dayOf(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms) || ms < 0) return 'just now'
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const inputCls =
  'w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40'

const questInputCls =
  'w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40'

export function HelpClient() {
  // Shared identity (logged-in member or visitor) - drives both boards.
  const [me, setMe] = useState<{ name: string } | null>(null)
  const [tab, setTab] = useState<'qa' | 'quests'>('qa')

  // ---- Tab 1: Questions & Answers (v213, unchanged behavior) ----
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [askErr, setAskErr] = useState('')
  const [asking, setAsking] = useState(false)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [answerErrs, setAnswerErrs] = useState<Record<string, string>>({})

  // ---- Tab 2: Instant Quests (v215, ported from quests-client.tsx) ----
  const [quests, setQuests] = useState<Quest[]>([])
  const [questsLoading, setQuestsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [location, setLocation] = useState('')
  const [deadlineText, setDeadlineText] = useState('')
  const [bountyUsd, setBountyUsd] = useState('')
  const [posterName, setPosterName] = useState('')
  const [contact, setContact] = useState('')
  const [posting, setPosting] = useState(false)
  const [postErr, setPostErr] = useState('')
  const [postOk, setPostOk] = useState('')

  // 1-Click Claim flow (inline per-card form + instant contact reveal)
  const [claimFor, setClaimFor] = useState<string | null>(null)
  const [claimName, setClaimName] = useState('')
  const [claimContact, setClaimContact] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimErrs, setClaimErrs] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [locallyClaimed, setLocallyClaimed] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/help', { cache: 'no-store' })
      const data = await res.json()
      setQuestions(Array.isArray(data.questions) ? data.questions : [])
    } catch {
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadQuests = useCallback(async () => {
    try {
      const res = await fetch('/api/quests', { cache: 'no-store' })
      const data = await res.json()
      setQuests(Array.isArray(data.quests) ? data.quests : [])
    } catch {
      setQuests([])
    } finally {
      setQuestsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        setMe(u && u.name ? { name: u.name } : null)
        if (u && u.name) setClaimName((prev) => prev || u.name)
      })
      .catch(() => setMe(null))
    load()
    loadQuests()
  }, [load, loadQuests])

  // Deep links: #quests / #post-quest open the quest tab (and its form).
  useEffect(() => {
    function applyHash() {
      const h = window.location.hash
      if (h === '#quests') setTab('quests')
      else if (h === '#post-quest') {
        setTab('quests')
        setShowForm(true)
      }
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    setAskErr('')
    if (question.trim().length < 5) {
      setAskErr('Please write your question (at least 5 characters).')
      return
    }
    setAsking(true)
    try {
      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          me ? { question } : { question, name, email }
        ),
      })
      if (res.ok) {
        setQuestion('')
        setName('')
        setEmail('')
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        setAskErr(data.error || 'Failed to post your question.')
      }
    } catch {
      setAskErr('Failed to post your question.')
    } finally {
      setAsking(false)
    }
  }

  async function answer(qid: string) {
    const body = (answerDrafts[qid] || '').trim()
    setAnswerErrs((m) => ({ ...m, [qid]: '' }))
    if (body.length < 2) {
      setAnswerErrs((m) => ({ ...m, [qid]: 'Please write your answer.' }))
      return
    }
    try {
      const res = await fetch(`/api/help/${qid}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (res.ok) {
        setAnswerDrafts((m) => ({ ...m, [qid]: '' }))
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        setAnswerErrs((m) => ({ ...m, [qid]: data.error || 'Failed.' }))
      }
    } catch {
      setAnswerErrs((m) => ({ ...m, [qid]: 'Failed.' }))
    }
  }

  async function postQuest(e: React.FormEvent) {
    e.preventDefault()
    setPostErr('')
    setPostOk('')
    if (title.trim().length < 5) {
      setPostErr('Please describe the help you need (at least 5 characters).')
      return
    }
    if (!location.trim() || !deadlineText.trim()) {
      setPostErr('Location and deadline are required.')
      return
    }
    const bounty = Number(bountyUsd)
    if (!Number.isFinite(bounty) || bounty < 0.5) {
      setPostErr('Bounty must be at least $0.50.')
      return
    }
    if (!me && !posterName.trim()) {
      setPostErr('Your name is required.')
      return
    }
    if (!contact.trim()) {
      setPostErr('A contact (phone / WhatsApp / Telegram) is required so guides can reach you.')
      return
    }
    setPosting(true)
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          me
            ? { title, details, location, deadlineText, bountyUsd: bounty, contact }
            : { title, details, location, deadlineText, bountyUsd: bounty, posterName, contact }
        ),
      })
      if (res.ok) {
        setTitle(''); setDetails(''); setLocation(''); setDeadlineText('')
        setBountyUsd(''); setPosterName(''); setContact('')
        setShowForm(false)
        setPostOk('Quest is live - local guides can claim it now. You will be contacted on the channel you left.')
        await loadQuests()
      } else {
        const data = await res.json().catch(() => ({}))
        setPostErr(data.error || 'Failed to post your quest.')
      }
    } catch {
      setPostErr('Failed to post your quest.')
    } finally {
      setPosting(false)
    }
  }

  async function claim(qid: string) {
    setClaimErrs((m) => ({ ...m, [qid]: '' }))
    if (!claimName.trim() || !claimContact.trim()) {
      setClaimErrs((m) => ({
        ...m,
        [qid]: 'Your name and a contact are required to claim.',
      }))
      return
    }
    setClaiming(true)
    try {
      const res = await fetch(`/api/quests/${qid}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimerName: claimName, claimerContact: claimContact }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        // Instant contact: show the poster's channel right away.
        setRevealed((m) => ({ ...m, [qid]: data.posterContact || '' }))
        setLocallyClaimed((m) => ({ ...m, [qid]: true }))
        setClaimFor(null)
        setClaimName(me ? me.name : '')
        setClaimContact('')
        await loadQuests()
      } else {
        setClaimErrs((m) => ({ ...m, [qid]: data.error || 'Failed to claim.' }))
        if (res.status === 409) await loadQuests()
      }
    } catch {
      setClaimErrs((m) => ({ ...m, [qid]: 'Failed to claim.' }))
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6" data-testid="help-board">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-sm">
          <HelpCircle className="h-6 w-6 text-teal-600 dark:text-teal-400" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">Community Help Board</h1>
          <p className="text-sm text-muted-foreground">
            Ask anything - registered members help you with answers. Or post an
            instant quest with a cash bounty and get paid help, right away.
          </p>
        </div>
      </div>

      {/* Same-page tab bar: switching tabs never navigates away. */}
      <div
        className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-card p-1 shadow-sm"
        data-testid="help-tabs"
      >
        <button
          type="button"
          onClick={() => setTab('qa')}
          data-testid="help-tab-qa"
          className={
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors ' +
            (tab === 'qa'
              ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          <HelpCircle className="h-4 w-4" />
          Questions &amp; Answers
        </button>
        <button
          type="button"
          onClick={() => setTab('quests')}
          data-testid="help-tab-quests"
          className={
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors ' +
            (tab === 'quests'
              ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          <Zap className="h-4 w-4" />
          Instant Quests · Get paid to help
        </button>
      </div>

      {/* ============ TAB 1: Questions & Answers (v213) ============ */}
      <div className={tab === 'qa' ? 'space-y-6' : 'hidden'}>
        <form
          onSubmit={ask}
          className="bg-card rounded-2xl border border-border p-5 shadow-sm space-y-3"
          data-testid="help-ask-form"
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you want to ask?"
            rows={3}
            maxLength={1000}
            className={inputCls}
            data-testid="help-ask-question"
          />
          {!me && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
                className={inputCls}
                data-testid="help-ask-name"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                type="email"
                maxLength={200}
                className={inputCls}
                data-testid="help-ask-email"
              />
            </div>
          )}
          {askErr && (
            <p className="text-sm text-red-600 dark:text-red-400" data-testid="help-ask-error">
              {askErr}
            </p>
          )}
          <button
            type="submit"
            disabled={asking}
            className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:hover:bg-teal-600"
            data-testid="help-ask-submit"
          >
            <Send className="h-4 w-4" />
            {asking ? 'Posting...' : 'Post question'}
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-muted-foreground" data-testid="help-loading">
            Loading questions...
          </p>
        ) : questions.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="help-empty">
            No questions yet - be the first to ask.
          </p>
        ) : (
          <div className="space-y-4" data-testid="help-question-list">
            {questions.map((q) => (
              <div
                key={q.id}
                className="bg-card rounded-2xl border border-border p-5 shadow-sm space-y-3"
                data-testid="help-question-card"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-600/10 text-sm font-bold text-teal-700 dark:bg-teal-400/10 dark:text-teal-300">
                    {(q.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{q.name}</p>
                    <p className="text-xs text-muted-foreground">{dayOf(q.createdAt)}</p>
                  </div>
                  <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground" data-testid="help-answer-count">
                    {q.answers.length} {q.answers.length === 1 ? 'answer' : 'answers'}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{q.question}</p>

                {q.answers.length > 0 && (
                  <div className="space-y-2.5" data-testid="help-answer-list">
                    {q.answers.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-r-xl border-l-2 border-teal-500/60 bg-muted/50 px-3.5 py-2.5"
                        data-testid="help-answer-item"
                      >
                        <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                          {a.authorName}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {dayOf(a.createdAt)}
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{a.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {me ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      answer(q.id)
                    }}
                    className="flex gap-2"
                    data-testid="help-answer-form"
                  >
                    <input
                      value={answerDrafts[q.id] || ''}
                      onChange={(e) =>
                        setAnswerDrafts((m) => ({ ...m, [q.id]: e.target.value }))
                      }
                      placeholder={`Answer as ${me.name}...`}
                      maxLength={2000}
                      className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                      data-testid="help-answer-input"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal-600/40 bg-teal-600/10 px-4 py-2 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-600/20 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300"
                      data-testid="help-answer-submit"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Help answer
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="help-login-hint">
                    Log in to help answer.
                  </p>
                )}
                {answerErrs[q.id] && (
                  <p className="text-sm text-red-600 dark:text-red-400">{answerErrs[q.id]}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============ TAB 2: Instant Quests (v215, same page now) ============ */}
      <div className={tab === 'quests' ? 'space-y-6' : 'hidden'} data-testid="quests-board">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-sm">
            <Zap className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">Instant Side-Hustle Bounties</h2>
            <p className="text-sm text-muted-foreground">
              Need a hand right now? Post an instant quest with a cash bounty -
              travelers post, local guides claim and contact you instantly.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" data-testid="quests-badges">
          <span className="rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 px-2.5 py-0.5 text-[11px] font-bold">
            1-Click Claim
          </span>
          <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 px-2.5 py-0.5 text-[11px] font-bold">
            Funds escrowed by the poster
          </span>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-foreground">
            Paid on completion
          </span>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            data-testid="quest-post-toggle"
          >
            <Plus className="h-4 w-4" />
            Post an Instant Quest
          </button>
        </div>

        {postOk && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" data-testid="quest-post-ok">
            {postOk}
          </p>
        )}

        {showForm && (
          <form
            onSubmit={postQuest}
            className="bg-card rounded-2xl border border-border p-5 shadow-sm space-y-3"
            data-testid="quest-post-form"
          >
            <p className="text-sm font-bold text-foreground">Upload an instant quest - ask for help, offer a bounty</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you need? e.g. I need help around Merkato - carry bags & bargain"
              maxLength={200}
              className={questInputCls}
              data-testid="quest-input-title"
            />
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Details (optional) - what exactly should the helper do, where to meet, how you pay"
              rows={2}
              maxLength={1000}
              className={questInputCls}
              data-testid="quest-input-details"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location - e.g. Merkato, Addis"
                maxLength={120}
                className={questInputCls}
                data-testid="quest-input-location"
              />
              <input
                value={deadlineText}
                onChange={(e) => setDeadlineText(e.target.value)}
                placeholder="Deadline - e.g. Today by 5 PM"
                maxLength={120}
                className={questInputCls}
                data-testid="quest-input-deadline"
              />
              <input
                value={bountyUsd}
                onChange={(e) => setBountyUsd(e.target.value)}
                placeholder="Bounty in USD - e.g. 15"
                type="number"
                min="0.5"
                step="0.5"
                className={questInputCls}
                data-testid="quest-input-bounty"
              />
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Your contact - phone / WhatsApp / Telegram"
                maxLength={200}
                className={questInputCls}
                data-testid="quest-input-contact"
              />
              {!me && (
                <input
                  value={posterName}
                  onChange={(e) => setPosterName(e.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                  className={questInputCls}
                  data-testid="quest-input-name"
                />
              )}
            </div>
            {postErr && (
              <p className="text-sm text-red-600 dark:text-red-400" data-testid="quest-post-error">
                {postErr}
              </p>
            )}
            <button
              type="submit"
              disabled={posting}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
              data-testid="quest-post-submit"
            >
              <Send className="h-4 w-4" />
              {posting ? 'Posting...' : 'Post quest'}
            </button>
          </form>
        )}

        {questsLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="quests-loading">
            Loading bounties...
          </p>
        ) : quests.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="quests-empty">
            No open bounties yet - be the first to post an instant quest.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="quest-list">
            {quests.map((q) => {
              const isClaimed = q.claimed || locallyClaimed[q.id]
              return (
                <article
                  key={q.id}
                  className="bg-card rounded-2xl border border-border p-4 shadow-sm flex flex-col"
                  data-testid="quest-card"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold text-foreground">
                      <MapPin className="w-3 h-3" />
                      {q.location}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                      <Clock className="w-3 h-3" />
                      {q.deadlineText}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-foreground leading-snug" data-testid="quest-card-title">
                    {q.title}
                  </h3>
                  {q.details && (
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed flex-1">{q.details}</p>
                  )}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Posted by <span className="font-semibold text-foreground">{q.posterName}</span> · {timeAgo(q.createdAt)}
                  </p>
                  <div className="mt-3">
                    <p className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Escrow reward</p>
                    <p className="text-lg font-extrabold text-foreground" data-testid="bounty-amount">
                      ${q.bountyUsd.toFixed(2)}
                    </p>
                  </div>
                  {isClaimed ? (
                    <div
                      className="mt-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                      data-testid="quest-claimed"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Claimed{q.claimedBy && !locallyClaimed[q.id] ? ` by ${q.claimedBy}` : ''} - payout on completion
                      </p>
                      {revealed[q.id] && (
                        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200" data-testid="quest-contact-reveal">
                          Contact the poster now: <span className="font-bold">{revealed[q.id]}</span>
                        </p>
                      )}
                    </div>
                  ) : claimFor === q.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        claim(q.id)
                      }}
                      className="mt-1 space-y-2"
                      data-testid="quest-claim-form"
                    >
                      <input
                        value={claimName}
                        onChange={(e) => setClaimName(e.target.value)}
                        placeholder="Your name"
                        maxLength={100}
                        className={questInputCls}
                        data-testid="quest-claim-name"
                      />
                      <input
                        value={claimContact}
                        onChange={(e) => setClaimContact(e.target.value)}
                        placeholder="Your contact - phone / WhatsApp / Telegram"
                        maxLength={200}
                        className={questInputCls}
                        data-testid="quest-claim-contact"
                      />
                      {claimErrs[q.id] && (
                        <p className="text-xs text-red-600 dark:text-red-400">{claimErrs[q.id]}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={claiming}
                          className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                          data-testid="quest-claim-submit"
                        >
                          {claiming ? 'Claiming...' : 'Claim & get contact'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setClaimFor(null)}
                          className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setClaimFor(q.id)}
                      className="mt-1 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                      data-testid="quest-claim-btn"
                    >
                      Claim Bounty
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
