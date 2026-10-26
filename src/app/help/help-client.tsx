'use client'
// Community Help Board (v213) - the place where people ask questions and
// registered members help them with answers. Asking is open to everyone
// (visitors leave a name + email, members are auto-identified); answering
// requires an account. Style: theme tokens only (v212 discipline), teal
// accents echoing the "My Payouts & Escrow" reference pill (teal icon, bold
// dark label, rounded-full, light border).
import { useCallback, useEffect, useState } from 'react'
import { HelpCircle, Send } from 'lucide-react'

type Answer = { id: string; authorName: string; body: string; createdAt: string }
type Question = {
  id: string
  name: string
  question: string
  createdAt: string
  answers: Answer[]
}

function dayOf(iso: string) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

export function HelpClient() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ name: string } | null>(null)
  const [question, setQuestion] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [askErr, setAskErr] = useState('')
  const [asking, setAsking] = useState(false)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [answerErrs, setAnswerErrs] = useState<Record<string, string>>({})

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

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setMe(u && u.name ? { name: u.name } : null))
      .catch(() => setMe(null))
    load()
  }, [load])

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6" data-testid="help-board">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-sm">
          <HelpCircle className="h-6 w-6 text-teal-600 dark:text-teal-400" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-foreground">Community Help Board</h1>
          <p className="text-sm text-muted-foreground">
            Ask anything - registered members help you with answers.
          </p>
        </div>
      </div>

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
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          data-testid="help-ask-question"
        />
        {!me && (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={100}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40"
              data-testid="help-ask-name"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              type="email"
              maxLength={200}
              className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40"
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
  )
}
