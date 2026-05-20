import assert from "node:assert";
import test from "node:test";

import {
  buildDirectoryTreeFromGithubEntries,
  getFullDirectoryTree,
  getGithubWebDirectoryPaths,
  parseGithubWebTreeEntries,
} from "../services/github.js";

test("parseGithubWebTreeEntries extracts direct file and directory entries from GitHub HTML", () => {
  const entries = parseGithubWebTreeEntries("HKUDS", "OpenHarness", `
    <a href="/HKUDS/OpenHarness/commits/09bc/src">commits</a>
    <a href="/HKUDS/OpenHarness/tree/09bc/src/openharness">openharness</a>
    <a href="/HKUDS/OpenHarness/tree/09bc/src/openharness">openharness duplicate</a>
    <a href="/HKUDS/OpenHarness/blob/09bc/src/__init__.py">__init__.py</a>
  `);

  assert.deepStrictEqual(entries, [
    { name: "openharness", path: "src/openharness", type: "dir" },
    { name: "__init__.py", path: "src/__init__.py", type: "file" },
  ]);
});

test("buildDirectoryTreeFromGithubEntries builds nested tree from recursive GitHub API entries", () => {
  const tree = buildDirectoryTreeFromGithubEntries(
    [
      { path: "README.md", type: "blob" },
      { path: "src", type: "tree" },
      { path: "src/openharness", type: "tree" },
      { path: "src/openharness/memory", type: "tree" },
      { path: "src/openharness/memory/runtime.py", type: "blob" },
      { path: "src/openharness/memory/deep/ignored.py", type: "blob" },
      { path: "node_modules/pkg/index.js", type: "blob" },
    ],
    3,
  );

  assert.deepStrictEqual(tree, [
    {
      name: "src",
      path: "src",
      type: "dir",
      children: [
        {
          name: "openharness",
          path: "src/openharness",
          type: "dir",
          children: [
            {
              name: "memory",
              path: "src/openharness/memory",
              type: "dir",
              children: [
                {
                  name: "runtime.py",
                  path: "src/openharness/memory/runtime.py",
                  type: "file",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "README.md",
      path: "README.md",
      type: "file",
    },
  ]);
});

test("getFullDirectoryTree prefers recursive GitHub tree API before slow contents traversal", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;
  const fetchedUrls: string[] = [];

  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async (url: any) => {
    const urlText = String(url);
    fetchedUrls.push(urlText);

    if (urlText === "https://api.github.com/repos/acme/recursive/git/trees/HEAD?recursive=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          tree: [
            { path: "src/openharness/memory/runtime.py", type: "blob" },
            { path: "README.md", type: "blob" },
          ],
        }),
      } as any;
    }

    throw new Error(`Unexpected URL: ${urlText}`);
  }) as any;

  try {
    const tree = await getFullDirectoryTree("acme", "recursive", 3);
    assert.deepStrictEqual(tree, [
      {
        name: "src",
        path: "src",
        type: "dir",
        children: [
          {
            name: "openharness",
            path: "src/openharness",
            type: "dir",
            children: [
              {
                name: "memory",
                path: "src/openharness/memory",
                type: "dir",
                children: [
                  {
                    name: "runtime.py",
                    path: "src/openharness/memory/runtime.py",
                    type: "file",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "README.md",
        path: "README.md",
        type: "file",
      },
    ]);
    assert.deepStrictEqual(fetchedUrls, [
      "https://api.github.com/repos/acme/recursive/git/trees/HEAD?recursive=1",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test("getGithubWebDirectoryPaths returns direct file paths below the requested directory", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls: string[] = [];

  globalThis.fetch = (async (url: any) => {
    const urlText = String(url);
    fetchedUrls.push(urlText);
    assert.strictEqual(urlText, "https://github.com/acme/widgets/tree/HEAD/src/widgets/memory");
    return {
      ok: true,
      status: 200,
      text: async () => `
        <a href="/acme/widgets/tree/abc123/src">src</a>
        <a href="/acme/widgets/tree/abc123/src/widgets">widgets</a>
        <a href="/acme/widgets/blob/abc123/src/widgets/memory/manager.py">manager.py</a>
        <a href="/acme/widgets/blob/abc123/src/widgets/memory/schema.py">schema.py</a>
        <a href="/acme/widgets/blob/abc123/src/widgets/other.py">other.py</a>
      `,
    } as any;
  }) as any;

  try {
    const paths = await getGithubWebDirectoryPaths("acme", "widgets", "src/widgets/memory");
    assert.deepStrictEqual(paths, [
      "src/widgets/memory/manager.py",
      "src/widgets/memory/schema.py",
    ]);
    assert.strictEqual(fetchedUrls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getFullDirectoryTree falls back to GitHub web tree when contents API is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;
  const fetchedUrls: string[] = [];

  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async (url: any) => {
    const urlText = String(url);
    fetchedUrls.push(urlText);

    if (urlText === "https://api.github.com/repos/acme/widgets/git/trees/HEAD?recursive=1") {
      return {
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => "",
      } as any;
    }

    if (urlText.startsWith("https://api.github.com/repos/acme/widgets/contents")) {
      return {
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => "",
      } as any;
    }

    if (urlText === "https://github.com/acme/widgets/tree/HEAD") {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <a href="/acme/widgets/tree/abc123/src">src</a>
          <a href="/acme/widgets/blob/abc123/README.md">README.md</a>
        `,
      } as any;
    }

    if (urlText === "https://github.com/acme/widgets/tree/HEAD/src") {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <a href="/acme/widgets/tree/abc123/src/memory">memory</a>
          <a href="/acme/widgets/blob/abc123/src/__init__.py">__init__.py</a>
        `,
      } as any;
    }

    if (urlText === "https://github.com/acme/widgets/tree/HEAD/src/memory") {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <a href="/acme/widgets/blob/abc123/src/memory/runtime.py">runtime.py</a>
        `,
      } as any;
    }

    throw new Error(`Unexpected URL: ${urlText}`);
  }) as any;

  try {
    const tree = await getFullDirectoryTree("acme", "widgets", 3);
    assert.deepStrictEqual(tree, [
      {
        name: "src",
        path: "src",
        type: "dir",
        children: [
          {
            name: "memory",
            path: "src/memory",
            type: "dir",
            children: [
              {
                name: "runtime.py",
                path: "src/memory/runtime.py",
                type: "file",
              },
            ],
          },
          {
            name: "__init__.py",
            path: "src/__init__.py",
            type: "file",
          },
        ],
      },
      {
        name: "README.md",
        path: "README.md",
        type: "file",
      },
    ]);
    assert.ok(fetchedUrls.includes("https://api.github.com/repos/acme/widgets/git/trees/HEAD?recursive=1"));
    assert.ok(fetchedUrls.includes("https://api.github.com/repos/acme/widgets/contents/"));
    assert.ok(fetchedUrls.includes("https://github.com/acme/widgets/tree/HEAD/src/memory"));
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
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
