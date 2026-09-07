'use client'

import { useState, useEffect } from 'react'
import { Mail, Lock, ArrowRight, Sparkles, Eye, EyeOff } from 'lucide-react'
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

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthed: (user: any) => void
  onSwitchToRegister: () => void
}

export function LoginModal({ open, onOpenChange, onAuthed, onSwitchToRegister }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()

  useEffect(() => { if (formError) setFormError(null) }, [email, password])
  useEffect(() => { if (fieldErrors && Object.keys(fieldErrors).length > 0) setFieldErrors({}) }, [email, password])

  const handleSubmit = async () => {
    setFormError(null)
    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = 'Email is required'
    if (!password) errors.password = 'Password is required'
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Login failed. Please check your email and password and try again.')
        return
      }
      toast({
        title: `Welcome back, ${data.user.name}!`,
        description: data.user.accountType === 'COMPANY' ? `Signed in as ${data.user.companyName}` : undefined,
      })
      setEmail('')
      setPassword('')
      onOpenChange(false)
      onAuthed(data.user)
    } catch (e) {
      setFormError((e as Error).message || 'Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleSignIn = () => {
    // Redirect to NextAuth Google sign-in
    window.location.href = '/api/auth/signin/google'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            Welcome back
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Sign in to your circub account.
          </DialogDescription>
        </DialogHeader>

        {formError && (
          <div className="mb-4 p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 flex items-start gap-2.5 text-sm" role="alert">
            <span className="flex-1 leading-relaxed">{formError}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Google Sign In */}
          <Button
            onClick={handleGoogleSignIn}
            variant="outline"
            className="w-full h-11 gap-2 border-border hover:bg-accent"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email + Password */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Email</label>
            <div className="relative">
              <Mail className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none', fieldErrors.email ? 'text-red-500' : 'text-muted-foreground')} />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                className={cn('pl-9', fieldErrors.email && 'border-red-500 focus:border-red-500')}
              />
            </div>
            {fieldErrors.email && <p className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Password</label>
            <div className="relative">
              <Lock className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none', fieldErrors.password ? 'text-red-500' : 'text-muted-foreground')} />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                className={cn('pl-9 pr-9', fieldErrors.password && 'border-red-500 focus:border-red-500')}
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
            {fieldErrors.password && <p className="text-xs text-red-600 mt-1">{fieldErrors.password}</p>}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary/90 gap-2 h-11"
          >
            {submitting ? 'Signing in...' : <>Sign in <ArrowRight className="w-4 h-4" /></>}
          </Button>

          <p className="text-xs text-center text-muted-foreground pt-2">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => { setEmail(''); setPassword(''); setFormError(null); onOpenChange(false); onSwitchToRegister() }}
              className="text-primary font-medium hover:underline"
            >
              Sign up free
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
