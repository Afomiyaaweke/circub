// ZAI API client — bypasses the z-ai-web-dev-sdk so we can read credentials
// from environment variables (works on Vercel) instead of a hard-coded
// .z-ai-config file at /etc/.z-ai-config (which only exists in the dev
// sandbox and is not deployed to Vercel).
//
// Configuration priority:
//   1. Env vars: ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN
//   2. .z-ai-config file at process.cwd(), ~/.z-ai-config, or /etc/.z-ai-config
//      (works for local dev — the sandbox has /etc/.z-ai-config)
//
// Two ZAI endpoint variants are supported:
//
//   A) Public BigModel OpenAI-compatible endpoint (works on Vercel):
//        ZAI_BASE_URL = https://api.z.ai/api/paas/v4
//      The .z-ai-config apiKey value 'Z.ai' is NOT a real BigModel API key.
//      For the public endpoint you need a real API key from
//      https://open.bigmodel.cn/usercenter/apikeys (Chinese site) — sign in
//      with the same account you use for chat.z.ai, then create an API key.
//
//   B) Internal sandbox endpoint (works in the dev sandbox only — private
//      network 172.25.x.x):
//        ZAI_BASE_URL = https://internal-api.z.ai/v1
//      This is what /etc/.z-ai-config points to. Vercel can't reach it.

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

let cachedConfig: ZaiConfig | null = null

async function loadConfig(): Promise<ZaiConfig> {
  if (cachedConfig) return cachedConfig

  // 1. Try env vars first (production / Vercel)
  //    Required: ZAI_BASE_URL + ZAI_API_KEY
  //    Optional: ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN (only needed for the
  //    internal sandbox endpoint, not for the public BigModel endpoint)
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

  throw new Error(
    'ZAI config not found. Set ZAI_BASE_URL and ZAI_API_KEY env vars on Vercel.\n' +
    'For the public BigModel API (works on Vercel):\n' +
    '  ZAI_BASE_URL = https://api.z.ai/api/paas/v4\n' +
    '  ZAI_API_KEY  = (your real BigModel API key from https://open.bigmodel.cn/usercenter/apikeys)\n' +
    'For the internal sandbox (dev only):\n' +
    '  ZAI_BASE_URL = https://internal-api.z.ai/v1\n' +
    '  ZAI_API_KEY  = Z.ai (the placeholder works on the internal sandbox)\n' +
    '  ZAI_TOKEN    = (your session JWT)'
  )
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

  // The public BigModel endpoint (api.z.ai/api/paas/v4) is OpenAI-compatible
  // and REQUIRES the "model" parameter. The internal sandbox ignores it
  // (uses glm-4-plus by default). Set it always so both endpoints work.
  const body: Record<string, unknown> = {
    messages,
    thinking: { type: options.thinking || 'disabled' },
    model: process.env.ZAI_MODEL || 'glm-4.6',
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
  // The vision endpoint path. The internal sandbox uses /chat/completions/vision
  // (the .z-ai-web-dev-sdk default). The public BigModel endpoint doesn't have
  // a separate /vision path — it uses the same /chat/completions endpoint and
  // detects vision via the message content type.
  const isPublicEndpoint = config.baseUrl.includes('api.z.ai/api/paas') || config.baseUrl.includes('open.bigmodel.cn')
  const visionPath = isPublicEndpoint ? '/chat/completions' : '/chat/completions/vision'
  const url = `${config.baseUrl}${visionPath}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  }
  if (config.chatId) headers['X-Chat-Id'] = config.chatId
  if (config.userId) headers['X-User-Id'] = config.userId
  if (config.token) headers['X-Token'] = config.token

  // Public BigModel endpoint requires a vision-capable model. glm-4v-flash
  // is the free-tier vision model on the public BigModel API. The internal
  // sandbox uses glm-4-plus by default (which also supports vision).
  const visionModel = process.env.ZAI_VISION_MODEL || (isPublicEndpoint ? 'glm-4v-flash' : 'glm-4-plus')
  const body: Record<string, unknown> = {
    messages,
    thinking: { type: options.thinking || 'disabled' },
    model: visionModel,
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
    throw new Error(`ZAI vision API ${res.status} (model: ${visionModel}): ${errText.slice(0, 200)}`)
  }
  const data = (await res.json()) as ChatCompletionResponse
  return data.choices?.[0]?.message?.content || ''
}
