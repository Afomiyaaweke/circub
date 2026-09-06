'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Header } from '@/components/social/header'
import { LeftSidebar } from '@/components/social/left-sidebar'
import { RightSidebar } from '@/components/social/right-sidebar'
import { LandingPage } from '@/components/social/landing-page'
import { RegisterModal } from '@/components/social/register-modal'
import { LoginModal } from '@/components/social/login-modal'
import { useToast } from '@/hooks/use-toast'

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

      <div className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6">
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
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
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
