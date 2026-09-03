'use client'

import { useState } from 'react'
import { Mail, Lock, ArrowRight, Sparkles } from 'lucide-react'
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

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthed: (user: any) => void
  onSwitchToRegister: () => void
}

export function LoginModal({ open, onOpenChange, onAuthed, onSwitchToRegister }: LoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      toast({ title: 'Missing credentials', variant: 'destructive' })
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
        throw new Error(data.error || 'Login failed')
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
      toast({
        title: 'Login failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                }}
                className="pl-9"
              />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary/90 gap-2 h-11"
          >
            {submitting ? 'Signing in...' : (
              <>
                Sign in
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground pt-2">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => {
                setEmail('')
                setPassword('')
                onOpenChange(false)
                onSwitchToRegister()
              }}
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
