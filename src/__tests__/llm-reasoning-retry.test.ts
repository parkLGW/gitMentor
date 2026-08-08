import assert from "node:assert/strict";
import test from "node:test";

import {
  ClaudeCompatibleProvider,
  OpenAICompatibleProvider,
} from "../services/llm-base.js";
import { clearReasoningBudgetMemory } from "../services/llm-output-budget.js";

interface RecordedRequest {
  maxTokens: number;
}

function openAIResponse(content: string, finishReason: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content }, finish_reason: finishReason }],
    model: "deepseek-v4-flash",
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function claudeResponse(text: string, stopReason: string): Response {
  return new Response(JSON.stringify({
    content: [{ text }],
    model: "claude-test",
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 20 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function budgetRejection(): Response {
  return new Response(JSON.stringify({
    error: { message: "max_tokens: must be less than or equal to 8192" },
  }), { status: 400, headers: { "content-type": "application/json" } });
}

function installFetch(responses: Response[], recorded: RecordedRequest[]): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    recorded.push({ maxTokens: JSON.parse(String(init.body)).max_tokens });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected extra request");
    return response;
  }) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function openAIProvider(): OpenAICompatibleProvider {
  const provider = new OpenAICompatibleProvider();
  Reflect.set(provider, "config", {
    protocol: "openai",
    preset: "deepseek",
    apiKey: "test-key",
    model: "deepseek-v4-flash",
  });
  return provider;
}

test("a reasoning model that spends the whole budget on thinking is retried with a larger one", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([
    openAIResponse("", "length"),
    openAIResponse("{\"coreValue\":\"real\"}", "stop"),
  ], recorded);

  try {
    const response = await openAIProvider().complete("prompt");
    assert.equal(response.content, "{\"coreValue\":\"real\"}");
    assert.equal(response.finishReason, "stop");
    assert.deepEqual(recorded.map((r) => r.maxTokens), [2000, 32000]);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("the next call for a model known to blank out starts at the larger budget", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([
    openAIResponse("", "length"),
    openAIResponse("{\"ok\":true}", "stop"),
    openAIResponse("{\"ok\":true}", "stop"),
  ], recorded);

  try {
    const provider = openAIProvider();
    await provider.complete("prompt");
    await provider.complete("prompt");
    assert.deepEqual(recorded.map((r) => r.maxTokens), [2000, 32000, 32000]);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("a model that rejects the larger budget steps down instead of failing", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([
    openAIResponse("", "length"),
    budgetRejection(),
    openAIResponse("{\"ok\":true}", "stop"),
  ], recorded);

  try {
    const response = await openAIProvider().complete("prompt");
    assert.equal(response.content, "{\"ok\":true}");
    assert.deepEqual(recorded.map((r) => r.maxTokens), [2000, 32000, 8000]);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("a rejected budget is not offered to the same model again", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([
    openAIResponse("", "length"),
    budgetRejection(),
    openAIResponse("{\"ok\":true}", "stop"),
    openAIResponse("{\"ok\":true}", "stop"),
  ], recorded);

  try {
    const provider = openAIProvider();
    await provider.complete("prompt");
    await provider.complete("prompt");
    assert.deepEqual(recorded.map((r) => r.maxTokens), [2000, 32000, 8000, 8000]);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("errors that are not about the output budget are not retried away", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([
    openAIResponse("", "length"),
    new Response(JSON.stringify({ error: { message: "Insufficient balance" } }), {
      status: 402,
      headers: { "content-type": "application/json" },
    }),
  ], recorded);

  try {
    await assert.rejects(openAIProvider().complete("prompt"), /Insufficient balance/);
    assert.equal(recorded.length, 2);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("a usable answer is never retried", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([openAIResponse("{\"ok\":true}", "stop")], recorded);

  try {
    const response = await openAIProvider().complete("prompt");
    assert.equal(response.content, "{\"ok\":true}");
    assert.equal(recorded.length, 1);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("a truncated but non-empty answer keeps its length finish reason for the compact retry", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([openAIResponse("{\"partial\":true", "length")], recorded);

  try {
    const response = await openAIProvider().complete("prompt");
    assert.equal(response.finishReason, "length");
    assert.equal(recorded.length, 1);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});

test("Claude-compatible completions get the same one-shot retry", async () => {
  clearReasoningBudgetMemory();
  const recorded: RecordedRequest[] = [];
  const restore = installFetch([
    claudeResponse("", "max_tokens"),
    claudeResponse("{\"ok\":true}", "end_turn"),
  ], recorded);

  try {
    const provider = new ClaudeCompatibleProvider();
    Reflect.set(provider, "config", {
      protocol: "claude",
      preset: "anthropic-official",
      apiKey: "test-key",
      model: "claude-test",
    });

    const response = await provider.complete("prompt");
    assert.equal(response.content, "{\"ok\":true}");
    assert.deepEqual(recorded.map((r) => r.maxTokens), [2000, 32000]);
  } finally {
    restore();
    clearReasoningBudgetMemory();
  }
});
