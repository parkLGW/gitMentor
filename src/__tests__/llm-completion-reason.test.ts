import assert from "node:assert/strict";
import test from "node:test";

import {
  ClaudeCompatibleProvider,
  OpenAICompatibleProvider,
} from "../services/llm-base.js";

test("OpenAI-compatible completion exposes a normalized length finish reason", async () => {
  const provider = new OpenAICompatibleProvider();
  Reflect.set(provider, "config", {
    protocol: "openai",
    preset: "deepseek",
    apiKey: "test-key",
    model: "deepseek-chat",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: "{\"partial\":true" }, finish_reason: "length" }],
      model: "deepseek-chat",
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const response = await provider.complete("prompt");
    assert.equal(response.finishReason, "length");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Claude-compatible completion normalizes max_tokens as length", async () => {
  const provider = new ClaudeCompatibleProvider();
  Reflect.set(provider, "config", {
    protocol: "claude",
    preset: "anthropic-official",
    apiKey: "test-key",
    model: "claude-test",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      content: [{ text: "{\"partial\":true" }],
      model: "claude-test",
      stop_reason: "max_tokens",
      usage: { input_tokens: 10, output_tokens: 20 },
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const response = await provider.complete("prompt");
    assert.equal(response.finishReason, "length");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
