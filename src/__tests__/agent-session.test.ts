import assert from "node:assert/strict";
import test from "node:test";

import {
  appendMessage,
  createEmptyAgentSession,
  loadAgentSession,
  persistAgentSession,
} from "../services/agent-session.js";

import type { AgentMessage } from "../types/agent.js";

function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test("persistAgentSession and loadAgentSession round-trip normalized retrieval metadata", () => {
  const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  (globalThis as { localStorage?: Storage }).localStorage = createMockLocalStorage() as unknown as Storage;

  try {
    const session = createEmptyAgentSession("acme/widgets");
    const message = {
      id: "assistant_1",
      role: "assistant",
      content: "Answer with retrieval metadata",
      createdAt: Date.now(),
      confidence: "high",
      retrievedFiles: [
        {
          filePath: "src/request-flow.ts",
          branch: "release",
          status: "fetched",
          reason: "relevant",
          snippet: "should be dropped",
        },
        {
          filePath: "src/request-flow.ts",
          branch: "release",
          status: "fetched",
          reason: "duplicate",
        },
        {
          filePath: "src/request-flow.ts",
          branch: "main",
          status: "fetched",
          reason: "same file different branch",
        },
        {
          filePath: "",
          status: "failed",
          reason: "invalid",
        },
      ],
      retrievalMode: "github-code",
      retrievalNote: "x".repeat(300),
    } as unknown as AgentMessage;

    const nextSession = appendMessage(session, message);
    assert.equal(persistAgentSession(nextSession), true);

    const loaded = loadAgentSession("acme/widgets");
    assert.equal(loaded.recentMessages.length, 1);
    assert.deepStrictEqual(loaded.recentMessages[0].retrievedFiles, [
      {
        filePath: "src/request-flow.ts",
        branch: "release",
        status: "fetched",
        reason: "relevant",
      },
      {
        filePath: "src/request-flow.ts",
        branch: "main",
        status: "fetched",
        reason: "same file different branch",
      },
    ]);
    assert.equal(loaded.recentMessages[0].retrievalMode, "github-code");
    assert.equal(loaded.recentMessages[0].retrievalNote?.length, 220);
  } finally {
    if (originalLocalStorage) {
      (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
});
