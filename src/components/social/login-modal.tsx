'use client'

import { useState, useEffect } from 'react'
import { Mail, Lock, ArrowRight, Sparkles, Eye, EyeOff, Loader2 } from 'lucide-react'
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
import { useLanguage } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { startGoogleSignIn } from '@/lib/google-signin'

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthed: (user: any) => void
  onSwitchToRegister: () => void
}

/**
 * Minimal sign-in form — just Email + Password.
 * No Terms gate on sign-in (the user already agreed at sign-up; signing in
 * is not a new legal action). The button is always enabled so users never
 * see a "dead" button.
 */
export function LoginModal({ open, onOpenChange, onAuthed, onSwitchToRegister }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null)
  const { toast } = useToast()
  const { t } = useLanguage()

  // Fetch Google OAuth availability once on mount so we can hide the
  // "Continue with Google" button when it isn't actually configured.
  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => setGoogleConfigured(Boolean(d?.google?.configured)))
      .catch(() => setGoogleConfigured(false))
  }, [])

  useEffect(() => { if (formError) setFormError(null) }, [email, password])

  const handleSubmit = async () => {
    setFormError(null)
    if (!email.trim() || !password) {
      setFormError('Please enter your email and password.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Login failed. Please check your email and password.')
        return
      }
      toast({ title: `Welcome back, ${data.user.name}!` })
      setEmail('')
      setPassword('')
      onOpenChange(false)
      onAuthed(data.user)
    } catch (e) {
      setFormError((e as Error).message || 'Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (googleConfigured === false) {
      toast({
        title: 'Google sign-in unavailable',
        description: 'Google OAuth is not configured on the server. Use email + password.',
        variant: 'destructive',
      })
      return
    }
    setGoogleLoading(true)
    const ok = await startGoogleSignIn()
    if (!ok) {
      setGoogleLoading(false)
      toast({
        title: 'Google sign-in failed',
        description: 'Could not start Google sign-in. Please try again, or use email + password.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 sm:p-7 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            {t('login.welcomeBack')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('login.signInTo')}
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 flex items-start gap-2.5 text-sm" role="alert">
            <span className="flex-1 leading-relaxed">{formError}</span>
          </div>
        )}

        {/* Google Sign In - only render if configured */}
        {googleConfigured === true && (
          <>
            <Button
              onClick={handleGoogleSignIn}
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
        {googleConfigured === false && (
          <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
            <span className="flex-1 leading-relaxed">
              <strong>Google sign-in unavailable.</strong> The server is missing the Google OAuth client secret. Use email + password instead.
            </span>
          </div>
        )}

        {/* Email + Password */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('login.email')}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
            <label className="text-xs font-medium text-muted-foreground">{t('login.password')}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleSubmit() }}
                className="pl-9 pr-9 h-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Submit — always enabled so the button never looks dead */}
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-11 mt-4 bg-primary hover:bg-primary/90 gap-1.5 text-sm font-semibold"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
          ) : (
            <>Sign in <ArrowRight className="w-4 h-4" /></>
          )}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <button
            onClick={() => { setEmail(''); setPassword(''); setFormError(null); onOpenChange(false); onSwitchToRegister() }}
            className="text-primary font-medium hover:underline"
          >
            {t('login.signUpFree')}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  )
}
