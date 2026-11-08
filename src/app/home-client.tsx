'use client'

// v117: the interactive circubAwd app shell, moved here from page.tsx so the
// page itself can be a server component and generate per-post Open Graph
// metadata for shared price-post links (/?post=<id>). Everything behaves
// exactly as before - plus one addition: a ?post= deep link (what every
// share/copy/QR of a price post now points at) auto-opens that price's
// detail modal, so whoever receives the link sees the full details
// immediately instead of a bare feed.

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Header } from '@/components/social/header'
import { RightSidebar } from '@/components/social/right-sidebar'
import { LandingPage, type LandingStats } from '@/components/social/landing-page'
import { useToast } from '@/hooks/use-toast'
import { AUTH_EXPIRED_EVENT } from '@/lib/auth-fetch'
import { rememberPosition, recallPosition, type ProfileSection } from '@/lib/last-position'
import { useBackClose } from '@/lib/back-close'
import { LanguageProvider } from '@/lib/i18n'

// Lazy-load heavy tab components (only loaded when user switches to that tab)
// v252: FeedTab (Battle) removed - the Weekly Hustle Battle renders inside the
// PROFILE's Battle strip cell now (quest-feed.tsx directly).
const LocalFeedTab = lazy(() => import('@/components/social/local-feed-tab').then(m => ({ default: m.LocalFeedTab })))
const LiveZoneTab = lazy(() => import('@/components/social/live-zone-tab').then(m => ({ default: m.LiveZoneTab })))
const ProfileTab = lazy(() => import('@/components/social/profile-tab').then(m => ({ default: m.ProfileTab })))

// Lazy-load modals (only loaded when opened)
const PriceDetailModal = lazy(() => import('@/components/social/price-detail-modal').then(m => ({ default: m.PriceDetailModal })))
const LocalProfileModal = lazy(() => import('@/components/social/local-profile-modal').then(m => ({ default: m.LocalProfileModal })))
const MessageModal = lazy(() => import('@/components/social/message-modal').then(m => ({ default: m.MessageModal })))
const CommunityFeedTab = lazy(() => import('@/components/social/community-feed-tab').then(m => ({ default: m.CommunityFeedTab })))
const RegisterModal = lazy(() => import('@/components/social/register-modal').then(m => ({ default: m.RegisterModal })))
const LoginModal = lazy(() => import('@/components/social/login-modal').then(m => ({ default: m.LoginModal })))
// v239: self-service password recovery ("Forgot password?" + /?reset=<token> link)
const ForgotPasswordModal = lazy(() => import('@/components/social/password-modals').then(m => ({ default: m.ForgotPasswordModal })))
const ResetPasswordModal = lazy(() => import('@/components/social/password-modals').then(m => ({ default: m.ResetPasswordModal })))
const DeactivateAccountModal = lazy(() => import('@/components/social/deactivate-account-modal').then(m => ({ default: m.DeactivateAccountModal })))
import type { User, TabKey } from '@/lib/types'

// localStorage key for the cached session user - enables instant repeat loads
// (dashboard paints immediately, then revalidates against /api/auth/me).
// Guests are never cached: guest mode is intentionally per-visit only.
const ME_CACHE_KEY = 'circubAwd.me.v1'

// Synchronously read the cached session user, if any, so the very first
// render already knows whether to paint the dashboard shell or the landing
// page - no flash of the wrong screen while the lazy initializer runs.
// Guarded for SSR (localStorage doesn't exist on the server).
function getCachedUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(ME_CACHE_KEY)
    if (cached) {
      const u = JSON.parse(cached)
      if (u && u.id && u.id !== 'guest') return u
    }
  } catch {}
  return null
}

export default function HomeClient({ stats = null }: { stats?: LandingStats | null }) {
  // LanguageProvider wraps the whole shell - landing AND dashboard - so the
  // chosen language applies to the entire app and persists across visits.
  return (
    <LanguageProvider>
      <HomeInner stats={stats} />
    </LanguageProvider>
  )
}

function HomeInner({ stats = null }: { stats?: LandingStats | null }) {
  // v229 hydration fix: the server ALWAYS renders the landing (page.tsx is
  // session-blind), so the client's FIRST render must be the landing too.
  // Seeding `me` synchronously from the localStorage cache made returning
  // members hydrate dashboard HTML into landing HTML - React error #418 and
  // a full tree regeneration on EVERY repeat visit. The cache now applies
  // right after hydration: still zero spinners, still effectively instant
  // for returning users, and server/client finally agree on first paint.
  const [me, setMe] = useState<User | null>(null)
  useEffect(() => {
    const cached = getCachedUser()
    if (cached) setMe(cached)
  }, [])
  // authChecked now only tracks whether the background /api/auth/me
  // revalidation has completed - it no longer gates the first paint.
  // Blocking every visit (most of which are anonymous) behind a network
  // round-trip just to find out "you're not logged in" was the single
  // biggest chunk of the "Loading circubAwd..." delay, so we render
  // optimistically from cache/guest state immediately and let the
  // real auth check settle in the background.
  const [authChecked, setAuthChecked] = useState(false)
  // v252: the app opens on the LOCAL feed (user: "remove the battle form the
  // home page and start form the local") - the Battle tab is gone from the
  // dock and lives in the Profile now; fresh visits land on Local. The
  // position memory below still restores the tab the user was really on.
  const [activeTab, setActiveTab] = useState<TabKey>('local')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null)
  // v225: the community feed is a REAL TAB now (same space as Battle/Local/
  // Link), so there is no more feedOpen modal state. What remains is the
  // post id to highlight when the user arrives from a ?community=<id>
  // share link - the tab scrolls to and flashes that post.
  const [communityHighlight, setCommunityHighlight] = useState<string | null>(null)
  // v227: shared bounties land on /?quest=<id> - open the Link (guides) tab
  // and flash that bounty inside the swipe deck.
  const [questHighlight, setQuestHighlight] = useState<string | null>(null)
  const [localPriceId, setLocalPriceId] = useState<string | null>(null)
  // v239: password recovery state
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [localProfileUserId, setLocalProfileUserId] = useState<string | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  // "Deactivate account" (header menu, next to Sign out) - asks for a reason,
  // forwards it to the contact-us inbox, then signs the user out.
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  // Bumped every time an "Edit profile" entry point is used (header menu,
  // right sidebar) - routes to the Profile tab in edit mode (full tab).
  const [editSignal, setEditSignal] = useState(0)
  // Bookmark and Network live INSIDE the Profile tab now (Instagram-style):
  // profileSection is the section the Profile tab should open on, bumped
  // by sectionBump so it also applies when the tab is already active.
  const [profileSection, setProfileSection] = useState<ProfileSection | null>(null)
  const [sectionBump, setSectionBump] = useState(0)
  // The section the Profile tab is ACTUALLY showing (reported by ProfileTab),
  // so the position memory records the truth even when the user switches
  // sections with the chips inside the tab.
  const [profileLiveSection, setProfileLiveSection] = useState<ProfileSection | null>(null)
  const { toast } = useToast()

  // v119: the device/browser back button closes the topmost open overlay
  // (price detail, local profile, messages, auth dialogs) and returns to the
  // position underneath, instead of leaving the app. Each overlay pushes one
  // history entry when it opens; back unwinds them in reverse order. Closing
  // via the UI consumes its own entry (no dead press).
  useBackClose(!!localPriceId, () => setLocalPriceId(null))
  useBackClose(!!localProfileUserId, () => setLocalProfileUserId(null))
  useBackClose(messagesOpen, () => setMessagesOpen(false))
  useBackClose(registerOpen, () => setRegisterOpen(false))
  useBackClose(loginOpen, () => setLoginOpen(false))
  useBackClose(deactivateOpen, () => setDeactivateOpen(false))

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
    // `me` is already painted synchronously from cache (or null/guest) by
    // the lazy useState initializer above. All this effect needs to do is
    // kick off the background revalidation against the server - it must
    // NOT block or delay the first paint.
    fetchMe()
  }, [fetchMe])

  // v117: shared price-post links land on /?post=<postId>. Open that post's
  // detail modal on mount so the recipient sees the full price details (the
  // same modal the Details button opens) instead of hunting for the card in
  // the feed. Runs once - the URL is left untouched so a refresh reopens it.
  // v225: shared COMMUNITY posts land on /?community=<postId> - open the
  // community feed tab on that post instead (the tab scrolls to + flashes it).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const postId = params.get('post')
    if (postId) setLocalPriceId(postId)
    const communityId = params.get('community')
    if (communityId) {
      setActiveTab('community')
      setCommunityHighlight(communityId)
    }
    const questId = params.get('quest')
    if (questId) {
      setActiveTab('guides')
      setQuestHighlight(questId)
    }
    // v239: password-reset email links land on /?reset=<token> - open the
    // set-new-password modal (works for signed-out visitors, which is who
    // the email targets). The URL is cleaned so refreshes don't re-open it.
    const reset = params.get('reset')
    if (reset) {
      setResetToken(reset)
      const url = window.location.origin + window.location.pathname
      window.history.replaceState({}, '', url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show a clear toast when NextAuth redirects back with ?error=<code>
  // (the OAuth roundtrip failed somewhere). v171: the message is honest
  // and differentiated - only `Configuration` claims a server misconfiguration
  // (it is the only code that means that); every other code (OAuthCallback,
  // OAuthSignin, AccessDenied, Callback, google, ...) gets a try-again
  // message, because the live config is verified healthy and a failed
  // roundtrip is almost always transient or a cancelled consent.
  // v171 RACE FIX: the mount effect used to fire before the Toaster had
  // subscribed, so the toast silently vanished (the URL was cleaned but
  // NOTHING was ever displayed - a second "dead" Google button report).
  // The message now lands in state and renders as a persistent inline
  // banner over whatever is on screen (landing or app shell).
  const [oauthErrorMsg, setOauthErrorMsg] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      const misconfigured = err === 'Configuration'
      setOauthErrorMsg(misconfigured
        ? 'Google OAuth is not fully configured on the server. Use email + password to sign in or register.'
        : 'Google sign-in could not be completed. Please try again, or use email + password.')
      // Clean the URL so the banner doesn't re-fire on refresh.
      const url = window.location.origin + window.location.pathname
      window.history.replaceState({}, '', url)
    }
  }, [])

  const oauthErrorBanner = oauthErrorMsg ? (
    <div
      role="alert"
      data-testid="oauth-error-banner"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-md rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/90 shadow-lg p-3.5 flex items-start gap-2.5"
    >
      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-900 dark:text-red-100">Google sign-in failed</p>
        <p className="text-xs text-red-800 dark:text-red-200/90 mt-0.5 leading-relaxed">{oauthErrorMsg}</p>
      </div>
      <button
        onClick={() => setOauthErrorMsg(null)}
        aria-label="Dismiss"
        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : null

  // Demo mode has ZERO write access: every attempt (post, vote, like,
  // message, guide registration...) is intercepted client-side and answered
  // with the REGISTRATION FORM itself - not just a toast. One helper so the
  // behavior is identical on every path.
  const promptRegister = useCallback((title: string, description: string) => {
    setMessagesOpen(false)
    setLoginOpen(false)
    setRegisterOpen(true)
    toast({ title, description })
  }, [toast])

  // Listen for auth-expired events from authFetch (401 on publish/edit/etc.)
  // If the user is a guest (id === 'guest'), show the register modal instead
  // of the login modal - guests don't have credentials to log in with.
  useEffect(() => {
    const handler = () => {
      // While the Deactivate modal is open the 401 storm it causes (every
      // background API now returns 401 for the deactivated user) must NOT
      // trigger the "Session expired" bounce / login modal on top of it -
      // the modal's own Done flow signs the user out cleanly.
      if (deactivateOpen) return
      const isGuest = me?.id === 'guest'
      if (isGuest) {
        // Guest tried to do something that requires auth (post, vote, etc.)
        // Take them directly to registration - close everything else,
        // open the Register modal prominently.
        promptRegister(
          'Register first',
          'The demo cannot post, vote, or message. Create a free account to do that - it takes 10 seconds.',
        )
      } else {
        // Logged-in user's session expired - bounce to login
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
  }, [toast, me, deactivateOpen, promptRegister])

  // Listen for "Ask a Guide" events from the PriceLens scanner - when
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
      // If guest, bring up the REGISTRATION FORM right away - asking a
      // guide is messaging, and the demo cannot message.
      if (isGuest) {
        promptRegister(
          'Register to ask a guide',
          'The demo cannot message guides. Create a free account to ask locals directly.',
        )
      }
    }
    window.addEventListener('circub:ask-guide', handler)
    return () => window.removeEventListener('circub:ask-guide', handler)
  }, [toast, me, promptRegister])

  const handleRefreshAll = useCallback(() => {
    setRefreshSignal((s) => s + 1)
  }, [])

  const handleMessageUser = useCallback((userId: string) => {
    // Messaging requires an account - guests are taken straight to sign-up,
    // expired sessions to login (same flow as posting/voting).
    if (!me) {
      setLoginOpen(true)
      toast({ title: 'Sign in to message', description: 'Log in or create a free account to message locals and guides.' })
      return
    }
    if (me.id === 'guest') {
      promptRegister(
        'Register to message',
        'The demo cannot message anyone. Create a free account to message locals and guides.',
      )
      return
    }
    setMessageTargetId(userId)
    setMessagesOpen(true)
  }, [me, toast, promptRegister])

  // Plain nav clicks reset the deep-linked Profile section so the tab opens
  // on Posts, while "My network" entry points still land on their section.
  // v235: the Link tab is a normal in-page tab again, so there is no
  // "last non-Link tab" memory and no back handler - the nav pills are the
  // way around, exactly like Battle/Local/Community.
  const handleTabChange = useCallback((tab: TabKey) => {
    if (tab === 'profile') setProfileSection(null)
    setActiveTab(tab)
  }, [])

  const openProfileSection = useCallback((section: 'saved' | 'network') => {
    setProfileSection(section)
    setSectionBump((b) => b + 1)
    setActiveTab('profile')
  }, [])

  // "Remember where the user is if the page is not refreshed": when the user
  // comes back from another page (browser back, or a client-side nav) the tab
  // - and the Profile sub-section - they were on is restored. Runs in a
  // post-hydration effect so the SSR markup always matches the first client
  // render; an explicit refresh or a fresh visit starts clean at the default.
  useEffect(() => {
    const pos = recallPosition()
    // v252: 'feed' (Battle) is no longer a tab - old saved positions pointing
    // at it fall back to the new default (Local). Every existing tab still
    // wins over the default.
    if (!pos || pos.tab === 'feed') return
    setActiveTab(pos.tab)
    if (pos.tab === 'profile' && pos.section) {
      setProfileSection(pos.section)
      setSectionBump((b) => b + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    rememberPosition(
      activeTab,
      activeTab === 'profile' ? (profileLiveSection ?? profileSection) : null
    )
  }, [activeTab, profileSection, profileLiveSection])

  // Editing the profile requires a real account - guests get the sign-up
  // dialog. Real users land on the Profile tab in edit mode (Instagram-style
  // full tab, replacing the old modal).
  const handleEditProfile = useCallback(() => {
    if (!me) {
      setLoginOpen(true)
      toast({ title: 'Sign in to edit your profile', description: 'Log in or create a free account to personalize your profile.' })
      return
    }
    if (me.id === 'guest') {
      promptRegister(
        'Register to save a profile',
        'The demo is read-only. Create a free account first - your profile saves with it. It takes 10 seconds.',
      )
      return
    }
    setActiveTab('profile')
    setProfileSection(null)
    setEditSignal((s) => s + 1)
  }, [me, toast, promptRegister])

  const handleOpenMessages = useCallback(() => {
    // Header/RightSidebar "Feed" button → the community posting site.
    // v225: it is a full tab now (same space as Battle/Local/Link) instead
    // of the cramped slide-over panel.
    setActiveTab('community')
  }, [])

  // Profile "Messages" button → open the PRIVATE 1:1 DM inbox (not the
  // community feed). This is the user's personal message inbox.
  const handleOpenInbox = useCallback(() => {
    if (me?.id === 'guest') {
      promptRegister(
        'Register to message',
        'The demo cannot message anyone. Create a free account to message locals and guides.',
      )
      return
    }
    setMessageTargetId(null)
    setMessagesOpen(true)
  }, [me, promptRegister])

  // v236: talent registration lives INSIDE Edit profile (the profile tab's
  // talent section) - there is no separate join modal any more. Guests who
  // tap "Become a talent" are sent to sign-up first via handleEditProfile's
  // promptRegister path below; the same entry point serves registering and
  // keeping the talent details current afterwards.

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

  // After a successful deactivation: same teardown as logout, different copy.
  const handleDeactivated = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    try { localStorage.removeItem(ME_CACHE_KEY) } catch {}
    setMe(null)
    setMessagesOpen(false)
    toast({ title: 'Account deactivated', description: 'Your reason was sent to our team. Email support@tenetbid.com to come back any time.' })
  }, [toast])

  const handleAuthed = useCallback(() => {
    // Fetch fresh user data from /api/auth/me
    fetchMe()
  }, [fetchMe])

  // NOTE: we intentionally do NOT gate rendering on `authChecked` anymore.
  // `me` already reflects the best information we have synchronously
  // (cached user, or null/guest) and `fetchMe()` is revalidating in the
  // background. Blocking first paint on that network round-trip meant
  // every anonymous visitor - the majority of first-time traffic - sat on
  // a spinner just to be told "you're logged out" and shown the landing
  // page anyway. If a returning user opens the app on a device with no
  // cache, they'll see the landing page for a moment and then flip to the
  // dashboard once fetchMe() resolves - a brief, non-blocking flash beats
  // a guaranteed multi-hundred-ms (or, on a cold serverless/DB start,
  // multi-second) blank wait for everyone.

  // Logged-out → landing page
  if (!me) {
    return (
      <>
        {oauthErrorBanner}
        <LandingPage
          stats={stats}
          onSignUp={() => setRegisterOpen(true)}
          onLogin={() => setLoginOpen(true)}
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
            onForgotPassword={() => setForgotOpen(true)}
          />
        </Suspense>
        <Suspense fallback={null}>
          <ForgotPasswordModal
            open={forgotOpen}
            onOpenChange={setForgotOpen}
            onBackToSignIn={() => setLoginOpen(true)}
          />
        </Suspense>
        <Suspense fallback={null}>
          <ResetPasswordModal
            open={!!resetToken}
            onOpenChange={(o) => { if (!o) setResetToken(null) }}
            token={resetToken || ''}
            onDone={() => setLoginOpen(true)}
          />
        </Suspense>
        {/* v117: shared price-post deep links (?post=<id>) must show the price
            details even to logged-out visitors - render the detail modal (and
            the author profile it links to) on the landing page as well. */}
        <Suspense fallback={null}>
          <PriceDetailModal
            postId={localPriceId}
            onClose={() => setLocalPriceId(null)}
            onAuthorClick={setLocalProfileUserId}
            onMessage={handleMessageUser}
            currentUserId={null}
          />
        </Suspense>
        <Suspense fallback={null}>
          <LocalProfileModal
            userId={localProfileUserId}
            onClose={() => setLocalProfileUserId(null)}
            onOpenPost={setLocalPriceId}
            onMessage={handleMessageUser}
            currentUserId={null}
          />
        </Suspense>
      </>
    )
  }

  // Logged-in → dashboard
  // v235: the Link tab ('guides') renders like every other tab - the app
  // header, right sidebar, dock and page paddings are ALWAYS rendered and
  // LiveZoneTab mounts in the normal content column. The v230 full-screen
  // reel mode ("remove all the header from the link session...") is fully
  // retired; the in-page switcher + payouts row is the tab's own toolbar.
  return (
    <div className={cn('min-h-screen flex flex-col bg-background', 'pb-[62px] lg:pb-24')}>
      {oauthErrorBanner}
      <div className="sticky top-0 z-40">
        <Header
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenMessages={handleOpenMessages}
          incomingInvitationsCount={me?.incomingInvitationsCount ?? 0}
          user={me}
          onSignUp={() => setRegisterOpen(true)}
          onLogin={() => setLoginOpen(true)}
          onLogout={handleLogout}
          onEditProfile={handleEditProfile}
          onOpenNetwork={() => openProfileSection('network')}
          onDeactivateAccount={() => setDeactivateOpen(true)}
          onOpenPost={(postId) => setLocalPriceId(postId)}
        />
      </div>

      <Suspense fallback={null}>
        <DeactivateAccountModal
          open={deactivateOpen}
          onOpenChange={setDeactivateOpen}
          user={me ? { name: me.name, email: me.email } : null}
          onDeactivated={handleDeactivated}
        />
      </Suspense>

      <div className="flex-1 mx-auto w-full max-w-[1400px] px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {activeTab === 'local' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <LocalFeedTab onRefreshUser={fetchMe} onMessage={handleMessageUser} onRequireSignUp={() => setRegisterOpen(true)} />
            </Suspense>
          )}

          {/* v235: the Link tab back in the normal content column (guides slot) */}
          {activeTab === 'guides' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <LiveZoneTab me={me} onMessage={handleMessageUser} onJoinTalent={handleEditProfile} onToggleAvailability={handleToggleGuideAvailability} highlightQuestId={questHighlight} onHighlightDone={() => setQuestHighlight(null)} />
            </Suspense>
          )}

          {activeTab === 'profile' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <ProfileTab
                me={me}
                editSignal={editSignal}
                initialSection={profileSection}
                sectionBump={sectionBump}
                onSectionChange={setProfileLiveSection}
                onOpenListing={setLocalPriceId}
                onMessage={handleMessageUser}
                onOpenMessages={handleOpenInbox}
                onUserChanged={fetchMe}
                onSignUp={() => setRegisterOpen(true)}
              />
            </Suspense>
          )}

          {/* v225: community feed as a full tab - same space as Battle/Local/Link */}
          {activeTab === 'community' && (
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
              <CommunityFeedTab
                me={me}
                highlightPostId={communityHighlight}
                onHighlightDone={() => setCommunityHighlight(null)}
              />
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
            onEditProfile={handleEditProfile}
            onManageNetwork={() => openProfileSection('network')}
          />
        </div>
      </div>

      <Suspense fallback={null}>
        <MessageModal open={messagesOpen} onOpenChange={setMessagesOpen} targetUserId={messageTargetId} me={me} />
      </Suspense>

      <Suspense fallback={null}>
        <PriceDetailModal postId={localPriceId} onClose={() => setLocalPriceId(null)} onAuthorClick={setLocalProfileUserId} onMessage={handleMessageUser} currentUserId={me?.id ?? null} />
      </Suspense>

      <Suspense fallback={null}>
        <LocalProfileModal userId={localProfileUserId} onClose={() => setLocalProfileUserId(null)} onOpenPost={setLocalPriceId} onMessage={handleMessageUser} currentUserId={me?.id ?? null} />
      </Suspense>

      {/* Auth modals also in the dashboard: guests who hit an auth-gated action
          (message a poster, vote, post) get the sign-up prompt without leaving
          the dashboard. No-ops while closed. */}
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
          onForgotPassword={() => setForgotOpen(true)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ForgotPasswordModal
          open={forgotOpen}
          onOpenChange={setForgotOpen}
          onBackToSignIn={() => setLoginOpen(true)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <ResetPasswordModal
          open={!!resetToken}
          onOpenChange={(o) => { if (!o) setResetToken(null) }}
          token={resetToken || ''}
          onDone={() => setLoginOpen(true)}
        />
      </Suspense>
    </div>
  )
}
