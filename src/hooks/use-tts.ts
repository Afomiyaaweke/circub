'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Maps a human-readable language name (e.g. "Amharic", "Mandarin") to a
 * BCP-47 tag the Web Speech API understands (e.g. "am-ET", "zh-CN").
 *
 * Falls back to en-US if the language is unknown or if the browser doesn't
 * expose a matching voice.
 */
const LANGUAGE_TO_BCP47: Record<string, string> = {
  // Africa
  amharic: 'am-ET', swahili: 'sw-KE', arabic: 'ar-SA', oromo: 'om-ET',
  tigrinya: 'ti-ET', yoruba: 'yo-NG', igbo: 'ig-NG', hausa: 'ha-NG',
  zulu: 'zu-ZA', xhosa: 'xh-ZA', afrikaans: 'af-ZA', somali: 'so-SO',
  shona: 'sn-ZW', kinyarwanda: 'rw-RW', lingala: 'ln-CD', bambara: 'bm-ML',
  wolof: 'wo-SN', malagasy: 'mg-MG', twi: 'ak-GH',
  // Europe
  english: 'en-US', french: 'fr-FR', spanish: 'es-ES', portuguese: 'pt-PT',
  german: 'de-DE', italian: 'it-IT', dutch: 'nl-NL', russian: 'ru-RU',
  polish: 'pl-PL', swedish: 'sv-SE', norwegian: 'nb-NO', danish: 'da-DK',
  finnish: 'fi-FI', greek: 'el-GR', turkish: 'tr-TR', czech: 'cs-CZ',
  romanian: 'ro-RO', hungarian: 'hu-HU', ukrainian: 'uk-UA', catalan: 'ca-ES',
  // Asia
  mandarin: 'zh-CN', cantonese: 'zh-HK', japanese: 'ja-JP', korean: 'ko-KR',
  hindi: 'hi-IN', bengali: 'bn-IN', tamil: 'ta-IN', telugu: 'te-IN',
  urdu: 'ur-PK', persian: 'fa-IR', thai: 'th-TH', vietnamese: 'vi-VN',
  indonesian: 'id-ID', malay: 'ms-MY', tagalog: 'fil-PH', khmer: 'km-KH',
  burmese: 'my-MM', nepali: 'ne-NP', sinhala: 'si-LK', kazakh: 'kk-KZ',
  // Middle East
  hebrew: 'he-IL', kurdish: 'ku-TR', pashto: 'ps-AF', dari: 'fa-AF',
}

/**
 * Resolve a BCP-47 tag from a human language name or from an ISO country code.
 * Returns en-US as a safe fallback.
 */
export function resolveBcp47(input?: string | null): string {
  if (!input) return 'en-US'
  const k = input.trim().toLowerCase()
  if (LANGUAGE_TO_BCP47[k]) return LANGUAGE_TO_BCP47[k]
  // Already a BCP-47 tag?
  if (/^[a-z]{2}(-[a-z0-9]{2,4})?$/i.test(input)) return input
  return 'en-US'
}

interface UseTtsOptions {
  /** Voice the text in this language (human name or BCP-47 tag). Default en-US. */
  lang?: string
  /** Rate of speech, 0.1–10. Default 1. */
  rate?: number
  /** Pitch, 0–2. Default 1. */
  pitch?: number
  /** Volume, 0–1. Default 1. */
  volume?: number
}

export function useTts(options: UseTtsOptions = {}) {
  const { lang = 'en-US', rate = 1, pitch = 1, volume = 1 } = options
  const [speaking, setSpeaking] = useState(false)
  const [supported, setSupported] = useState(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  // Detect support + load a matching voice for the requested language.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    setSupported(true)

    const targetLang = resolveBcp47(lang).toLowerCase()
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length === 0) return
      // Prefer an exact BCP-47 match (e.g. "am-ET")
      let v = voices.find((x) => x.lang.toLowerCase() === targetLang)
      // Then a language-prefix match (e.g. "am" matches "am-ET" and "am")
      if (!v) v = voices.find((x) => x.lang.toLowerCase().split('-')[0] === targetLang.split('-')[0])
      // Then English as a last resort so we always get *some* audio
      if (!v) v = voices.find((x) => x.lang.toLowerCase().startsWith('en'))
      voiceRef.current = v ?? voices[0] ?? null
    }
    loadVoice()
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoice)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoice)
  }, [lang])

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return
    // Cancel anything currently being said so rapid taps don't pile up.
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = resolveBcp47(lang)
    u.rate = rate
    u.pitch = pitch
    u.volume = volume
    if (voiceRef.current) u.voice = voiceRef.current
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
  }, [lang, rate, pitch, volume])

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  // Stop speaking when the component using this hook unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return { speak, stop, speaking, supported }
}
