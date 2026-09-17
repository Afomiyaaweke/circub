'use client'

// "Deactivate account" modal - opened from the header menu, right next to
// Sign out. Asks WHY the user is leaving (required), then:
//   1. POST /api/auth/deactivate { reason }  → soft-off + the reason lands in
//      the contact-us inbox (ContactMessage - the same channel the /contact
//      page writes to).
//   2. Shows a confirmation with an optional "open in email app" mailto link
//      to support@tenetbid.com with the reason pre-filled, so the user also
//      has a direct email trail.
//   3. onDeactivated() → the app signs the user out.
import { useState } from 'react'
import { UserX, Mail, ArrowRight, Loader2, CircleCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const SUPPORT_EMAIL = 'support@tenetbid.com'

// Quick-pick reasons - one tap fills the textarea (still editable).
const QUICK_REASONS = [
  'I no longer need circub',
  'Privacy concerns',
  'I found another platform',
  'Too many notifications',
]

interface DeactivateAccountModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { name?: string | null; email?: string | null } | null
  onDeactivated: () => void
}

export function DeactivateAccountModal({
  open,
  onOpenChange,
  user,
  onDeactivated,
}: DeactivateAccountModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [mailtoHref, setMailtoHref] = useState('')
  const { toast } = useToast()

  const mailBody = [
    `Hi circub team,`,
    ``,
    `I want to deactivate my account.`,
    `Account: ${user?.name || ''} (${user?.email || ''})`,
    `Reason: ${reason}`,
    ``,
    `Thanks.`,
  ].join('\n')

  const reset = () => {
    setReason('')
    setSubmitting(false)
    setDone(false)
    setMailtoHref('')
  }

  const handleSubmit = async () => {
    if (reason.trim().length < 3) {
      toast({
        title: 'Please tell us why',
        description: 'A short reason helps the team improve circub.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate your account')

      // Direct email trail - pre-filled "contact us" email the user can send.
      const params = new URLSearchParams({
        subject: 'Account deactivation request',
        body: mailBody,
      })
      setMailtoHref(`mailto:${SUPPORT_EMAIL}?${params.toString()}`)
      setDone(true)
    } catch (e) {
      toast({
        title: 'Could not deactivate',
        description: (e as Error).message,
        variant: 'destructive',
      })
      setSubmitting(false)
    }
  }

  const finish = () => {
    onOpenChange(false)
    // Give the dialog a beat to close before the app signs the user out.
    setTimeout(() => {
      onDeactivated()
      reset()
    }, 150)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !done) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-md p-4 sm:p-6 md:p-8 gap-0">
        {done ? (
          <>
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                <CircleCheck className="w-5 h-5 text-emerald-600" />
                Account deactivated
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Your reason was sent to our team at{' '}
                <span className="font-medium text-foreground">{SUPPORT_EMAIL}</span>. You have been
                signed out - we are sorry to see you go.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <a
                href={mailtoHref || `mailto:${SUPPORT_EMAIL}`}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-md border border-border bg-accent/40 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Mail className="w-4 h-4 text-primary" />
                Also open the email in my mail app
              </a>
              <Button onClick={finish} className="w-full h-11 gap-2">
                Done <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                <UserX className="w-5 h-5 text-destructive" />
                Deactivate your account?
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                You will be signed out and won&apos;t be able to sign back in. Your posts stay
                visible. Deactivation is reversible - email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-medium hover:underline">
                  {SUPPORT_EMAIL}
                </a>{' '}
                any time.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground">
                Why are you leaving? <span className="text-destructive">*</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      'px-2.5 py-1 rounded-full border text-xs transition-colors',
                      reason === r
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us what went wrong or what we could do better…"
                rows={4}
                maxLength={2000}
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Your reason is sent to our contact-us inbox so the team can act on it.
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitting || reason.trim().length < 3}
                variant="destructive"
                className="w-full h-11 gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Deactivating…
                  </>
                ) : (
                  <>
                    <UserX className="w-4 h-4" /> Deactivate account
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => {
                  reset()
                  onOpenChange(false)
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1"
              >
                Keep my account
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
