import assert from 'node:assert/strict'

import {
  getProviderSettings,
  getPresetOptions,
  getProtocolOptions,
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

runTest('lists Claude-compatible as a top-level protocol', () => {
  const protocols = getProtocolOptions()
  assert.equal(protocols.some((entry) => entry.value === 'claude'), true)
})

runTest('lists vendor presets under openai protocol instead of top-level providers', () => {
  const presets = getPresetOptions('openai')
  assert.deepEqual(
    presets.map((entry) => entry.value),
    ['openai-official', 'deepseek', 'siliconflow', 'zhipu', 'custom-openai'],
  )
})

runTest('exposes preset defaults and API key metadata for settings rendering', () => {
  const customOpenAI = getPresetOptions('openai').find((entry) => entry.value === 'custom-openai')
  const [lmStudio] = getPresetOptions('local').filter((entry) => entry.value === 'lmstudio')

  assert.ok(customOpenAI)
  assert.equal(customOpenAI.defaultModel, 'gpt-4o-mini')
  assert.equal(customOpenAI.defaultBaseUrl, '')
  assert.equal(customOpenAI.apiKeyMode, 'optional')
  assert.equal(customOpenAI.docsUrl, undefined)

  assert.equal(lmStudio.defaultBaseUrl, 'http://localhost:1234')
  assert.equal(lmStudio.apiKeyMode, 'none')
  assert.equal(lmStudio.localMode, 'openai-compatible')
})

runTest('returns defensive copies for protocol and preset metadata', () => {
  const [protocol] = getProtocolOptions()
  const [preset] = getPresetOptions('openai')

  protocol.label.zh = 'changed'
  preset.label.en = 'changed'

  assert.equal(getProtocolOptions()[0].label.zh, 'OpenAI 兼容协议')
  assert.equal(getPresetOptions('openai')[0].label.en, 'OpenAI')
})

runTest('keeps legacy provider settings for existing callers', () => {
  const custom = getProviderSettings('custom')
  const claude = getProviderSettings('claude')

  assert.equal(custom.value, 'custom')
  assert.equal(custom.defaultModel, 'gpt-4o-mini')
  assert.equal(custom.apiKeyMode, 'optional')
  assert.equal(custom.supportsBaseUrl, true)

  assert.equal(claude.value, 'claude')
  assert.equal(claude.defaultModel, 'claude-3-sonnet-20240229')
  assert.equal(claude.docsUrl, 'https://console.anthropic.com')
})
