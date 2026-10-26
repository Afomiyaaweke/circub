// Community Help Board - server wrapper with metadata; the interactive board
// lives in help-client.tsx. Since v216 this ONE page hosts both boards:
// Questions & Answers (v213) AND the instant side-hustle quest bounties
// (v215) - same page as the link, no separate /quests destination.
import type { Metadata } from 'next'
import { HelpClient } from './help-client'

export const metadata: Metadata = {
  title: 'Help Board · circubAwd',
  description:
    'One help page: ask the community anything - registered members answer - or post an instant quest with a cash bounty ("I need help around Merkato") and local guides claim it and contact you instantly.',
}

export default function HelpPage() {
  return <HelpClient />
}
