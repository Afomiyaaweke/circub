// ZAI API client — bypasses the z-ai-web-dev-sdk so we can read credentials
// from environment variables (works on Vercel) instead of a hard-coded
// .z-ai-config file at /etc/.z-ai-config (which only exists in the dev
// sandbox and is not deployed to Vercel).
//
// Configuration priority:
//   1. Env vars: ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN
//   2. .z-ai-config file at process.cwd(), ~/.z-ai-config, or /etc/.z-ai-config
//      (works for local dev — the sandbox has /etc/.z-ai-config)
//   3. Hardcoded fallback below (the credentials used in the dev sandbox)
//      — enables the scan to work out-of-the-box on Vercel without setting
//      env vars. If the token expires, override with env vars.
//
// To override (recommended for production), set on Vercel:
//   ZAI_BASE_URL  = https://internal-api.z.ai/v1
//   ZAI_API_KEY   = Z.ai
//   ZAI_CHAT_ID   = chat-260d9bce-6954-4dc7-a5b2-9a9d997a81fc
//   ZAI_USER_ID   = 94e3865c-bde8-4d7f-a630-7d22dac251f0
//   ZAI_TOKEN     = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

interface ZaiConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

// Hardcoded fallback config — same as /etc/.z-ai-config in the dev sandbox.
// Used when neither env vars nor .z-ai-config file are available (e.g. on
// Vercel). If the JWT token expires, override with env vars.
// SECURITY NOTE: this token is session-scoped and may expire. For long-term
// production use, set ZAI_TOKEN env var on Vercel with a fresh token.
const FALLBACK_CONFIG: ZaiConfig = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-260d9bce-6954-4dc7-a5b2-9a9d997a81fc',
  userId: '94e3865c-bde8-4d7f-a630-7d22dac251f0',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTRlMzg2NWMtYmRlOC00ZDdmLWE2MzAtN2QyMmRhYzI1MWYwIiwiY2hhdF9pZCI6ImNoYXQtMjYwZDliY2UtNjk1NC00ZGM3LWE1YjItOWE5ZDk5N2E4MWZjIiwicGxhdGZvcm0iOiJ6YWkifQ.3P56qThiKqUG3UP-UFtYuA6UXkDxc7Y3DgqYYsd271w',
}

let cachedConfig: ZaiConfig | null = null

async function loadConfig(): Promise<ZaiConfig> {
  if (cachedConfig) return cachedConfig

  // 1. Try env vars first (production / Vercel — overrides the fallback)
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY) {
    cachedConfig = {
      baseUrl: process.env.ZAI_BASE_URL,
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      userId: process.env.ZAI_USER_ID,
      token: process.env.ZAI_TOKEN,
    }
    return cachedConfig
  }

  // 2. Try .z-ai-config file (local dev sandbox has /etc/.z-ai-config)
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const filePath of configPaths) {
    try {
      const configStr = await fs.promises.readFile(filePath, 'utf-8')
      const config = JSON.parse(configStr)
      if (config.baseUrl && config.apiKey) {
        cachedConfig = config
        return cachedConfig
      }
    } catch {
      // try next path
    }
  }

  // 3. Fallback to hardcoded config — works on Vercel without env vars.
  // The token may expire over time; if it does, override with ZAI_TOKEN env var.
  console.warn('[zai] using hardcoded fallback config — for production, set ZAI_BASE_URL, ZAI_API_KEY, ZAI_TOKEN env vars')
  cachedConfig = FALLBACK_CONFIG
  return cachedConfig
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
}

interface ChatCompletionResponse {
  choices: Array<{
    finish_reason: string
    index: number
    message: { role: string; content: string }
  }>
}

// Text-only chat completion
export async function chatComplete(
  messages: ChatMessage[],
  options: { thinking?: 'enabled' | 'disabled' } = {}
): Promise<string> {
  const config = await loadConfig()
  const url = `${config.baseUrl}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  }
  if (config.chatId) headers['X-Chat-Id'] = config.chatId
  if (config.userId) headers['X-User-Id'] = config.userId
  if (config.token) headers['X-Token'] = config.token

  const body: Record<string, unknown> = {
    messages,
    thinking: { type: options.thinking || 'disabled' },
  }
  if (config.chatId) body.chatId = config.chatId
  if (config.userId) body.userId = config.userId

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`ZAI chat API ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = (await res.json()) as ChatCompletionResponse
  return data.choices?.[0]?.message?.content || ''
}

// Vision chat completion (same API but uses /chat/completions/vision)
export async function visionChatComplete(
  messages: ChatMessage[],
  options: { thinking?: 'enabled' | 'disabled' } = {}
): Promise<string> {
  const config = await loadConfig()
  const url = `${config.baseUrl}/chat/completions/vision`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  }
  if (config.chatId) headers['X-Chat-Id'] = config.chatId
  if (config.userId) headers['X-User-Id'] = config.userId
  if (config.token) headers['X-Token'] = config.token

  const body: Record<string, unknown> = {
    messages,
    thinking: { type: options.thinking || 'disabled' },
  }
  if (config.chatId) body.chatId = config.chatId
  if (config.userId) body.userId = config.userId

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`ZAI vision API ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = (await res.json()) as ChatCompletionResponse
  return data.choices?.[0]?.message?.content || ''
}
