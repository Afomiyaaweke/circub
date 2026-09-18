// Client-safe currency picker data. Lives OUTSIDE price-core because that
// module imports the Prisma client and the AI SDK (server-only) - importing
// it from a client component breaks the Turbopack build.

export const CURRENCY_CHOICES: Array<{ code: string; label: string }> = [
  { code: 'ETB', label: 'Birr (ETB)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'KES', label: 'Kenyan Shilling (KES)' },
  { code: 'UGX', label: 'Ugandan Shilling (UGX)' },
  { code: 'TZS', label: 'Tanzanian Shilling (TZS)' },
  { code: 'NGN', label: 'Naira (NGN)' },
  { code: 'GHS', label: 'Cedi (GHS)' },
  { code: 'ZAR', label: 'Rand (ZAR)' },
  { code: 'EGP', label: 'Egyptian Pound (EGP)' },
  { code: 'INR', label: 'Indian Rupee (INR)' },
  { code: 'CNY', label: 'Yuan (CNY)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'SAR', label: 'Saudi Riyal (SAR)' },
]
