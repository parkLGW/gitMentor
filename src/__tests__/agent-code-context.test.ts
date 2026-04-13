import assert from "node:assert";
import test from "node:test";

import {
  buildRetrievedFileEvidence,
  buildRawGithubUrl,
  normalizeCandidatePath,
  parseRetrievalPlan,
  resolveBranchCandidates,
  selectFilesWithinBudget,
  truncateFileForPrompt,
} from "../services/agent-code-context.js";

import {
  getDefaultBranch,
  getRawFileContent,
  getRepoInfo,
} from "../services/github.js";

test("parseRetrievalPlan caps target files and normalizes paths", () => {
  const plan = parseRetrievalPlan({
    needsCodeContext: true,
    targetFiles: [
      "./src/features/alpha.ts",
      ".\\src\\widgets\\beta.ts",
      "docs/guide.md",
      "./src/features/gamma.ts",
      "src/utils/helpers.ts",
      "src/extra.ts",
    ],
    reason: "Gather context",
    confidence: "high",
  });

  assert.strictEqual(plan.needsCodeContext, true);
  assert.strictEqual(plan.reason, "Gather context");
  assert.strictEqual(plan.confidence, "high");
  assert.strictEqual(plan.targetFiles.length, 5);
  assert.deepStrictEqual(plan.targetFiles, [
    "src/features/alpha.ts",
    "src/widgets/beta.ts",
    "docs/guide.md",
    "src/features/gamma.ts",
    "src/utils/helpers.ts",
  ]);
});

test("parseRetrievalPlan defaults confidence to low when missing or invalid", () => {
  const missingConfidence = parseRetrievalPlan({
    targetFiles: ["src/index.ts"],
  });
  const invalidConfidence = parseRetrievalPlan({
    targetFiles: ["src/index.ts"],
    confidence: "invalid" as unknown as "low",
  });

  assert.strictEqual(missingConfidence.confidence, "low");
  assert.strictEqual(invalidConfidence.confidence, "low");
});

test("normalizeCandidatePath converts leading ./ and backslashes", () => {
  assert.strictEqual(
    normalizeCandidatePath("./src\\nested\\file.ts"),
    "src/nested/file.ts"
  );
  assert.strictEqual(
    normalizeCandidatePath("`./src\\api/client.ts`,"),
    "src/api/client.ts"
  );
  assert.strictEqual(
    normalizeCandidatePath("///src\\nested\\file.ts"),
    "src/nested/file.ts"
  );
  assert.strictEqual(normalizeCandidatePath(".gitignore"), ".gitignore");
  assert.strictEqual(normalizeCandidatePath("../foo.ts"), "");
  assert.strictEqual(normalizeCandidatePath("'../foo.ts'"), "");
  assert.strictEqual(normalizeCandidatePath("   "), "");
});

test("selectFilesWithinBudget keeps early files and respects budgets", () => {
  const files = [
    { filePath: "first.ts", content: "aaaaaa" },
    { filePath: "second.ts", content: "bbbbbbbbbbbb" },
    { filePath: "third.ts", content: "ccc" },
  ];

  const selected = selectFilesWithinBudget(files, {
    maxFiles: 2,
    maxTotalChars: 8,
    maxCharsPerFile: 5,
  });

  assert.strictEqual(selected.length, 2);
  assert.strictEqual(selected[0].filePath, "first.ts");
  assert.strictEqual(selected[0].content.length, 5);
  assert.strictEqual(selected[1].filePath, "second.ts");
  assert.strictEqual(selected[1].content.length, 3);
  assert.strictEqual(selected[0].content, "aaaaa");
  assert.strictEqual(selected[1].content, "bbb");
});

test("selectFilesWithinBudget skips empty early files without blocking later files", () => {
  const files = [
    { filePath: "empty.ts", content: "" },
    { filePath: "useful.ts", content: "abcde" },
  ];

  const selected = selectFilesWithinBudget(files, {
    maxFiles: 2,
    maxTotalChars: 3,
    maxCharsPerFile: 10,
  });

  assert.deepStrictEqual(selected, [{ filePath: "useful.ts", content: "abc" }]);
});

test("buildRetrievedFileEvidence passthrough caps by max target files", () => {
  const files = [
    { filePath: "src/1.ts", status: "fetched" as const },
    { filePath: "src/2.ts", status: "failed" as const },
    { filePath: "src/3.ts", status: "skipped" as const },
    { filePath: "src/4.ts", status: "fetched" as const },
    { filePath: "src/5.ts", status: "failed" as const },
    { filePath: "src/6.ts", status: "skipped" as const },
  ];

  const evidence = buildRetrievedFileEvidence(files);
  assert.deepStrictEqual(evidence, files.slice(0, 5));
});

test("resolveBranchCandidates prefers default branch then main then master without duplicates", () => {
  assert.deepStrictEqual(resolveBranchCandidates("develop"), [
    "develop",
    "main",
    "master",
  ]);
  assert.deepStrictEqual(resolveBranchCandidates("main"), ["main", "master"]);
});

test("buildRawGithubUrl builds an encoded raw github content url", () => {
  assert.strictEqual(
    buildRawGithubUrl("farion1231", "cc-switch", "main", "./docs/README #1.md"),
    "https://raw.githubusercontent.com/farion1231/cc-switch/main/docs/README%20%231.md",
  );
});

test("truncateFileForPrompt preserves file path and includes head and tail with truncation note", () => {
  const filePath = "src/api/client.ts";
  const lines = Array.from({ length: 60 }, (_, idx) => {
    const n = String(idx + 1).padStart(3, "0");
    return `line-${n}: ${"x".repeat(12)}`;
  });
  const content = lines.join("\n");

  const truncated = truncateFileForPrompt(filePath, content, 260);

  assert.strictEqual(truncated.wasTruncated, true);
  assert.ok(truncated.prompt.length <= 260);
  assert.ok(truncated.prompt.includes(filePath));
  assert.ok(truncated.prompt.includes("line-001"));
  assert.ok(truncated.prompt.includes("line-060"));
  assert.ok(truncated.prompt.toLowerCase().includes("truncat"));
  assert.ok(truncated.snippet.length > 0);
});

test("truncateFileForPrompt returns full content when within budget", () => {
  const filePath = "src/app.ts";
  const content = "line-a\nline-b\nline-c";

  const res = truncateFileForPrompt(filePath, content, 10_000);

  assert.strictEqual(res.wasTruncated, false);
  assert.ok(res.prompt.includes(filePath));
  assert.ok(res.prompt.includes(content));
});

test("truncateFileForPrompt respects tiny budgets", () => {
  const res = truncateFileForPrompt("src/app.ts", "hello", 5);
  assert.ok(res.prompt.length <= 5);
  assert.strictEqual(res.wasTruncated, true);
});

test("getRepoInfo includes defaultBranch and getDefaultBranch uses cached repo info", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fetchCalls = 0;
  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async (url: any) => {
    fetchCalls += 1;
    assert.strictEqual(
      String(url),
      "https://api.github.com/repos/acme/widgets",
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({
        name: "widgets",
        owner: { login: "acme" },
        description: "repo",
        html_url: "https://github.com/acme/widgets",
        stargazers_count: 1,
        forks_count: 2,
        open_issues_count: 3,
        language: "TypeScript",
        updated_at: "2026-04-13T00:00:00Z",
        topics: [],
        watchers_count: 4,
        archived: false,
        default_branch: "develop",
      }),
    } as any;
  }) as any;

  try {
    const info = await getRepoInfo("acme", "widgets");
    assert.strictEqual(info.defaultBranch, "develop");

    const branch1 = await getDefaultBranch("acme", "widgets");
    const branch2 = await getDefaultBranch("acme", "widgets");
    assert.strictEqual(branch1, "develop");
    assert.strictEqual(branch2, "develop");
    assert.strictEqual(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test("getRawFileContent fetches raw github content and caches it", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fetchCalls = 0;
  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async (url: any) => {
    fetchCalls += 1;
    assert.strictEqual(
      String(url),
      "https://raw.githubusercontent.com/acme/widgets/develop/src/api/client%20v2.ts",
    );
    return {
      ok: true,
      status: 200,
      text: async () => "export const answer = 42;",
    } as any;
  }) as any;

  try {
    const content1 = await getRawFileContent(
      "acme",
      "widgets",
      "develop",
      ".\\src\\api\\client v2.ts",
      { timeoutMs: 1234 },
    );
    const content2 = await getRawFileContent(
      "acme",
      "widgets",
      "develop",
      "./src/api/client v2.ts",
    );
    assert.strictEqual(content1, "export const answer = 42;");
    assert.strictEqual(content2, "export const answer = 42;");
    assert.strictEqual(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

test("getRawFileContent does not fetch when path normalizes to invalid", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;

  let fetchCalls = 0;
  (globalThis as any).localStorage = createMockLocalStorage();
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("unexpected fetch");
  }) as any;

  try {
    const content = await getRawFileContent(
      "acme",
      "widgets",
      "develop",
      "../secrets.txt",
    );
    assert.strictEqual(content, null);
    assert.strictEqual(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).localStorage = originalLocalStorage;
  }
});

function createMockLocalStorage() {
  const store = new Map<string, string>();

  const storage = {
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

  return storage;
}
