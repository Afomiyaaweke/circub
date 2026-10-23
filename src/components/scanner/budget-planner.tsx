'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Calculator, Loader2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BudgetResultView } from './budget-result'
import type { BudgetResponse, ScanLocation, ScanResult } from '@/lib/types'

// Budget planner for a scanned item: turns the scan's price estimate +
// matching local price posts into a concrete "set this much aside" answer
// for the detected location, scaled by quantity and checked against the
// money the user says they have.

interface BudgetPlannerProps {
  itemName: string
  location: ScanLocation | null
  price: ScanResult['price']
  localPrices: NonNullable<ScanResult['localPrices']>
}

export function BudgetPlanner({ itemName, location, price, localPrices }: BudgetPlannerProps) {
  // The budget is part of the answer, not an extra step: the planner starts
  // open and works out the qty=1 budget on its own the moment a scan result
  // appears. 'Hide' still collapses it for people who only want the price.
  const [open, setOpen] = useState(true)
  const [qty, setQty] = useState(1)
  const [have, setHave] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BudgetResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, BudgetResponse>())
  const autoRanRef = useRef(false)

  const currency = price?.currency || 'USD'
  const place = location?.city
    ? `${location.city}${location.country ? ', ' + location.country : ''}`
    : location?.country || 'your area'

  useEffect(() => {
    if (autoRanRef.current || result || loading) return
    autoRanRef.current = true
    void calculate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function calculate() {
    setError(null)
    const trimmed = have.trim()
    const availableNum = trimmed === '' ? null : Number(trimmed)
    if (availableNum !== null && (!Number.isFinite(availableNum) || availableNum < 0)) {
      setError('Enter the money you have as a plain number, or leave it empty.')
      return
    }
    const key = JSON.stringify([itemName.toLowerCase(), qty, availableNum, location ?? {}])
    const hit = cacheRef.current.get(key)
    if (hit) {
      setResult(hit)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName,
          location: location
            ? { city: location.city, country: location.country, countryCode: location.countryCode, region: location.region }
            : null,
          quantity: qty,
          availableBudget: availableNum,
          aiHint: price
            ? { estimatedLow: price.estimatedLow, estimatedHigh: price.estimatedHigh, currency: price.currency }
            : null,
        }),
        signal: AbortSignal.timeout(55_000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Budget failed (${res.status})`)
      const budget = data as BudgetResponse
      cacheRef.current.set(key, budget)
      setResult(budget)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not calculate the budget. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    setOpen((v) => {
      const next = !v
      // First expand runs the qty=1, no-money calculation immediately so
      // the user sees a budget without a second tap.
      if (next && !autoRanRef.current && !result && !loading) {
        autoRanRef.current = true
        void calculate()
      }
      return next
    })
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/40 p-4" data-testid="budget-planner">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <Calculator className="h-4 w-4 text-emerald-600" />
        Budget planner
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
        What to set aside to buy {itemName ? <span className="font-medium text-zinc-700">{itemName}</span> : 'this'} in {place}.
      </p>

      {!open && (
        <Button
          size="sm"
          onClick={handleOpen}
          className="mt-2.5 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          data-testid="budget-toggle"
        >
          <Calculator className="h-3.5 w-3.5" />
          Plan my budget
        </Button>
      )}

      {open && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-card p-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Decrease quantity"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1 || loading}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-8 text-center text-sm font-semibold text-zinc-900" data-testid="budget-qty">{qty}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Increase quantity"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                disabled={qty >= 99 || loading}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <span className="text-[11px] text-zinc-500">how many</span>
            <Input
              value={have}
              onChange={(e) => setHave(e.target.value.replace(/[^\d.]/g, ''))}
              inputMode="decimal"
              placeholder={`Money I have (${currency})`}
              className="h-9 w-40 bg-card text-sm"
              data-testid="budget-have"
            />
            <Button
              size="sm"
              onClick={() => void calculate()}
              disabled={loading}
              className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              data-testid="budget-calc"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
              {loading ? 'Working…' : 'Calculate budget'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="h-9 px-2 text-xs text-zinc-500 hover:text-emerald-600"
            >
              Hide
            </Button>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}

          {loading && !result && (
            <p className="flex items-center gap-2 text-xs text-zinc-500" data-testid="budget-loading">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
              Working out your budget for {place}…
            </p>
          )}

          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <BudgetResultView result={result} />
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  )
}
