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
// Default to gemini-2.5-flash (free tier, vision support, stable + current).
// Old default gemini-2.0-flash-exp was retired by Google and now returns
// "models/gemini-2.0-flash-exp is not found for API version v1beta".
//
// We keep a fallback chain of known models — if the primary model returns
// 404 (retired by Google), we automatically try the next one in the chain.
// This makes the scan resilient to Google retiring models without breaking
// existing deployments.
//
// If you want to pin a specific model, set the GEMINI_VISION_MODEL env var.
// Otherwise we try in order: gemini-2.5-flash → gemini-2.0-flash →
// gemini-2.0-flash-lite → gemini-1.5-flash.
const DEFAULT_MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash']
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || DEFAULT_MODEL_CHAIN[0]
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL_CHAIN[0]

// Cache the first model that worked so we don't waste time trying retired
// ones on every request after the first successful one.
let cachedWorkingModel: string | null = null

// Helper: call Gemini's generateContent endpoint with automatic model
// fallback. If the primary model returns 404 (retired by Google), try
// the next model in the fallback chain. Cache the first model that
// works so subsequent requests skip the failing ones.
async function geminiGenerate(
  endpoint: 'generateContent',
  defaultModel: string,
  body: Record<string, unknown>,
  apiKey: string
): Promise<{ ok: boolean; status: number; text: string; modelUsed: string | null }> {
  // Build the list of models to try: pinned model first (if user set env
  // var), then the fallback chain. If the pinned model fails with 404
  // (retired by Google), we override the pin and try the fallback chain
  // too — the user almost certainly set the env var to an outdated model
  // name and forgot to update it.
  let modelsToTry: string[]
  if (cachedWorkingModel) {
    modelsToTry = [cachedWorkingModel]
  } else if (process.env.GEMINI_VISION_MODEL) {
    // User pinned a specific model. Try it first, but ALSO add the fallback
    // chain after it — so if their pinned model is retired (404), we still
    // find a working model instead of failing.
    modelsToTry = [process.env.GEMINI_VISION_MODEL, ...DEFAULT_MODEL_CHAIN.filter((m) => m !== process.env.GEMINI_VISION_MODEL)]
  } else {
    modelsToTry = DEFAULT_MODEL_CHAIN
  }

  let lastError = ''
  for (const model of modelsToTry) {
    const url = `${GEMINI_BASE_URL}/models/${model}:${endpoint}?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text().catch(() => '')
    if (res.ok) {
      cachedWorkingModel = model
      return { ok: true, status: res.status, text, modelUsed: model }
    }
    // 404 = model retired/not available — try the next model in the chain.
    // This now ALSO applies when the user pinned a model via env var — we
    // silently fall through to the fallback chain instead of failing.
    // 400 = bad request (e.g. invalid API key, malformed body) — don't retry,
    //   the user needs to fix their key.
    if (res.status === 404) {
      console.warn(`[gemini] model ${model} returned 404, trying next in chain`)
      lastError = text
      continue
    }
    // For other errors (400, 401, 403, 429, 500, etc.), return immediately.
    return { ok: false, status: res.status, text, modelUsed: model }
  }
  // All models failed with 404
  return {
    ok: false,
    status: 404,
    text: lastError || 'All Gemini models in the fallback chain returned 404 (retired by Google). Set GEMINI_VISION_MODEL env var to a current model from https://ai.google.dev/gemini-api/docs/models',
    modelUsed: null,
  }
}

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

  const body = {
    contents: userContents,
    generationConfig: {
      temperature: 0.1, // low temperature for deterministic detection
      maxOutputTokens: 4096,
      responseMimeType: 'application/json', // Gemini will return JSON directly
    },
  }

  const result = await geminiGenerate('generateContent', GEMINI_VISION_MODEL, body, apiKey)
  if (!result.ok) {
    throw new Error(`Gemini vision API ${result.status} (model: ${result.modelUsed || 'none'}): ${result.text.slice(0, 300)}`)
  }
  let data: any
  try {
    data = JSON.parse(result.text)
  } catch {
    return cleanJsonResponse(result.text)
  }
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

  const body = {
    contents: userContents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  }

  const result = await geminiGenerate('generateContent', GEMINI_TEXT_MODEL, body, apiKey)
  if (!result.ok) {
    throw new Error(`Gemini text API ${result.status} (model: ${result.modelUsed || 'none'}): ${result.text.slice(0, 300)}`)
  }
  let data: any
  try {
    data = JSON.parse(result.text)
  } catch {
    return cleanJsonResponse(result.text)
  }
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
