'use client'

// Contact Us - "Send Us a Message" form + "Get in Touch" info panel.
// Contact information matches the approved design EXACTLY:
//   PHONE: +251 956 140 291
//   SUPPORT: support@tenetbid.com
//   GENERAL INQUIRIES: contact@tenetbid.com
//   BUSINESS HOURS: Mon-Fri: 8:30 AM - 5:30 PM EAT, Sat: 9:00 AM - 1:00 PM EAT

import { useState } from 'react'
import {
  Phone,
  Mail,
  MessagesSquare,
  Clock,
  Send,
  ArrowLeft,
  Loader2,
  CircleCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

export function ContactClient() {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in your name, email and message.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send your message')
      setSent(true)
      toast({ title: 'Message sent', description: 'We will get back to you as soon as possible.' })
    } catch (err) {
      setError((err as Error).message)
      toast({ title: 'Send failed', description: (err as Error).message, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ===== Top bar - dark navy ===== */}
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to circub
          </a>
          <h1 className="text-3xl sm:text-4xl font-bold">Contact Us</h1>
          <p className="mt-2 text-slate-300 text-sm sm:text-base max-w-2xl">
            Questions, feedback or partnership ideas - we would love to hear from you.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* ===== Left - Send Us a Message ===== */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center mb-4">
              <MessagesSquare className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Send Us a Message</h2>
            <p className="mt-2 text-sm text-slate-500">
              Fill out the form below and our team will get back to you. For urgent issues, email us
              directly at{' '}
              <a
                href="mailto:support@tenetbid.com"
                className="text-orange-600 font-medium hover:underline"
              >
                support@tenetbid.com
              </a>
              .
            </p>

            {sent ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <CircleCheck className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-900">Message sent!</p>
                <p className="mt-1 text-sm text-slate-600">
                  Thanks for reaching out - we will reply to <span className="font-medium">{email}</span> as
                  soon as possible.
                </p>
                <button
                  onClick={() => {
                    setSent(false)
                    setName('')
                    setEmail('')
                    setSubject('')
                    setMessage('')
                  }}
                  className="mt-4 text-sm font-medium text-orange-600 hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="contact-name" className="text-xs font-medium text-slate-600">
                      Name *
                    </label>
                    <Input
                      id="contact-name"
                      placeholder="Your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="contact-email" className="text-xs font-medium text-slate-600">
                      Email *
                    </label>
                    <Input
                      id="contact-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="contact-subject" className="text-xs font-medium text-slate-600">
                    Subject
                  </label>
                  <Input
                    id="contact-subject"
                    placeholder="How can we help?"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="contact-message" className="text-xs font-medium text-slate-600">
                    Message *
                  </label>
                  <Textarea
                    id="contact-message"
                    placeholder="Tell us more about your question or feedback..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    className="min-h-[130px] resize-y bg-white"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white gap-2 h-11 px-6"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            )}
          </section>

          {/* ===== Right - Get in Touch ===== */}
          <section className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <Phone className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Get in Touch</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Reach us directly through any of the channels below - we typically respond within one
                  business day.
                </p>
              </div>
            </div>

            {/* PHONE */}
            <div className="flex items-start gap-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Phone</p>
                <a
                  href="tel:+251956140291"
                  className="mt-0.5 block font-semibold text-slate-900 hover:text-orange-600 transition-colors"
                >
                  +251 956 140 291
                </a>
              </div>
            </div>

            {/* SUPPORT */}
            <div className="flex items-start gap-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Support</p>
                <a
                  href="mailto:support@tenetbid.com"
                  className="mt-0.5 block font-semibold text-slate-900 hover:text-orange-600 transition-colors break-all"
                >
                  support@tenetbid.com
                </a>
              </div>
            </div>

            {/* GENERAL INQUIRIES */}
            <div className="flex items-start gap-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                <MessagesSquare className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  General Inquiries
                </p>
                <a
                  href="mailto:contact@tenetbid.com"
                  className="mt-0.5 block font-semibold text-slate-900 hover:text-orange-600 transition-colors break-all"
                >
                  contact@tenetbid.com
                </a>
              </div>
            </div>

            {/* BUSINESS HOURS */}
            <div className="flex items-start gap-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Business Hours
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">Mon-Fri: 8:30 AM - 5:30 PM EAT</p>
                <p className="text-sm text-slate-600">Sat: 9:00 AM - 1:00 PM EAT</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
