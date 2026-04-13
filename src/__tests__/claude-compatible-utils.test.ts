import assert from 'node:assert/strict'

import {
  normalizeClaudeCompatibleBaseUrl,
  resolveClaudeCompatibleBaseUrl,
} from '../services/claude-compatible-utils.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('normalizes Claude-compatible base URLs without forcing v1', () => {
  assert.equal(
    normalizeClaudeCompatibleBaseUrl('https://example.com/messages///'),
    'https://example.com/messages',
  )
})

runTest('resolves Claude-compatible base URLs for runtime use', () => {
  assert.equal(
    resolveClaudeCompatibleBaseUrl('https://gateway.example.com/anthropic/'),
    'https://gateway.example.com/anthropic',
  )
})
