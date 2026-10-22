'use client'

// v203: the FEED tab IS the game now. The social composer and the social
// post list are gone from this tab - the user asked for the whole
// PriceQuest experience and ONLY that ('forget the feed posting and make it
// only this'). Everything on this tab is computed from the price votes the
// app already writes: quest-feed.tsx renders the Weekly Hustle Battle, the
// quest roadmap, the vote-to-match arena and the Sticker Vault.
//
// Social posts still live on: profiles and the network surfaces keep their
// own lists - this tab is the arena.

import { QuestFeed } from './quest-feed'
import type { User } from '@/lib/types'

interface FeedTabProps {
  user: User
  onMessage: (userId: string) => void
  onRefreshUser: () => void
}

export function FeedTab({ user, onMessage, onRefreshUser }: FeedTabProps) {
  return <QuestFeed user={user} onMessage={onMessage} onRefreshUser={onRefreshUser} />
}
