'use client'

// v239: the two halves of self-service password recovery.
//
// ForgotPasswordModal - "Forgot password?" from the sign-in modal. Asks for
// the email, POSTs /api/auth/forgot, and ALWAYS ends on the same reassurance
// screen (the API never leaks whether an email is registered). When the
// server has no mailer configured (delivery=unavailable) the screen says so
// honestly and points at support instead of pretending an email was sent.
//
// ResetPasswordModal - opened automatically when the app is opened at
// /?reset=<token> (the link the email contains). Two fields, one POST to
// /api/auth/reset-password, then hands the user back to sign-in with a
// success toast.

import { useState } from 'react'
import { KeyRound, Loader2, MailCheck, ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

const SUPPORT_EMAIL = 'support@tenetbid.com'

export function ForgotPasswordModal({
  open,
  onOpenChange,
  onBackToSignIn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBackToSignIn: () => void
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<null | { unavailable: boolean }>(null)
  const { toast } = useToast()

  const close = () => {
    onOpenChange(false)
    // reset the form after the dialog's close animation
    setTimeout(() => {
      setEmail('')
      setError(null)
      setDone(null)
    }, 300)
  }

  const submit = async () => {
    if (!email.trim()) {
      setError('Enter the email you registered with.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setDone({ unavailable: data.delivery !== 'sent' })
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-w-md p-5 sm:p-7 gap-0">
        {done ? (
          <>
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                {done.unavailable ? <KeyRound className="w-5 h-5 text-primary" /> : <MailCheck className="w-5 h-5 text-primary" />}
                {done.unavailable ? 'Email delivery is not set up yet' : 'Check your inbox'}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {done.unavailable
                  ? `We could not send a reset email because the mail service is not configured on the server. Email ${SUPPORT_EMAIL} from your account address and the team will reset your password.`
                  : `If ${email.trim()} belongs to an account, a reset link is on its way. Open it on this device and choose a new password - the link works for 30 minutes.`}
              </DialogDescription>
            </DialogHeader>
            <Button
              onClick={() => {
                close()
                toast({ title: done.unavailable ? 'Support can reset your password' : 'Reset link sent' })
              }}
              className="w-full h-11 bg-primary hover:bg-primary/90 gap-1.5 text-sm font-semibold"
            >
              Back to sign in <ArrowRight className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                <KeyRound className="w-5 h-5 text-primary" />
                Reset your password
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Enter your account email and we will send you a link to choose a new password.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 text-sm" role="alert">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                data-testid="forgot-email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) submit() }}
                className="h-11"
              />
            </div>

            <Button
              onClick={submit}
              disabled={busy}
              data-testid="forgot-submit"
              className="w-full h-11 mt-4 bg-primary hover:bg-primary/90 gap-1.5 text-sm font-semibold"
            >
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <>Send reset link <ArrowRight className="w-4 h-4" /></>}
            </Button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Remembered it?{' '}
              <button
                onClick={() => { close(); onBackToSignIn() }}
                className="text-primary font-medium hover:underline"
              >
                Back to sign in
              </button>
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ResetPasswordModal({
  open,
  onOpenChange,
  token,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const submit = async () => {
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not reset the password. Request a fresh link.')
        return
      }
      toast({ title: 'Password updated - sign in with your new password' })
      setPassword('')
      setConfirm('')
      onOpenChange(false)
      onDone()
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 sm:p-7 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <KeyRound className="w-5 h-5 text-primary" />
            Choose a new password
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Pick a new password for your account. It must be at least 6 characters.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">New password</label>
            <Input
              type="password"
              autoComplete="new-password"
              data-testid="reset-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Confirm new password</label>
            <Input
              type="password"
              autoComplete="new-password"
              data-testid="reset-password-confirm"
              placeholder="Repeat the new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) submit() }}
              className="h-11"
            />
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={busy}
          data-testid="reset-submit"
          className="w-full h-11 mt-4 bg-primary hover:bg-primary/90 gap-1.5 text-sm font-semibold"
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Save new password <ArrowRight className="w-4 h-4" /></>}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
