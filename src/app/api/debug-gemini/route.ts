// Diagnostic endpoint for Gemini configuration.
// Visit /api/debug-gemini to see:
//   - Whether GEMINI_API_KEY is set
//   - What models are currently available with that key (live API call)
//   - What env vars are configured (GEMINI_VISION_MODEL etc.)
//
// This is public (no auth required) — it only reveals which models are
// available with the configured key, not the key value itself.
import { NextResponse } from 'next/server'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY || null
  const result: any = {
    timestamp: new Date().toISOString(),
    env: {
      GEMINI_API_KEY_set: Boolean(apiKey),
      GEMINI_API_KEY_preview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null,
      GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL || null,
      GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || null,
    },
  }

  if (!apiKey) {
    result.error = 'GEMINI_API_KEY env var is not set on Vercel. Get a free key at https://aistudio.google.com/apikey'
    result.zai_fallback = 'Without GEMINI_API_KEY, the scan falls back to ZAI which only works in the dev sandbox (private network).'
    return NextResponse.json(result)
  }

  // Try to list available models with the configured key
  try {
    const listUrl = `${GEMINI_BASE_URL}/models?key=${apiKey}`
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(8000) })
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => '')
      result.listModels = { ok: false, status: listRes.status, error: text.slice(0, 400) }
    } else {
      const data = await listRes.json()
      const models = (data.models || []).map((m: any) => ({
        name: m.name, // e.g. "models/gemini-2.5-flash"
        displayName: m.displayName,
        supportedGenerationMethods: m.supportedGenerationMethods || [],
      }))
      result.listModels = {
        ok: true,
        count: models.length,
        // Only show models that support generateContent (text/vision)
        usable: models.filter((m: any) => m.supportedGenerationMethods.includes('generateContent')),
      }
    }
  } catch (e: any) {
    result.listModels = { ok: false, error: e.message }
  }

  // Also test a generateContent call with gemini-2.5-flash directly
  try {
    const testUrl = `${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    const testRes = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK' }] }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (testRes.ok) {
      result.testCall = { ok: true, status: 200, model: 'gemini-2.5-flash' }
    } else {
      const text = await testRes.text().catch(() => '')
      result.testCall = { ok: false, status: testRes.status, error: text.slice(0, 400), model: 'gemini-2.5-flash' }
    }
  } catch (e: any) {
    result.testCall = { ok: false, error: e.message, model: 'gemini-2.5-flash' }
  }

  return NextResponse.json(result)
}
