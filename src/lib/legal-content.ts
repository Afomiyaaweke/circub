// Legal documents - Privacy Policy and Terms of Service (Tenetbid / Circub).
// Content provided by the client (circub-privacy-policy.docx / circub-terms-of-service.docx,
// extracted verbatim). Rendered by src/components/social/legal-page.tsx at /privacy and /terms.

export interface LegalSection {
  title: string
  items: string[]
}

export interface LegalDoc {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
  footer?: string
}

export const PRIVACY_DOC: LegalDoc = {
  title: 'Circub Privacy Policy',
  updated: 'September 16, 2026',
  intro: 'This Privacy Policy explains how Tenetbid (“Circub,” “we,” “us,” or “our”) collects, uses, shares, and protects information when you use the Circub platform (the “Service”), where locals share real prices for products, services, restaurants, transport, and other local knowledge, and travelers browse that information or message locals directly.',
  sections: [
    {
      title: '1. What Information Do We Collect?',
      items: [
        'Information you provide directly',
        'Account information: name, email address, phone number, username, password',
        'Profile information: profile photo, home city/country (for locals), traveler destinations, bio, verification documents (e.g. proof of local residency, ID for verification badges)',
        'Content you post: price submissions, listings, photos, reviews, ratings, and comments',
        'Messages you send to other users through the platform',
        'Payment information, if you make or receive payments through the Service (e.g. tips, paid consultations)',
        'Communications with our support team',
        'Information collected automatically',
        'Location data (city/region-level or precise GPS, depending on your device permissions) - used to show relevant local prices and connect you with nearby locals or travelers',
        'Device information, IP address, browser type, operating system',
        'Usage data: pages viewed, searches performed, listings clicked, time spent in-app',
        'Log data and crash reports',
        'Information from third parties',
        'Profile information from social logins (e.g. Google, Apple, Facebook) if you choose to sign up that way',
        'Information from identity verification providers, if we use one to verify local users',
      ],
    },
    {
      title: '2. How Do We Use Your Information?',
      items: [
        'We use your information to:',
        'Create and manage your account, and verify local users where applicable',
        'Match travelers with relevant local price information and local users',
        'Enable messaging between travelers and locals',
        'Process payments, where applicable',
        'Send service communications, respond to support requests, and notify you of relevant activity (e.g. a reply to your message)',
        'Send marketing communications, where permitted, which you can opt out of at any time',
        'Detect and prevent fraud, abuse, and fake or manipulated price listings',
        'Improve and develop the Service, including through analytics',
        'Build aggregated travel-price insights: we may use price data submitted by users, in aggregated and/or anonymized form, to generate travel-cost indexes, trend reports, or similar data products. This aggregated data does not identify you individually.',
      ],
    },
    {
      title: '3. Legal Bases for Processing (EEA/UK Users)',
      items: [
        'Where applicable, we rely on:',
        'Consent - e.g. for marketing emails or precise location access',
        'Performance of a contract - to provide the core features of the Service you\'ve signed up for',
        'Legitimate interests - e.g. fraud prevention, service improvement, and building aggregated data products, balanced against your rights',
        'Legal obligations - e.g. responding to lawful requests from authorities',
        'Vital interests - in rare cases where necessary to protect someone\'s safety',
      ],
    },
    {
      title: '4. When and With Whom Do We Share Information?',
      items: [
        'Other users: your username, profile info, posted content, and messages are visible to the users you interact with. Price listings and public content may be visible to all users of the platform.',
        'Service providers: hosting, analytics, customer support, payment processing, and identity verification partners who help us operate the Service.',
        'Business transfers: if Circub is involved in a merger, acquisition, or asset sale.',
        'Affiliates: with companies under common control with Circub.',
        'Legal & safety: where required by law, or to protect the rights, safety, or property of Circub, our users, or the public.',
        'Aggregated/anonymized data: we may share or license aggregated, de-identified price and travel-trend data (e.g. with research partners or business customers) that does not identify you.',
        'We do not sell your personal information to advertisers.',
      ],
    },
    {
      title: '5. Cookies and Tracking Technologies',
      items: [
        'We use cookies and similar technologies for:',
        'Security and login sessions',
        'Remembering your preferences (e.g. currency, language)',
        'Analytics on how the Service is used',
        'Advertising, where applicable',
        'You can manage cookies through your browser settings. Disabling some cookies may limit functionality.',
      ],
    },
    {
      title: '6. AI-Based Features',
      items: [
        'Circub may offer AI-powered features, such as:',
        'Automated summarization of local price trends',
        'Smart suggestions when submitting a price or writing a message',
        'Content moderation to detect spam or fraudulent listings',
        'You can manage AI-feature preferences in your account settings where available.',
      ],
    },
    {
      title: '7. Social Logins',
      items: [
        'If you sign up or log in via a social account (e.g. Google, Apple), we may receive your name, email, and profile picture from that provider, depending on the permissions you grant.',
      ],
    },
    {
      title: '8. International Transfers',
      items: [
        'Because Circub connects travelers and locals across countries, your information may be processed in countries other than your own. Where required, we use safeguards such as:',
        'Standard Contractual Clauses (SCCs)',
        'Binding Corporate Rules (BCRs)',
      ],
    },
    {
      title: '9. How Long Do We Keep Information?',
      items: [
        'We retain personal information only as long as necessary for the purposes in this policy. In most cases, we do not retain personal data longer than 6 months after account deletion, unless a longer period is required by law (e.g. for tax, fraud, or dispute records). Aggregated/anonymized data may be retained indefinitely.',
      ],
    },
    {
      title: '10. Your Privacy Rights',
      items: [
        'Depending on your location, you may have the right to:',
        'Access the personal data we hold about you',
        'Correct inaccurate data',
        'Request deletion of your data',
        'Restrict or object to certain processing',
        'Receive your data in a portable format',
        'Object to decisions based solely on automated processing',
      ],
    },
    {
      title: '11. Do-Not-Track',
      items: [
        'We honor Do-Not-Track (DNT) browser signals where technically feasible, and take steps to limit tracking accordingly.',
      ],
    },
    {
      title: '12. US Resident Rights',
      items: [
        'If you are a California (or other applicable US state) resident, you may have rights under the CCPA and similar state laws, including the right to:',
        'Know what personal information we collect',
        'Request deletion of your personal information',
        'Opt out of the sale or sharing of personal information',
        'Not be discriminated against for exercising these rights',
      ],
    },
    {
      title: '13. Other Region Rights',
      items: [
        'If you\'re outside the US, you may have rights under:',
        'GDPR (EU)',
        'UK GDPR',
        'PIPEDA (Canada)',
        'Other local data protection laws',
      ],
    },
    {
      title: '14. Children\'s Privacy',
      items: [
        'Circub is not intended for users under 16 (or the minimum age required in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us so we can remove it.',
      ],
    },
    {
      title: '15. Updates to This Policy',
      items: [
        'We may update this Privacy Policy from time to time. We\'ll update the “Last updated” date above and, for material changes, provide additional notice (e.g. in-app notification or email).',
      ],
    },
    {
      title: '16. Contact Us',
      items: [
        'Questions or concerns about this Privacy Policy:',
        'Email: contact@tenetbid.com',
      ],
    },
    {
      title: '17. Review, Update, or Delete Your Data',
      items: [
        'You can:',
        'Update your info in Account Settings',
        'Email us at contact@tenetbid.com',
        'Submit a formal data subject access request',
        'We\'ll respond within the timeframe required by applicable law.',
      ],
    },
  ],
  footer: 'This policy is effective as of September 16, 2026 and applies to all users of the Circub platform.',
}

export const TERMS_DOC: LegalDoc = {
  title: 'Circub Terms of Service',
  updated: 'September 16, 2026',
  intro: 'Welcome to Circub. These Terms of Service (“Terms”) govern your access to and use of the Circub website and app (the “Service”), operated by Tenetbid (“Circub,” “we,” “us”). By creating an account or using the Service, you agree to these Terms.',
  sections: [
    {
      title: '1. Who Can Use Circub',
      items: [
        'You must be at least 16 years old (or the age of digital consent in your country, if higher) to use Circub. By using the Service, you confirm you meet this requirement and that all information you provide is accurate.',
      ],
    },
    {
      title: '2. The Service',
      items: [
        'Circub is a community platform where:',
        'Locals post real, first-hand prices for products, services, restaurants, transport, and other local knowledge.',
        'Travelers browse this information and can message locals directly when they need more specific or up-to-date guidance.',
        'Circub does not itself sell products, set prices, or guarantee transactions between users.',
      ],
    },
    {
      title: '3. Accuracy of Content  No Guarantee',
      items: [
        'Prices, listings, and other content on Circub are submitted by users, not verified by Circub as accurate, current, or complete. You use this information at your own risk. Prices can change quickly and vary by season, negotiation, or location. Circub is not responsible for losses arising from reliance on user-submitted content.',
      ],
    },
    {
      title: '4. Your Account',
      items: [
        'You\'re responsible for keeping your login credentials secure and for all activity under your account.',
        'You must provide accurate registration information and keep it up to date.',
        'We may suspend or terminate accounts that violate these Terms.',
      ],
    },
    {
      title: '5. User Content',
      items: [
        'By posting content (price listings, photos, reviews, messages, etc.), you:',
        'Confirm you have the right to post it',
        'Grant Circub a non-exclusive, worldwide, royalty-free license to host, display, distribute, and use that content to operate and promote the Service (including in aggregated/anonymized data products described in our Privacy Policy)',
        'Remain responsible for the accuracy and legality of what you post',
        'We may remove content that violates these Terms or applicable law, at our discretion.',
      ],
    },
    {
      title: '6. Prohibited Conduct',
      items: [
        'You agree not to:',
        'Post false, misleading, or fraudulent price information',
        'Harass, threaten, or scam other users through messaging',
        'Impersonate another person or misrepresent your identity or location',
        'Scrape, copy, or resell Circub\'s data without permission',
        'Use the Service for any illegal purpose',
        'Attempt to bypass verification or security measures',
      ],
    },
    {
      title: '7. Messaging Between Users',
      items: [
        'Circub facilitates messaging between travelers and locals but is not a party to, and does not mediate, arrangements made between users. Exercise caution when meeting people or making arrangements based on conversations that start on Circub  never share sensitive financial information, and meet in safe public places if meeting in person.',
      ],
    },
    {
      title: '8. Payments (If Applicable)',
      items: [
        'If Circub enables in-app payments (e.g. tips or paid local consultations), separate payment terms and applicable fees will be disclosed at the time of transaction. Circub is not responsible for the outcome of any paid arrangement between users.',
      ],
    },
    {
      title: '9. Intellectual Property',
      items: [
        'The Circub name, logo, app, and platform design are owned by Tenetbid and protected by intellectual property laws. You may not use our branding without written permission.',
      ],
    },
    {
      title: '10. Disclaimers',
      items: [
        'THE SERVICE AND ALL CONTENT ARE PROVIDED “AS IS” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING ACCURACY, RELIABILITY, OR FITNESS FOR A PARTICULAR PURPOSE. Circub does not guarantee uninterrupted or error-free operation of the Service.',
      ],
    },
    {
      title: '11. Limitation of Liability',
      items: [
        'To the maximum extent permitted by law, Tenetbid shall not be liable for indirect, incidental, special, or consequential damages, or for any loss arising from reliance on user-submitted price information, interactions with other users, or use of the Service. Our total liability for any claim shall not exceed the amount you paid us (if any) in the 12 months preceding the claim.',
      ],
    },
    {
      title: '12. Indemnification',
      items: [
        'You agree to indemnify and hold Circub harmless from claims, damages, or expenses arising from your use of the Service, your content, or your violation of these Terms.',
      ],
    },
    {
      title: '13. Termination',
      items: [
        'You may delete your account at any time. We may suspend or terminate your access if you violate these Terms or for other reasonable operational or legal reasons, with notice where practicable.',
      ],
    },
    {
      title: '14. Changes to the Service or Terms',
      items: [
        'We may modify or discontinue features of the Service, and may update these Terms from time to time. We\'ll notify you of material changes (e.g. via the app or email). Continued use after changes take effect means you accept the updated Terms.',
      ],
    },
    {
      title: '15. Governing Law & Disputes',
      items: [
        'These Terms are governed by the laws of [Governing Law/Jurisdiction], without regard to conflict-of-law principles. Any disputes will be resolved in the courts of [Jurisdiction], unless otherwise required by applicable consumer protection law in your country of residence.',
      ],
    },
    {
      title: '16. Privacy',
      items: [
        'Our collection and use of your information is described in our Privacy Policy - please review it alongside these Terms.',
      ],
    },
    {
      title: '17. Contact Us',
      items: [
        'Questions about these Terms:',
        'Email: contact@tenetbid.com',
      ],
    },
  ],
  footer: 'These Terms are effective as of September 16, 2026 and apply to all users of the Circub platform.',
}
