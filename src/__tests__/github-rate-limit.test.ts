import assert from "node:assert";
import test from "node:test";

import {
  getRawFileContent,
  getRepoTree,
  parseGithubRateLimitDelayMs,
} from "../services/github.js";

test("parseGithubRateLimitDelayMs prefers Retry-After and falls back to X-RateLimit-Reset", () => {
  const retryAfterHeaders = new Headers({
    "Retry-After": "2",
  });
  const resetHeaders = new Headers({
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": "1710000005",
  });

  assert.strictEqual(
    parseGithubRateLimitDelayMs(retryAfterHeaders, 1710000000000),
    2000,
  );
  assert.strictEqual(
    parseGithubRateLimitDelayMs(resetHeaders, 1710000000000),
    5000,
  );
});

test("getRepoTree retries once when GitHub API responds with a rate limit 403", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fetchCalls = 0;
  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return {
        ok: false,
        status: 403,
        headers: new Headers({
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000)),
        }),
        json: async () => ([]),
      } as any;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ([
        { name: "src", path: "src", type: "dir" },
      ]),
    } as any;
  }) as any;

  try {
    const result = await getRepoTree("acme", "widgets", "");
    assert.strictEqual(fetchCalls, 2);
    assert.deepStrictEqual(result, [
      { name: "src", path: "src", type: "dir" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test("getRawFileContent retries when Retry-After is present and then succeeds", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fetchCalls = 0;
  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return {
        ok: false,
        status: 429,
        headers: new Headers({
          "Retry-After": "0",
        }),
        text: async () => "",
      } as any;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "export const answer = 42;",
    } as any;
  }) as any;

  try {
    const content = await getRawFileContent(
      "acme",
      "widgets",
      "main",
      "src/api/client.ts",
    );
    assert.strictEqual(fetchCalls, 2);
    assert.strictEqual(content, "export const answer = 42;");
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test("GitHub requests include Authorization header when a token is configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalChrome = (globalThis as any).chrome;

  const seenHeaders: Array<Record<string, string>> = [];
  (globalThis as any).localStorage = createMockLocalStorage();
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: (key: string | string[], callback: (value: Record<string, string>) => void) => {
          const keys = Array.isArray(key) ? key : [key];
          const result: Record<string, string> = {};
          if (keys.includes("gitmentor_github_token")) {
            result.gitmentor_github_token = "ghp_test_token";
          }
          callback(result);
        },
      },
    },
  };
  globalThis.fetch = (async (_url: any, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    seenHeaders.push({
      authorization: headers.get("Authorization") || "",
      accept: headers.get("Accept") || "",
    });
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ([]),
      text: async () => "export const token = true;",
    } as any;
  }) as any;

  try {
    await getRepoTree("acme", "widgets", "");
    await getRawFileContent("acme", "widgets", "main", "src/api/client.ts");

    assert.equal(seenHeaders[0].authorization, "Bearer ghp_test_token");
    assert.equal(seenHeaders[1].authorization, "Bearer ghp_test_token");
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).chrome = originalChrome;
  }
});

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
