'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/social/header'
import { LeftSidebar } from '@/components/social/left-sidebar'
import { RightSidebar } from '@/components/social/right-sidebar'
import { FeedTab } from '@/components/social/feed-tab'
import { NetworkTab } from '@/components/social/network-tab'
import { MainContent } from '@/components/social/main-content'
import { LocalFeedTab } from '@/components/social/local-feed-tab'
import { PriceDetailModal } from '@/components/social/price-detail-modal'
import { LocalProfileModal } from '@/components/social/local-profile-modal'
import { MessageModal } from '@/components/social/message-modal'
import { LandingPage } from '@/components/social/landing-page'
import { RegisterModal } from '@/components/social/register-modal'
import { LoginModal } from '@/components/social/login-modal'
import { useToast } from '@/hooks/use-toast'
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
      />

      <div className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <LeftSidebar
            user={me}
            loading={false}
            onMessage={handleOpenMessages}
            onManageNetwork={() => setActiveTab('network')}
          />

          {activeTab === 'feed' && (
            <FeedTab
              user={me}
              onMessage={handleMessageUser}
              onRefreshUser={fetchMe}
            />
          )}

          {activeTab === 'local' && (
            <LocalFeedTab onRefreshUser={fetchMe} />
          )}

          {activeTab === 'network' && (
            <NetworkTab
              me={me}
              onMessage={handleMessageUser}
              onRefreshUser={fetchMe}
            />
          )}

          {activeTab === 'bookmark' && (
            <MainContent
              user={me}
              activeTab={activeTab}
              refreshSignal={refreshSignal}
              onUserChanged={fetchMe}
              onRefreshAll={handleRefreshAll}
            />
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

      <MessageModal
        open={messagesOpen}
        onOpenChange={setMessagesOpen}
        targetUserId={messageTargetId}
        me={me}
      />

      <PriceDetailModal
        postId={localPriceId}
        onClose={() => setLocalPriceId(null)}
        onAuthorClick={setLocalProfileUserId}
      />

      <LocalProfileModal
        userId={localProfileUserId}
        onClose={() => setLocalProfileUserId(null)}
        onOpenPost={setLocalPriceId}
      />
    </div>
  )
}
