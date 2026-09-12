import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadZaiConfig, getZaiClient } from '@/lib/zai-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/scan-debug — deployment marker + AI-path diagnostics.
//
// Purpose: when scanning fails in production we need to know exactly WHERE it
// breaks (config missing? SDK import failing? upstream quota 429?). This
// endpoint reports the full chain without leaking secrets.
//
//   GET /api/scan-debug          -> config + SDK import report (no AI call)
//   GET /api/scan-debug?probe=1  -> also fires ONE tiny AI text completion
//
// Safe to keep deployed: GET-only, no secrets in responses (token length and
// JWT claims only — the claims are already public in the repo).
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1] || ''
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const probe = req.nextUrl.searchParams.get('probe') === '1'
  const report: Record<string, unknown> = {
    marker: 'scan-debug-v1',
    time: new Date().toISOString(),
    node: process.version,
  }

  // 1) Which config files exist?
  report.configFiles = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
    '/tmp/.z-ai-config',
  ].map((p) => ({ path: p, exists: fs.existsSync(p) }))

  // 2) Which ZAI_* env vars are set? (values never returned)
  const envKeys = [
    'ZAI_BASE_URL', 'ZAI_API_KEY', 'ZAI_CHAT_ID', 'ZAI_USER_ID',
    'ZAI_TOKEN', 'ZAI_PROXY_URL', 'ZAI_PROXY_URLS',
  ]
  report.envVars = Object.fromEntries(envKeys.map((k) => [k, process.env[k] ? 'set' : 'unset']))

  // 3) Resolved config (same priority as /api/scan) — metadata only
  const { config, source } = await loadZaiConfig()
  report.configSource = source
  report.baseUrl = config.baseUrl
  report.chatId = config.chatId || null
  report.tokenLength = config.token.length
  report.tokenClaims = decodeJwtPayload(config.token)

  // 4) SDK import + optional live probe
  const t0 = Date.now()
  try {
    const { client } = await getZaiClient()
    report.sdkImport = `ok (${Date.now() - t0}ms)`
    if (probe) {
      const p0 = Date.now()
      try {
        const res = (await client.chat.completions.create({
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
          thinking: { type: 'disabled' },
        })) as { choices?: Array<{ message?: { content?: string } }> }
        report.probe = {
          ok: true,
          ms: Date.now() - p0,
          reply: String(res.choices?.[0]?.message?.content ?? '').slice(0, 60),
        }
      } catch (e) {
        report.probe = {
          ok: false,
          ms: Date.now() - p0,
          error: String((e as Error)?.message || e).slice(0, 240),
        }
      }
    } else {
      report.probe = 'add ?probe=1 to also test one live AI call'
    }
  } catch (e) {
    report.sdkImport = `failed: ${String((e as Error)?.message || e).slice(0, 200)}`
  }

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
}
