import assert from 'node:assert/strict'

import { shouldFallbackCustomStreaming } from '../services/custom-openai-utils.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('falls back to non-streaming for OpenAI-compatible protocol gateway responses', () => {
  assert.equal(shouldFallbackCustomStreaming(502), true)
})

runTest('does not treat normal client errors as OpenAI-compatible stream fallback cases', () => {
  assert.equal(shouldFallbackCustomStreaming(400), false)
})
