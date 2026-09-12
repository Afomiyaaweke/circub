import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---------------------------------------------------------------------------
// ZAI client configuration + construction.
//
// The z-ai-web-dev-sdk normally locates its config by scanning files
// (cwd/.z-ai-config, ~/.z-ai-config, /etc/.z-ai-config) which requires writing
// a config file to /tmp and monkey-patching process.cwd() on serverless
// platforms. That is fragile on Vercel. This module resolves the config
// explicitly (env vars -> config files -> baked fallback) and constructs the
// SDK client DIRECTLY via its exported class, bypassing file discovery
// entirely.
// ---------------------------------------------------------------------------

export interface ZaiConfig {
  baseUrl: string
  apiKey: string
  chatId: string
  userId: string
  token: string
}

// Last-resort credentials baked into the repo (public platform JWT for the
// app's AI account). Env vars and config files always take priority.
const FALLBACK: ZaiConfig = {
  baseUrl: 'https://internal-api.z.ai/v1',
  apiKey: 'Z.ai',
  chatId: 'chat-4d8415c1-2b4e-4a0c-985e-795e389c285c',
  userId: '94e3865c-bde8-4d7f-a630-7d22dac251f0',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTRlMzg2NWMtYmRlOC00ZDdmLWE2MzAtN2QyMmRhYzI1MWYwIiwiY2hhdF9pZCI6ImNoYXQtNGQ4NDE1YzEtMmI0ZS00YTBjLTk4NWUtNzk1ZTM4OWMyODVjIiwicGxhdGZvcm0iOiJ6YWkifQ.CINbKi15TI8pRtO6NkDKCXUzBLqgwkffONOxMTZbyrg',
}

export function zaiConfigFilePaths(): string[] {
  return [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
    '/tmp/.z-ai-config',
  ]
}

export async function loadZaiConfig(): Promise<{ config: ZaiConfig; source: string }> {
  // 1) Environment variables (highest priority — recommended for Vercel)
  const envToken = process.env.ZAI_TOKEN
  if (process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY && envToken) {
    return {
      config: {
        baseUrl: process.env.ZAI_BASE_URL,
        apiKey: process.env.ZAI_API_KEY,
        chatId: process.env.ZAI_CHAT_ID || '',
        userId: process.env.ZAI_USER_ID || '',
        token: envToken,
      },
      source: 'env',
    }
  }

  // 2) Config files (sandbox / self-hosted)
  for (const p of zaiConfigFilePaths()) {
    try {
      const cfg = JSON.parse(await fs.promises.readFile(p, 'utf-8'))
      if (cfg.baseUrl && cfg.apiKey && cfg.token) {
        return {
          config: {
            baseUrl: String(cfg.baseUrl),
            apiKey: String(cfg.apiKey),
            chatId: String(cfg.chatId || ''),
            userId: String(cfg.userId || ''),
            token: String(cfg.token),
          },
          source: p,
        }
      }
    } catch {
      // missing or invalid — try the next source
    }
  }

  // 3) Baked fallback
  return { config: FALLBACK, source: 'baked-fallback' }
}

export interface ZaiClient {
  chat: {
    completions: {
      create(body: unknown): Promise<unknown>
      createVision(body: unknown): Promise<unknown>
    }
  }
  functions: {
    invoke(name: string, args?: Record<string, unknown>): Promise<unknown>
  }
}

export async function getZaiClient(): Promise<{ client: ZaiClient; source: string }> {
  const { config, source } = await loadZaiConfig()
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  // Construct directly — no config-file discovery, no process.cwd() patching.
  // (The SDK's types mark the constructor private to steer you at ZAI.create(),
  // but the runtime constructor is public and accepts the exact same config
  // object that loadConfig() would have returned.)
  const Ctor = ZAI as unknown as new (cfg: ZaiConfig) => ZaiClient
  return { client: new Ctor(config), source }
}
