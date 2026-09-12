'use client'

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TagInputProps {
  /** Current list of tags. */
  value: string[]
  /** Called whenever the list changes (add / remove / reorder). */
  onChange: (next: string[]) => void
  /** Placeholder for the text input. */
  placeholder?: string
  /** Optional hint shown below the input. */
  hint?: string
  /** Allowable separators when the user pastes a list. Default: comma + Enter. */
  className?: string
  /** Input element id (useful for tour / label wiring). */
  inputId?: string
}

/**
 * Free-text tag input. The user types whatever they want and presses Enter
 * (or comma) to add it as a removable chip. No pre-defined list — the owner
 * fills in their own values. Backspace on an empty input removes the last tag.
 */
export function TagInput({ value, onChange, placeholder, hint, className, inputId }: TagInputProps) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const cleaned = raw.trim().replace(/,+$/, '').trim()
    if (!cleaned) return
    // De-dupe (case-insensitive) and cap at 30 entries.
    const lower = cleaned.toLowerCase()
    if (value.some((v) => v.toLowerCase() === lower)) return
    if (value.length >= 30) return
    onChange([...value, cleaned])
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
      setDraft('')
      return
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      // Remove the last tag on backspace-when-empty (familiar UX).
      onChange(value.slice(0, -1))
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes(',') && !text.includes('\n')) return // let normal paste happen
    e.preventDefault()
    const parts = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    const merged = [...value]
    for (const p of parts) {
      const lower = p.toLowerCase()
      if (merged.some((v) => v.toLowerCase() === lower)) continue
      if (merged.length >= 30) break
      merged.push(p)
    }
    onChange(merged)
    setDraft('')
  }

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
        onClick={() => document.getElementById(inputId || '')?.focus()}
      >
        {value.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary border border-primary/20"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(idx) }}
              aria-label={`Remove ${tag}`}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-primary/70 transition hover:bg-primary/20 hover:text-primary"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <Input
          id={inputId}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={value.length === 0 ? placeholder : 'Add another…'}
          className="h-7 flex-1 min-w-[120px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      {hint && <p className="text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}
