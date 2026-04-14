#!/usr/bin/env node

/**
 * Usage:
 *   node scripts/test-custom-provider.mjs --base https://example.com --model claude-opus4.6 --key sk-xxx
 *   node scripts/test-custom-provider.mjs --base https://example.com --model claude-opus4.6
 *   (or set env API_KEY)
 */

function parseArgs(argv) {
  const result = {}
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--base') result.base = argv[i + 1]
    if (arg === '--model') result.model = argv[i + 1]
    if (arg === '--key') result.key = argv[i + 1]
  }
  return result
}

function normalizeBase(base) {
  const trimmed = String(base || '').trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Missing --base')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

function buildHeaders(apiKey) {
  return apiKey
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
    : {
        'Content-Type': 'application/json',
      }
}

async function readBodySafe(response) {
  try {
    const text = await response.text()
    return text.slice(0, 600)
  } catch (error) {
    return `<<read body failed: ${error instanceof Error ? error.message : String(error)}>>`
  }
}

async function testModels(baseUrl, headers) {
  const url = `${baseUrl}/models`
  const response = await fetch(url, { method: 'GET', headers })
  const body = await readBodySafe(response)
  return { url, status: response.status, ok: response.ok, body }
}

async function testChat(baseUrl, headers, model) {
  const url = `${baseUrl}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1,
      temperature: 0,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  })
  const body = await readBodySafe(response)
  return { url, status: response.status, ok: response.ok, body }
}

async function main() {
  const args = parseArgs(process.argv)
  const model = args.model || 'gpt-4o-mini'
  const key = args.key || process.env.API_KEY || ''
  const baseUrl = normalizeBase(args.base)
  const headers = buildHeaders(key)

  console.log('== Custom Provider Connectivity Check ==')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`Model: ${model}`)
  console.log(`API key provided: ${key ? 'yes' : 'no'}`)
  console.log('')

  try {
    const models = await testModels(baseUrl, headers)
    console.log('[1] GET /models')
    console.log(`URL: ${models.url}`)
    console.log(`Status: ${models.status} (${models.ok ? 'OK' : 'FAIL'})`)
    console.log(`Body (first 600 chars): ${models.body}`)
    console.log('')
  } catch (error) {
    console.log('[1] GET /models')
    console.log(`Request failed: ${error instanceof Error ? error.message : String(error)}`)
    console.log('')
  }

  try {
    const chat = await testChat(baseUrl, headers, model)
    console.log('[2] POST /chat/completions')
    console.log(`URL: ${chat.url}`)
    console.log(`Status: ${chat.status} (${chat.ok ? 'OK' : 'FAIL'})`)
    console.log(`Body (first 600 chars): ${chat.body}`)
    console.log('')
  } catch (error) {
    console.log('[2] POST /chat/completions')
    console.log(`Request failed: ${error instanceof Error ? error.message : String(error)}`)
    console.log('')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
