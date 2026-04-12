import assert from 'node:assert/strict'

import { shouldFallbackCustomStreaming } from '../services/custom-openai-utils.js'

function runTest(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

runTest('falls back to non-streaming for bad gateway responses', () => {
  assert.equal(shouldFallbackCustomStreaming(502), true)
})

runTest('does not treat normal client errors as stream fallback cases', () => {
  assert.equal(shouldFallbackCustomStreaming(400), false)
})
