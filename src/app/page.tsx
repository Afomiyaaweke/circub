'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/social/header'
import { LeftSidebar } from '@/components/social/left-sidebar'
import { MainContent } from '@/components/social/main-content'
import { RightSidebar } from '@/components/social/right-sidebar'
import type { User, TabKey } from '@/lib/types'

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>('network')
  const [me, setMe] = useState<User | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [refreshSignal, setRefreshSignal] = useState(0)

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <LeftSidebar user={me} loading={userLoading} />

          <MainContent
            user={me}
            activeTab={activeTab}
            refreshSignal={refreshSignal}
            onUserChanged={fetchMe}
            onRefreshAll={handleRefreshAll}
          />

          <RightSidebar refreshSignal={refreshSignal} />
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
    </div>
  )
}
