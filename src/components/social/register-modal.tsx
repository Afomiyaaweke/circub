'use client'

import { useState, useEffect } from 'react'
import { User, Building2, Mail, Lock, MapPin, Briefcase, Globe, X, Sparkles, UserCircle, ArrowRight, Phone, MessageCircle } from 'lucide-react'
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
import { normalizeUsername, validateUsername } from '@/lib/username'
import { AtSign, Check, Loader2 } from 'lucide-react'

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
  // Contact channels (same as local price posts: phone / email / WhatsApp)
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
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
  // Username: the shareable profile handle (circub.app/u/<username>).
  // Auto-suggested from the name / company name until the user edits it.
  const [username, setUsername] = useState('')
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [uStatus, setUStatus] = useState<'idle' | 'checking' | 'available' | 'error'>('idle')
  const [uMsg, setUMsg] = useState('')
  // Legal gate: the Terms of Service + Privacy Policy must be confirmed
  // before an account can be created.
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null)
  const { toast } = useToast()

  // Fetch Google OAuth availability once on mount.
  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d) => setGoogleConfigured(Boolean(d?.google?.configured)))
      .catch(() => setGoogleConfigured(false))
  }, [])

  // Auto-suggest a handle from the display name until the user edits it.
  useEffect(() => {
    if (usernameTouched) return
    const source = tab === 'PERSONAL' ? name : companyName
    setUsername(normalizeUsername(source))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, companyName, tab, usernameTouched])

  // Live availability check (debounced) -- same probe the Edit profile uses.
  useEffect(() => {
    if (!username) { setUStatus('idle'); setUMsg(''); return }
    const check = validateUsername(username)
    if (!check.ok) { setUStatus('error'); setUMsg(check.error); return }
    setUStatus('checking'); setUMsg('Checking availability...')
    const t = setTimeout(() => {
      fetch(`/api/users/check-username?u=${encodeURIComponent(check.username)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.available) { setUStatus('available'); setUMsg('circub.app/u/' + d.username + ' is free') }
          else { setUStatus('error'); setUMsg(d?.error || 'That username is already taken - please pick another') }
        })
        .catch(() => { setUStatus('idle'); setUMsg('') })
    }, 400)
    return () => clearTimeout(t)
  }, [username])

  const reset = () => {
    setName('')
    setHeadline('')
    setLocation('')
    setPhone('')
    setWhatsapp('')
    setBio('')
    setCompanyName('')
    setContactName('')
    setCompanyWebsite('')
    setCompanySize('')
    setCompanyIndustry('')
    setEmail('')
    setPassword('')
    setUsername('')
    setUsernameTouched(false)
    setUStatus('idle')
    setUMsg('')
  }

  const handleSubmit = async () => {
    if (!agreed) {
      toast({
        title: 'Please confirm first',
        description: 'You must agree to the Terms of Service and Privacy Policy before creating an account.',
        variant: 'destructive',
      })
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
    const uCheck = validateUsername(username)
    if (!uCheck.ok) {
      toast({ title: 'Username needed', description: uCheck.error, variant: 'destructive' })
      return
    }
    if (uStatus === 'error') {
      toast({ title: 'Username unavailable', description: uMsg || 'Please pick another username.', variant: 'destructive' })
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
        acceptedTerms: true,
        username: uCheck.username,
      }
      if (tab === 'PERSONAL') {
        body.name = name
        body.headline = headline
        body.location = location
        body.phone = phone
        body.whatsapp = whatsapp
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
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin p-4 sm:p-6 md:p-8 gap-0">
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
              {/* Contact channels — same as local price posts (phone / email / WhatsApp) */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-primary" />Contact information <span className="font-normal text-muted-foreground">(optional)</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Phone</label>
                    <Input type="tel" placeholder="+251 911 234 567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</label>
                    <Input placeholder="wa.me/251911234567" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Shown on your profile so others can reach you. You can change it later in Edit profile.</p>
              </div>
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
            {/* Username: the unique ID that makes the profile shareable */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><AtSign className="w-3.5 h-3.5" />Username *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">@</span>
                <Input
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => { setUsernameTouched(true); setUsername(normalizeUsername(e.target.value)) }}
                  className={cn('pl-7 pr-9', uStatus === 'available' && 'border-green-500/60 focus-visible:ring-green-500/40', uStatus === 'error' && 'border-destructive/60 focus-visible:ring-destructive/40')}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {uStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {uStatus === 'available' && <Check className="w-4 h-4 text-green-600" />}
                </span>
              </div>
              {uMsg ? (
                <p className={cn('text-[10px]', uStatus === 'available' && 'text-green-600', uStatus === 'error' && 'text-destructive', (uStatus === 'checking' || uStatus === 'idle') && 'text-muted-foreground')}>{uMsg}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">Your unique ID — people find and share your profile at circub.app/u/<span className="font-semibold">{username || 'yourname'}</span>. Lowercase letters, numbers, underscores.</p>
              )}
            </div>
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
          {/* Legal confirmation — required before the account can be created */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg border border-border bg-accent/40 p-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-primary cursor-pointer"
            />
            <span className="text-xs leading-relaxed text-foreground">
              I have read and agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2">Terms of Service</a>
              {' '}and the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline underline-offset-2">Privacy Policy</a>.
            </span>
          </label>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !agreed}
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
          {googleConfigured !== false && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <Button
                onClick={() => {
                  if (!agreed) {
                    toast({
                      title: 'Please confirm first',
                      description: 'Agree to the Terms of Service and Privacy Policy before continuing with Google.',
                      variant: 'destructive',
                    })
                    return
                  }
                  if (googleConfigured === false) {
                    toast({
                      title: 'Google sign-in unavailable',
                      description: 'Google OAuth is not configured on the server. Use email + password to register.',
                      variant: 'destructive',
                    })
                    return
                  }
                  window.location.href = '/api/auth/signin/google'
                }}
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
            </>
          )}
          {googleConfigured === false && (
            <p className="text-[11px] text-center text-muted-foreground pt-2">
              Google sign-in is not configured on this server · use email + password.
            </p>
          )}

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
