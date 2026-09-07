'use client'

import { useState } from 'react'
import { User, Building2, Mail, Lock, MapPin, Briefcase, Globe, X, Sparkles, UserCircle, ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface RegisterModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthed: (user: any) => void
  onSwitchToLogin: () => void
}

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+']

export function RegisterModal({ open, onOpenChange, onAuthed, onSwitchToLogin }: RegisterModalProps) {
  const [tab, setTab] = useState<'PERSONAL' | 'COMPANY'>('PERSONAL')
  // Personal fields
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  // Company fields
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [companyIndustry, setCompanyIndustry] = useState('')
  // Shared
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const reset = () => {
    setName('')
    setHeadline('')
    setLocation('')
    setBio('')
    setCompanyName('')
    setContactName('')
    setCompanyWebsite('')
    setCompanySize('')
    setCompanyIndustry('')
    setEmail('')
    setPassword('')
  }

  const handleSubmit = async () => {
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
    if (tab === 'PERSONAL' && !name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    if (tab === 'COMPANY' && !companyName.trim()) {
      toast({ title: 'Company name required', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const body: any = {
        accountType: tab,
        email,
        password,
      }
      if (tab === 'PERSONAL') {
        body.name = name
        body.headline = headline
        body.location = location
        body.bio = bio
      } else {
        body.companyName = companyName
        body.contactName = contactName
        body.companyWebsite = companyWebsite
        body.companySize = companySize
        body.companyIndustry = companyIndustry
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed')
      }
      toast({
        title: `Welcome, ${data.user.name}!`,
        description: tab === 'COMPANY' ? 'Company account created.' : 'Your personal account is ready.',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin p-6 sm:p-8 gap-0">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-primary" />
            Join circub
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Create your free account in seconds. Choose between a personal profile or a company page.
          </DialogDescription>
        </DialogHeader>

        {/* Tab toggle */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() => setTab('PERSONAL')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all',
              tab === 'PERSONAL'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/40 hover:bg-accent/40'
            )}
          >
            <div className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
              tab === 'PERSONAL' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            )}>
              <User className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Personal</p>
              <p className="text-[11px] text-muted-foreground">Travelers & locals</p>
            </div>
          </button>
          <button
            onClick={() => setTab('COMPANY')}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all',
              tab === 'COMPANY'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/40 hover:bg-accent/40'
            )}
          >
            <div className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
              tab === 'COMPANY' ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'
            )}>
              <Building2 className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Company</p>
              <p className="text-[11px] text-muted-foreground">Businesses & brands</p>
            </div>
          </button>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          {tab === 'PERSONAL' ? (
            <>
              <Field
                label="Full name *"
                icon={UserCircle}
                placeholder="e.g. MA Rahman"
                value={name}
                onChange={setName}
              />
              <Field
                label="Headline (optional)"
                icon={Briefcase}
                placeholder="e.g. Verified Local • Traveler • Food enthusiast"
                value={headline}
                onChange={setHeadline}
              />
              <Field
                label="Location (optional)"
                icon={MapPin}
                placeholder="e.g. Kuala Lumpur, Malaysia"
                value={location}
                onChange={setLocation}
              />
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Bio (optional)</label>
                <Textarea
                  placeholder="Tell the community who you are and what you know..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="min-h-[70px] resize-y"
                />
              </div>
            </>
          ) : (
            <>
              <Field
                label="Company name *"
                icon={Building2}
                placeholder="e.g. Yirgacheffe Coffee Co-op"
                value={companyName}
                onChange={setCompanyName}
              />
              <Field
                label="Contact person (optional)"
                icon={User}
                placeholder="e.g. Operations Manager"
                value={contactName}
                onChange={setContactName}
              />
              <Field
                label="Website (optional)"
                icon={Globe}
                placeholder="https://example.com"
                value={companyWebsite}
                onChange={setCompanyWebsite}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Industry</label>
                  <Input
                    placeholder="Coffee Export"
                    value={companyIndustry}
                    onChange={(e) => setCompanyIndustry(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Company size</label>
                  <Select value={companySize} onValueChange={setCompanySize}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((s) => (
                        <SelectItem key={s} value={s}>{s} employees</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {/* Shared credentials */}
          <div className="pt-4 border-t border-border space-y-4">
            <Field
              label="Email *"
              icon={Mail}
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={setEmail}
            />
            <Field
              label="Password *"
              icon={Lock}
              placeholder="At least 6 characters"
              type="password"
              value={password}
              onChange={setPassword}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 space-y-3">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-primary hover:bg-primary/90 gap-2 h-11"
          >
            {submitting ? 'Creating account...' : (
              <>
                Create {tab === 'PERSONAL' ? 'Personal' : 'Company'} Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>

          {/* Divider + Google */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <Button
            onClick={() => { window.location.href = '/api/auth/signin/google' }}
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

          <p className="text-xs text-center text-muted-foreground">
            Already have an account?{' '}
            <button
              onClick={() => {
                reset()
                onOpenChange(false)
                onSwitchToLogin()
              }}
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  icon: Icon,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  icon: typeof Mail
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  )
}
