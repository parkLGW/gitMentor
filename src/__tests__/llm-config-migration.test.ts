import assert from 'node:assert/strict'

import { migrateLegacyLLMConfig } from '../services/llm-config-migration.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('migrates deepseek legacy provider to openai protocol preset', () => {
  const migrated = migrateLegacyLLMConfig({
    provider: 'deepseek',
    apiKey: 'sk-test',
    model: 'deepseek-chat',
  })

  assert.equal(migrated.protocol, 'openai')
  assert.equal(migrated.preset, 'deepseek')
  assert.equal(migrated.apiKey, 'sk-test')
})

runTest('migrates lmstudio legacy provider to local openai-compatible mode', () => {
  const migrated = migrateLegacyLLMConfig({
    provider: 'lmstudio',
    apiKey: '',
    model: 'local-model',
    baseUrl: 'http://localhost:1234',
  })

  assert.equal(migrated.protocol, 'local')
  assert.equal(migrated.preset, 'lmstudio')
  assert.equal(migrated.localMode, 'openai-compatible')
})

runTest('passes through already normalized config unchanged', () => {
  const migrated = migrateLegacyLLMConfig({
    protocol: 'openai',
    preset: 'openai-official',
    apiKey: 'sk-normalized',
    model: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    temperature: 0.3,
    maxTokens: 512,
  })

  assert.equal(migrated.protocol, 'openai')
  assert.equal(migrated.preset, 'openai-official')
  assert.equal(migrated.apiKey, 'sk-normalized')
  assert.equal(migrated.model, 'gpt-4.1-mini')
  assert.equal(migrated.baseUrl, 'https://api.openai.com/v1')
  assert.equal(migrated.temperature, 0.3)
  assert.equal(migrated.maxTokens, 512)
})

runTest('migrates claude legacy provider to claude protocol preset', () => {
  const migrated = migrateLegacyLLMConfig({
    provider: 'claude',
    apiKey: 'anthropic-key',
    model: 'claude-3-5-sonnet',
  })

  assert.equal(migrated.protocol, 'claude')
  assert.equal(migrated.preset, 'anthropic-official')
  assert.equal(migrated.model, 'claude-3-5-sonnet')
})

runTest('throws on unknown provider instead of returning undefined', () => {
  assert.throws(
    () =>
      migrateLegacyLLMConfig({
        provider: 'unknown-provider',
        apiKey: 'bad',
      } as never),
    /Unsupported LLM provider/i,
  )
})

runTest('throws when provider is missing from legacy input', () => {
  assert.throws(
    () =>
      migrateLegacyLLMConfig({
        apiKey: 'missing-provider',
      } as never),
    /provider must be a string/i,
  )
})

runTest('throws when provider is not a string', () => {
  assert.throws(
    () =>
      migrateLegacyLLMConfig({
        provider: 123 as never,
        apiKey: 'bad',
      } as never),
    /provider must be a string/i,
  )
})
