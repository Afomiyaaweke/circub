import type { Metadata } from 'next'
import { LegalPage } from '@/components/social/legal-page'
import { PRIVACY_DOC } from '@/lib/legal-content'

export const metadata: Metadata = {
  title: 'Privacy Policy - circub',
  description: 'How circub (Tenetbid) collects, uses, shares, and protects your information.',
}

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY_DOC} otherHref="/terms" otherLabel="Terms of Service" />
}
