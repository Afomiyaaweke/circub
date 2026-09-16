// Shared renderer for the legal documents (/privacy and /terms).
// Server component — static content from src/lib/legal-content.ts.
import Link from 'next/link'
import { ShieldCheck, ArrowLeft, FileText } from 'lucide-react'
import type { LegalDoc } from '@/lib/legal-content'

export function LegalPage({ doc, otherHref, otherLabel }: { doc: LegalDoc; otherHref: string; otherLabel: string }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to circub
        </Link>

        <div className="mt-6 rounded-xl border border-border bg-card shadow-sm p-5 sm:p-10">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{doc.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">Last updated: {doc.updated}</p>
            </div>
          </div>

          <div className="mt-5 p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs sm:text-sm text-emerald-900 flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
            <p className="leading-relaxed">
              By creating an account or using circub you confirm that you have read and agree to this
              document and our <Link href={otherHref} className="font-semibold underline underline-offset-2 hover:text-emerald-700">{otherLabel}</Link>.
            </p>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-foreground">{doc.intro}</p>

          <div className="mt-8 space-y-8">
            {doc.sections.map((s) => (
              <section key={s.title}>
                <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
                <ul className="mt-3 space-y-2">
                  {s.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                      <span className="flex-1">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {doc.footer && (
            <p className="mt-10 pt-5 border-t border-border text-xs text-muted-foreground">{doc.footer}</p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Questions? Email us at{' '}
            <a href="mailto:contact@tenetbid.com" className="text-primary font-medium hover:underline">contact@tenetbid.com</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
