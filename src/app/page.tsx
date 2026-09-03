'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/social/header'
import { LeftSidebar } from '@/components/social/left-sidebar'
import { RightSidebar } from '@/components/social/right-sidebar'
import { FeedTab } from '@/components/social/feed-tab'
import { NetworkTab } from '@/components/social/network-tab'
import { MainContent } from '@/components/social/main-content'
import { MessageModal } from '@/components/social/message-modal'
import type { User, TabKey } from '@/lib/types'

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>('feed')
  const [me, setMe] = useState<User | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null)

  const fetchMe = useCallback(async () => {
    setUserLoading(true)
    try {
      const res = await fetch('/api/me')
      const data = await res.json()
      setMe(data)
    } catch {
      setMe(null)
    } finally {
      setUserLoading(false)
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenMessages={handleOpenMessages}
        incomingInvitationsCount={me?.incomingInvitationsCount ?? 0}
      />

      <div className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <LeftSidebar
            user={me}
            loading={userLoading}
            onMessage={handleOpenMessages}
            onManageNetwork={() => setActiveTab('network')}
          />

          {/* Main content - changes per tab */}
          {activeTab === 'feed' && me && (
            <FeedTab
              user={me}
              onMessage={handleMessageUser}
              onRefreshUser={fetchMe}
            />
          )}

          {activeTab === 'network' && me && (
            <NetworkTab
              me={me}
              onMessage={handleMessageUser}
              onRefreshUser={fetchMe}
            />
          )}

          {(activeTab === 'discover' || activeTab === 'bookmark') && (
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
          />
        </div>
      </div>

      <footer className="mt-auto border-t border-border bg-white">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Social Circle — Connect, share, and grow
            your personalized network.
          </p>
          <p className="flex items-center gap-3">
            <a href="#" className="hover:text-primary transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Help
            </a>
          </p>
        </div>
      </footer>

      <MessageModal
        open={messagesOpen}
        onOpenChange={setMessagesOpen}
        targetUserId={messageTargetId}
        me={me}
      />
    </div>
  )
}
