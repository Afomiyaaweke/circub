'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Mail, Lock, User, X, Loader2, ArrowRight } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { startGoogleSignIn } from '@/lib/google-signin'
import { useLanguage } from '@/lib/i18n'

interface RegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthed: (user: any) => void
  onSwitchToLogin: () => void
}

/**
 * Minimal sign-up form — just Name, Email, Password + Terms.
 * Everything else (headline, location, phone, bio, username, roles) can be
 * filled in later from Edit profile. The goal is to get the user signed up
 * in under 15 seconds.
 */
export function RegisterModal({ open, onOpenChange, onAuthed, onSwitchToLogin }: RegisterModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { toast } = useToast()
  const { t } = useLanguage()

  // Fetch Google OAuth availability once on mount.
  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => setGoogleConfigured(Boolean(d?.google?.configured)))
      .catch(() => setGoogleConfigured(false))
  }, [])

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
    setAgreed(false)
  }

  const handleSubmit = async () => {
    if (!agreed) {
      toast({
        title: 'Please confirm',
        description: 'Tick the box to agree to the Terms before continuing.',
        variant: 'destructive',
      })
      return
    }
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    if (!email.trim() || !password) {
      toast({
        title: 'Missing credentials',
        description: 'Email and password are required.',
        variant: 'destructive',
      })
      return
    }
    if (password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      // Auto-generate a username from the name (the API accepts no username
      // and will derive one). Personal account, default local role.
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType: 'PERSONAL',
          name: name.trim(),
          email: email.trim(),
          password,
          acceptedTerms: true,
          guideRoles: ['local'],
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed')
      }
      toast({
        title: `Welcome, ${data.user.name}!`,
        // v225: the API derives the handle from the name now - tell people
        // what it is, so the next sign-in works with email OR @handle.
        description: data.user?.username
          ? `Your account is ready. Your handle is @${data.user.username} - sign in with it or your email.`
          : 'Your account is ready. You can finish your profile anytime.',
      })
      reset()
      onOpenChange(false)
      onAuthed(data.user)
    } catch (e) {
      toast({
        title: 'Registration failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogle = async () => {
    if (!agreed) {
      toast({
        title: 'Please confirm',
        description: 'Tick the box to agree to the Terms before continuing with Google.',
        variant: 'destructive',
      })
      return
    }
    setGoogleLoading(true)
    const ok = await startGoogleSignIn()
    if (!ok) {
      setGoogleLoading(false)
      toast({
        title: 'Google sign-in unavailable',
        description: 'Google OAuth is not configured on this server. Use email + password instead.',
        variant: 'destructive',
      })
    }
    // If ok, the browser is navigating away to Google — leave loading state on.
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto scrollbar-thin p-5 sm:p-7 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            Join circubAwd
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('reg.joinSubtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Google sign-in (only if configured) */}
        {googleConfigured && (
          <>
            <Button
              onClick={handleGoogle}
              disabled={googleLoading || submitting}
              variant="outline"
              className="w-full h-11 mb-3 gap-2 rounded-lg text-sm font-medium"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </Button>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        {/* Simple form: Name, Email, Password */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleSubmit() }}
                className="pl-9 h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleSubmit() }}
                className="pl-9 h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleSubmit() }}
                className="pl-9 h-11"
              />
            </div>
          </div>
        </div>

        {/* Terms */}
        <label className="mt-4 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
          />
          <span className="text-[11px] leading-relaxed text-muted-foreground">
            I agree to the <a href="/terms" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </span>
        </label>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || !agreed}
          className="w-full h-11 mt-4 bg-primary hover:bg-primary/90 gap-1.5 text-sm font-semibold"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
          ) : (
            <>Create account <ArrowRight className="w-4 h-4" /></>
          )}
        </Button>

        {/* Switch to login */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <button
            onClick={onSwitchToLogin}
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </button>
        </p>
      </DialogContent>
    </Dialog>
  )
}
