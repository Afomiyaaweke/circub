import type { Metadata } from 'next'
import { LegalPage } from '@/components/social/legal-page'
import { TERMS_DOC } from '@/lib/legal-content'

export const metadata: Metadata = {
  title: 'Terms of Service - circubAwd',
  description: 'The terms that govern your use of the circubAwd platform (Tenetbid).',
}

export default function TermsPage() {
  return <LegalPage doc={TERMS_DOC} otherHref="/privacy" otherLabel="Privacy Policy" />
}
