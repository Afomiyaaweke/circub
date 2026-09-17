// Contact Us page - server wrapper with metadata; the interactive form lives in contact-client.tsx.
import type { Metadata } from 'next'
import { ContactClient } from './contact-client'

export const metadata: Metadata = {
  title: 'Contact Us · circub',
  description:
    'Get in touch with the circub team - send us a message, reach support at support@tenetbid.com, or call +251 956 140 291.',
}

export default function ContactPage() {
  return <ContactClient />
}
