// Instant Side-Hustle Bounties - server wrapper with metadata; the
// interactive bounty board lives in quests-client.tsx (v215).
import type { Metadata } from 'next'
import { QuestsClient } from './quests-client'

export const metadata: Metadata = {
  title: 'Instant Side-Hustle Bounties · circubAwd',
  description:
    'Need a hand right now? Post an instant quest with a cash bounty - travelers post, local guides claim with 1 click and contact you instantly. Funds escrowed by the poster, paid on completion.',
}

export default function QuestsPage() {
  return <QuestsClient />
}
