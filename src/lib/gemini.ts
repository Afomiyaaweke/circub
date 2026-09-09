// Gemini (Google AI Studio) VLM client — free tier, public API endpoint.
//
// Uses gemini-2.0-flash-exp (or gemini-2.5-flash if available) which has
// generous free limits:
//   - 15 RPM (requests per minute)
//   - 1500 requests per day
//   - 1M tokens per minute
//
// Required env var on Vercel:
//   GEMINI_API_KEY = (get from https://aistudio.google.com/apikey)
//
// The API endpoint is publicly reachable from Vercel (unlike the ZAI
// internal API which is on a private network).
//
// Fallback to ZAI (the dev sandbox provider) when GEMINI_API_KEY is not
// set — so the scan still works in the dev sandbox without configuration.

import { visionChatComplete as zaiVisionChat, chatComplete as zaiChat } from './zai'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
// gemini-2.0-flash-exp is currently the free-tier vision model.
// Other options: gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash-exp'
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash-exp'

interface GeminiTextPart {
  text: string
}
interface GeminiInlineDataPart {
  inlineData: { mimeType: string; data: string } // base64
}
type GeminiPart = GeminiTextPart | GeminiInlineDataPart

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null
}

// Strip markdown code fences and any prose around JSON arrays/objects.
// Gemini sometimes wraps responses in ```json ... ``` even when asked not to.
function cleanJsonResponse(raw: string): string {
  let s = raw.trim()
  // Remove markdown fences
  s = s.replace(/```(?:json)?\s*/g, '').replace(/```/g, '')
  // If response contains a JSON array or object, extract just that part.
  const arrayMatch = s.match(/\[[\s\S]*\]/)
  const objectMatch = s.match(/\{[\s\S]*\}/)
  if (arrayMatch) return arrayMatch[0]
  if (objectMatch) return objectMatch[0]
  return s.trim()
}

// ---- Vision chat: detect products in an image ----
// imageUrl is expected to be a data URL like "data:image/jpeg;base64,..."
// We convert it to Gemini's inlineData format (mimeType + base64 string).
export async function visionChatComplete(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
  _options: { thinking?: 'enabled' | 'disabled' } = {}
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    // Fall back to ZAI in the dev sandbox
    return zaiVisionChat(messages as any, _options)
  }

  // Flatten the OpenAI-style messages into Gemini's format.
  // Gemini doesn't support system messages directly — we prepend the
  // system message text to the first user message.
  let systemPrefix = ''
  const userContents: GeminiContent[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrefix += (typeof msg.content === 'string' ? msg.content : '') + '\n'
      continue
    }
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user'
    const parts: GeminiPart[] = []
    if (typeof msg.content === 'string') {
      parts.push({ text: systemPrefix + msg.content })
      systemPrefix = ''
    } else if (Array.isArray(msg.content)) {
      let textParts: string[] = []
      if (systemPrefix) {
        textParts.push(systemPrefix)
        systemPrefix = ''
      }
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          textParts.push(part.text)
        } else if (part.type === 'image_url' && part.image_url?.url) {
          // Push any accumulated text first
          if (textParts.length > 0) {
            parts.push({ text: textParts.join('\n') })
            textParts = []
          }
          // Parse the data URL: "data:image/jpeg;base64,XXXX..."
          const url = part.image_url.url
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1], data: match[2] },
            })
          }
        }
      }
      if (textParts.length > 0) {
        parts.push({ text: textParts.join('\n') })
      }
    }
    if (parts.length > 0) userContents.push({ role, parts })
  }

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`
  const body = {
    contents: userContents,
    generationConfig: {
      temperature: 0.1, // low temperature for deterministic detection
      maxOutputTokens: 4096,
      responseMimeType: 'application/json', // Gemini will return JSON directly
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini vision API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  // Response shape: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .filter(Boolean)
      .join('\n') || ''
  return cleanJsonResponse(text)
}

// ---- Text chat: price estimation (no image) ----
export async function chatComplete(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  _options: { thinking?: 'enabled' | 'disabled' } = {}
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    // Fall back to ZAI in the dev sandbox
    return zaiChat(messages as any, _options)
  }

  let systemPrefix = ''
  const userContents: GeminiContent[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrefix += msg.content + '\n'
      continue
    }
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user'
    userContents.push({
      role,
      parts: [{ text: (systemPrefix ? systemPrefix : '') + msg.content }],
    })
    systemPrefix = ''
  }

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`
  const body = {
    contents: userContents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini text API ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .filter(Boolean)
      .join('\n') || ''
  return cleanJsonResponse(text)
}

// Check if Gemini is configured (env var present)
export function isGeminiConfigured(): boolean {
  return Boolean(getApiKey())
}
