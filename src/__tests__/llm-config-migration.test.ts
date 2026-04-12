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
