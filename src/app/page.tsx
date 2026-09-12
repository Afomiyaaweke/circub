'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Mail, Phone, MapPin, Twitter, Instagram } from 'lucide-react'
import { Header } from '@/components/social/header'
import { LeftSidebar } from '@/components/social/left-sidebar'
import { RightSidebar } from '@/components/social/right-sidebar'
import { LandingPage } from '@/components/social/landing-page'
import { RegisterModal } from '@/components/social/register-modal'
import { LoginModal } from '@/components/social/login-modal'
import { useToast } from '@/hooks/use-toast'
import { AUTH_EXPIRED_EVENT } from '@/lib/auth-fetch'

// Lazy-load heavy tab components (only loaded when user switches to that tab)
const FeedTab = lazy(() => import('@/components/social/feed-tab').then(m => ({ default: m.FeedTab })))
const NetworkTab = lazy(() => import('@/components/social/network-tab').then(m => ({ default: m.NetworkTab })))
const LocalFeedTab = lazy(() => import('@/components/social/local-feed-tab').then(m => ({ default: m.LocalFeedTab })))
const LiveZoneTab = lazy(() => import('@/components/social/live-zone-tab').then(m => ({ default: m.LiveZoneTab })))
const MainContent = lazy(() => import('@/components/social/main-content').then(m => ({ default: m.MainContent })))

// Lazy-load modals (only loaded when opened)
const PriceDetailModal = lazy(() => import('@/components/social/price-detail-modal').then(m => ({ default: m.PriceDetailModal })))
const LocalProfileModal = lazy(() => import('@/components/social/local-profile-modal').then(m => ({ default: m.LocalProfileModal })))
const MessageModal = lazy(() => import('@/components/social/message-modal').then(m => ({ default: m.MessageModal })))
const EditProfileModal = lazy(() => import('@/components/social/edit-profile-modal').then(m => ({ default: m.EditProfileModal })))
const GuideRegisterModal = lazy(() => import('@/components/social/guide-register-modal').then(m => ({ default: m.GuideRegisterModal })))
import type { User, TabKey } from '@/lib/types'

export default function Home() {
  const [me, setMe] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('local')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null)
  const [localPriceId, setLocalPriceId] = useState<string | null>(null)
  const [localProfileUserId, setLocalProfileUserId] = useState<string | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [guideRegisterOpen, setGuideRegisterOpen] = useState(false)
  const { toast } = useToast()

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.status === 401) {
        setMe(null)
        return
      }
      const data = await res.json()
      setMe(data)
    } catch {
      setMe(null)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  // Show a clear toast when NextAuth redirects back with ?error=google
  // (Google OAuth couldn't start because the client secret is missing on the server).
  // Without this, the user just sees the landing page with no feedback.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err === 'google' || err === 'OAuthCallback' || err === 'Configuration') {
      toast({
        title: 'Google sign-in failed',
        description: 'Google OAuth is not fully configured on the server. Use email + password to sign in or register.',
        variant: 'destructive',
      })
      // Clean the URL so the toast doesn't re-fire on refresh.
      const url = window.location.origin + window.location.pathname
      window.history.replaceState({}, '', url)
    }
  }, [toast])

  // Listen for auth-expired events from authFetch (401 on publish/edit/etc.)
  // If the user is a guest (id === 'guest'), show the register modal instead
  // of the login modal — guests don't have credentials to log in with.
  useEffect(() => {
    const handler = () => {
      const isGuest = me?.id === 'guest'
      if (isGuest) {
        // Guest tried to do something that requires auth (post, vote, etc.)
        // Take them directly to registration — close everything else,
        // open the Register modal prominently.
        setMessagesOpen(false)
        setLoginOpen(false)
        setRegisterOpen(true)
        toast({
          title: 'Sign up to continue',
          description: 'Create a free account to post prices, vote, and message locals. It takes 10 seconds.',
        })
      } else {
        // Logged-in user's session expired — bounce to login
        setMe(null)
        setMessagesOpen(false)
        setRegisterOpen(false)
        setLoginOpen(true)
        toast({
          title: 'Session expired',
          description: 'Your login has expired. Please sign in again to continue.',
          variant: 'destructive',
        })
      }
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handler)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
  }, [toast, me])

  // Listen for "Ask a Guide" events from the PriceLens scanner — when
  // a user scans a product and taps "Ask a local guide about this item",
  // switch to the Guides tab so they can find a guide in their area.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setActiveTab('guides')
      const isGuest = me?.id === 'guest'
      toast({
        title: isGuest ? 'Browse local guides' : 'Find a guide',
        description: detail?.itemName
          ? `Looking for help with: ${detail.itemName}${detail?.location?.city ? ' in ' + detail.location.city : ''}`
          : undefined,
      })
      // If guest, prompt them to register so they can message guides
      if (isGuest) {
        setTimeout(() => {
          toast({
            title: 'Sign up to message guides',
            description: 'Create a free account to contact local guides directly.',
          })
        }, 1500)
      }
    }
    window.addEventListener('circub:ask-guide', handler)
    return () => window.removeEventListener('circub:ask-guide', handler)
  }, [toast, me])

  const handleRefreshAll = useCallback(() => {
    setRefreshSignal((s) => s + 1)
  }, [])

  const handleMessageUser = useCallback((userId: string) => {
    setMessageTargetId(userId)
    setMessagesOpen(true)
  }, [])

  const handleOpenMessages = useCallback(() => {
    setMessageTargetId(null)
    setMessagesOpen(true)
  }, [])

  const handleToggleGuideAvailability = useCallback(async () => {
    if (!me) return
    try {
      await fetch(`/api/guides/${me.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guideAvailable: !(me as any).guideAvailable }),
      })
      fetchMe()
      toast({ title: (me as any).guideAvailable ? 'You are now offline' : 'You are now available' })
    } catch {
      toast({ title: 'Failed to toggle availability', variant: 'destructive' })
    }
  }, [me, fetchMe, toast])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    setMe(null)
    setMessagesOpen(false)
    setRegisterOpen(false)
    setLoginOpen(false)
    toast({ title: 'Signed out' })
  }, [toast])

  const handleAuthed = useCallback(() => {
    // Fetch fresh user data from /api/auth/me
    fetchMe()
  }, [fetchMe])

  // While auth state is being checked, show a tiny loader
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img
            src="/logo.png"
            alt="circub"
            className="w-16 h-16 mx-auto mb-3 animate-pulse object-contain"
          />
          <p className="text-sm text-muted-foreground">Loading circub...</p>
        </div>
      </div>
    )
  }

  // Logged-out → landing page
  if (!me) {
    return (
      <>
        <LandingPage
          onSignUp={() => setRegisterOpen(true)}
          onLogin={() => setLoginOpen(true)}
          onContinueAsGuest={() => {
            // Set a guest user object so the full dashboard renders.
            // Guest users can see ALL tabs and browse everything, but
            // posting prices, voting, messaging, and editing profile
            // will prompt them to register.
            setMe({
              id: 'guest',
              name: 'Guest',
              email: '',
              avatarColor: 'teal',
              profilePicture: null,
              bio: null,
              headline: 'Guest user — sign up to post',
              location: null,
              accountType: 'PERSONAL',
              companyName: null,
              companyWebsite: null,
              companySize: null,
              companyIndustry: null,
              postsCount: 0,
              followersCount: 0,
              likesCount: 0,
              connectionsCount: 0,
              incomingInvitationsCount: 0,
              isLocal: false,
              verifiedLocal: false,
              isGuide: false,
              guideAvailable: false,
            } as any)
            toast({
              title: 'Browsing as guest',
              description: 'Explore prices, scan products, and browse the feed. Sign up free to post prices or vote.',
            })
          }}
        />
        <RegisterModal
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          onAuthed={handleAuthed}
          onSwitchToLogin={() => setLoginOpen(true)}
        />
        <LoginModal
          open={loginOpen}
          onOpenChange={setLoginOpen}
          onAuthed={handleAuthed}
          onSwitchToRegister={() => setRegisterOpen(true)}
        />
      </>
    )
  }

  // Logged-in → dashboard
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenMessages={handleOpenMessages}
        incomingInvitationsCount={me?.incomingInvitationsCount ?? 0}
        user={me}
        onSignUp={() => setRegisterOpen(true)}
        onLogin={() => setLoginOpen(true)}
        onLogout={handleLogout}
        onEditProfile={() => setEditProfileOpen(true)}
      />

      <div className="flex-1 mx-auto w-full max-w-[1400px] px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <LeftSidebar
            user={me}
            loading={false}
            onMessage={handleOpenMessages}
            onManageNetwork={() => setActiveTab('network')}
            onEditProfile={() => setEditProfileOpen(true)}
            editProfileOpen={editProfileOpen}
          />

          {activeTab === 'feed' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <FeedTab user={me} onMessage={handleMessageUser} onRefreshUser={fetchMe} />
            </Suspense>
          )}

          {activeTab === 'local' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <LocalFeedTab onRefreshUser={fetchMe} />
            </Suspense>
          )}

          {activeTab === 'guides' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <LiveZoneTab me={me} onMessage={handleMessageUser} onBecomeGuide={() => setGuideRegisterOpen(true)} onToggleAvailability={handleToggleGuideAvailability} />
            </Suspense>
          )}

          {activeTab === 'network' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <NetworkTab me={me} onMessage={handleMessageUser} onRefreshUser={fetchMe} />
            </Suspense>
          )}

          {activeTab === 'bookmark' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <MainContent user={me} activeTab={activeTab} refreshSignal={refreshSignal} onUserChanged={fetchMe} onRefreshAll={handleRefreshAll} />
            </Suspense>
          )}

          <RightSidebar
            refreshSignal={refreshSignal}
            onMessage={handleMessageUser}
            onOpenMessages={handleOpenMessages}
            incomingInvitationsCount={me?.incomingInvitationsCount ?? 0}
            onOpenLocalPrice={setLocalPriceId}
            onOpenLocalProfile={setLocalProfileUserId}
            onGoToFeed={() => setActiveTab('local')}
          />
        </div>
      </div>

      <footer className="mt-auto border-t border-border bg-white">
        {/* ===== Contact info ===== */}
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider text-foreground/60">Contact</span>
          <a href="mailto:hello@circub.app" className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <Mail className="h-3.5 w-3.5" />
            hello@circub.app
          </a>
          <a href="tel:+251911234567" className="flex items-center gap-1.5 hover:text-primary transition-colors">
            <Phone className="h-3.5 w-3.5" />
            +251 911 234 567
          </a>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Addis Ababa, Ethiopia
          </span>
          <a href="https://x.com/circubapp" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors" aria-label="circub on X (Twitter)">
            <Twitter className="h-3.5 w-3.5" />
            @circubapp
          </a>
          <a href="https://instagram.com/circub.app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors" aria-label="circub on Instagram">
            <Instagram className="h-3.5 w-3.5" />
            @circub.app
          </a>
        </div>
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-3 pb-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} circub · Local price intelligence for travelers.
          </p>
          <p className="flex items-center gap-3">
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Help</a>
          </p>
        </div>
      </footer>

      <Suspense fallback={null}>
        <MessageModal open={messagesOpen} onOpenChange={setMessagesOpen} targetUserId={messageTargetId} me={me} />
      </Suspense>

      <Suspense fallback={null}>
        <PriceDetailModal postId={localPriceId} onClose={() => setLocalPriceId(null)} onAuthorClick={setLocalProfileUserId} />
      </Suspense>

      <Suspense fallback={null}>
        <LocalProfileModal userId={localProfileUserId} onClose={() => setLocalProfileUserId(null)} onOpenPost={setLocalPriceId} />
      </Suspense>

      <Suspense fallback={null}>
        <EditProfileModal open={editProfileOpen} onOpenChange={setEditProfileOpen} user={me} onSaved={fetchMe} />
      </Suspense>

      <Suspense fallback={null}>
        <GuideRegisterModal open={guideRegisterOpen} onOpenChange={setGuideRegisterOpen} user={me} onSaved={() => { fetchMe(); setActiveTab('guides') }} />
      </Suspense>
    </div>
  )
}
