import assert from 'node:assert/strict'

import {
  getProviderSettings,
  normalizeOpenAICompatibleBaseUrl,
} from '../services/llm-provider-config.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('normalizes OpenAI-compatible base URLs by trimming slashes and appending /v1', () => {
  assert.equal(
    normalizeOpenAICompatibleBaseUrl('https://example.com///'),
    'https://example.com/v1',
  )
})

runTest('preserves existing /v1 suffix for OpenAI-compatible base URLs', () => {
  assert.equal(
    normalizeOpenAICompatibleBaseUrl('https://example.com/proxy/v1/'),
    'https://example.com/proxy/v1',
  )
})

runTest('custom provider settings require a base URL and allow an optional API key', () => {
  const settings = getProviderSettings('custom')

  assert.equal(settings.apiKeyMode, 'optional')
  assert.equal(settings.supportsBaseUrl, true)
  assert.equal(settings.defaultBaseUrl, '')
  assert.equal(settings.defaultModel, 'gpt-4o-mini')
})

runTest('ollama settings expose a local default base URL without requiring an API key', () => {
  const settings = getProviderSettings('ollama')

  assert.equal(settings.apiKeyMode, 'none')
  assert.equal(settings.supportsBaseUrl, true)
  assert.equal(settings.defaultBaseUrl, 'http://localhost:11434')
})
