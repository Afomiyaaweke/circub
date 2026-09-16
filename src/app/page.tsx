'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Header } from '@/components/social/header'
import { RightSidebar } from '@/components/social/right-sidebar'
import { LandingPage } from '@/components/social/landing-page'
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
const RegisterModal = lazy(() => import('@/components/social/register-modal').then(m => ({ default: m.RegisterModal })))
const LoginModal = lazy(() => import('@/components/social/login-modal').then(m => ({ default: m.LoginModal })))
import type { User, TabKey } from '@/lib/types'

// localStorage key for the cached session user — enables instant repeat loads
// (dashboard paints immediately, then revalidates against /api/auth/me).
// Guests are never cached: guest mode is intentionally per-visit only.
const ME_CACHE_KEY = 'circub.me.v1'

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
        try { localStorage.removeItem(ME_CACHE_KEY) } catch {}
        return
      }
      const data = await res.json()
      setMe(data)
      // Cache the signed-in user so the next visit paints instantly
      // (revalidated below by this same fetch on every load).
      if (data && data.id && data.id !== 'guest') {
        try { localStorage.setItem(ME_CACHE_KEY, JSON.stringify(data)) } catch {}
      }
    } catch {
      setMe(null)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    // Instant paint from the cached session (repeat loads — mobile & web):
    // render the dashboard/landing immediately, then revalidate in background.
    try {
      const cached = localStorage.getItem(ME_CACHE_KEY)
      if (cached) {
        const u = JSON.parse(cached)
        if (u && u.id && u.id !== 'guest') {
          setMe(u)
          setAuthChecked(true)
        }
      }
    } catch {}
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
    try { localStorage.removeItem(ME_CACHE_KEY) } catch {}
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
            try { localStorage.removeItem(ME_CACHE_KEY) } catch {}
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
        <Suspense fallback={null}>
          <RegisterModal
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            onAuthed={handleAuthed}
            onSwitchToLogin={() => setLoginOpen(true)}
          />
        </Suspense>
        <Suspense fallback={null}>
          <LoginModal
            open={loginOpen}
            onOpenChange={setLoginOpen}
            onAuthed={handleAuthed}
            onSwitchToRegister={() => setRegisterOpen(true)}
          />
        </Suspense>
      </>
    )
  }

  // Logged-in → dashboard
  return (
    <div className="min-h-screen flex flex-col bg-background pb-[36px] md:pb-0">
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
            user={me}
            onMessage={handleMessageUser}
            onOpenMessages={handleOpenMessages}
            incomingInvitationsCount={me?.incomingInvitationsCount ?? 0}
            onOpenLocalPrice={setLocalPriceId}
            onOpenLocalProfile={setLocalProfileUserId}
            onGoToFeed={() => setActiveTab('local')}
            onEditProfile={() => setEditProfileOpen(true)}
            onManageNetwork={() => setActiveTab('network')}
          />
        </div>
      </div>

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
