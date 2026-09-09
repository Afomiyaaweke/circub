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
// On Vercel, you MUST set these env vars in the dashboard:
//   ZAI_BASE_URL  = https://internal-api.z.ai/v1
//   ZAI_API_KEY   = (the apiKey value from your .z-ai-config)
//   ZAI_CHAT_ID   = (the chatId value, optional)
//   ZAI_USER_ID   = (the userId value, optional)
//   ZAI_TOKEN     = (the token value, optional)

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

  // 2. Fall back to .z-ai-config file (local dev sandbox has /etc/.z-ai-config)
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
    'ZAI config not found. Set ZAI_BASE_URL and ZAI_API_KEY env vars (Vercel), ' +
    'or create .z-ai-config in the project root / home dir / /etc/.z-ai-config (local dev).'
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
