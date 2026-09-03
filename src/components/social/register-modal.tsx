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
