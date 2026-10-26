// Community Help Board - server wrapper with metadata; the interactive board
// lives in help-client.tsx (v213).
import type { Metadata } from 'next'
import { HelpClient } from './help-client'

export const metadata: Metadata = {
  title: 'Help Board · circubAwd',
  description:
    'Ask the circubAwd community anything about prices, guides or the site - registered members help you with answers.',
}

export default function HelpPage() {
  return <HelpClient />
}
