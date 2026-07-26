# Agent On-Demand Code Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the conversation assistant so it can decide when code is needed, fetch relevant GitHub source files in the background, and answer with grounded file evidence.

**Architecture:** Keep `chatWithAgent` as the single entrypoint, but move the new behavior into small, testable services. The runtime should use a two-stage pipeline: first generate a retrieval plan from summary context, then fetch selected files from GitHub and produce a grounded final answer, with graceful fallback to the current summary-only path.

**Tech Stack:** React, TypeScript, browser extension service worker, GitHub REST/raw endpoints, node-based helper tests compiled with `tsc`

---

## File Structure

### New files

- `src/services/agent-code-context.ts`
  - Pure helpers for retrieval planning result parsing, file path normalization, file filtering, truncation budgets, and retrieval result shaping.
- `src/services/agent-chat-runtime.ts`
  - Orchestrates two-stage assistant answering with injected dependencies so it can be tested without the full service worker.
- `src/__tests__/agent-code-context.test.ts`
  - Covers retrieval plan parsing, path normalization, filtering, and truncation logic.
- `src/__tests__/agent-chat-runtime.test.ts`
  - Covers summary-only path, GitHub-code path, partial fetch failure, and fallback behavior.

### Modified files

- `src/types/agent.ts`
  - Add retrieval metadata types and response fields used by runtime and UI.
- `src/services/github.ts`
  - Add default-branch lookup and raw file fetch helpers with cache and timeout support.
- `src/services/agent-session.ts`
  - Preserve new retrieval metadata in persisted sessions.
- `src/background/service-worker.ts`
  - Delegate `chatWithAgent` to the new runtime and wire existing `callLLM` plus GitHub fetch helpers.
- `src/components/AgentTab.tsx`
  - Render analyzed files from retrieved metadata and update footer copy.

---

### Task 1: Add Retrieval Metadata And Pure Context Helpers

**Files:**
- Create: `src/services/agent-code-context.ts`
- Create: `src/__tests__/agent-code-context.test.ts`
- Modify: `src/types/agent.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";

import {
  normalizeCandidatePath,
  parseRetrievalPlan,
  selectFilesWithinBudget,
} from "../services/agent-code-context.js";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("parses a valid retrieval plan and caps file count", () => {
  const plan = parseRetrievalPlan({
    needsCodeContext: true,
    targetFiles: [
      "src/main.ts",
      "src/App.tsx",
      "README.md",
      "src/extra.ts",
      "src/fifth.ts",
      "src/ignored.ts",
    ],
    reason: "question asks about request flow",
    confidence: "high",
  });

  assert.equal(plan.needsCodeContext, true);
  assert.deepEqual(plan.targetFiles, [
    "src/main.ts",
    "src/App.tsx",
    "README.md",
    "src/extra.ts",
    "src/fifth.ts",
  ]);
});

runTest("normalizes repo-relative candidate paths", () => {
  assert.equal(normalizeCandidatePath("`./src\\\\api/client.ts`, "), "src/api/client.ts");
});

runTest("drops over-budget files after preserving the first useful matches", () => {
  const selected = selectFilesWithinBudget(
    [
      { filePath: "src/a.ts", content: "a".repeat(100) },
      { filePath: "src/b.ts", content: "b".repeat(100) },
      { filePath: "src/c.ts", content: "c".repeat(100) },
    ],
    { maxFiles: 2, maxTotalChars: 220, maxCharsPerFile: 120 },
  );

  assert.deepEqual(selected.map((item) => item.filePath), ["src/a.ts", "src/b.ts"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-code-tests src/types/agent.ts src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts
```

Expected: FAIL with `File 'src/services/agent-code-context.ts' not found` or missing export errors.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/types/agent.ts
export interface RetrievedFileContext {
  filePath: string;
  branch?: string;
  status: "fetched" | "failed" | "skipped";
  snippet?: string;
  reason?: string;
}

export interface AgentRetrievalPlan {
  needsCodeContext: boolean;
  targetFiles: string[];
  reason: string;
  confidence: ConfidenceLevel;
}

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: number;
  evidence?: AnalysisEvidence[];
  confidence?: ConfidenceLevel;
  retrievedFiles?: RetrievedFileContext[];
  retrievalMode?: "summary-only" | "github-code";
  retrievalNote?: string;
}
```

```ts
// src/services/agent-code-context.ts
import type { AgentRetrievalPlan, ConfidenceLevel, RetrievedFileContext } from "@/types/agent";

const MAX_TARGET_FILES = 5;

export function normalizeCandidatePath(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^[`"'./\\]+/, "")
    .replace(/[`"',;:)\]]+$/, "")
    .replace(/\\/g, "/")
    .replace(/^blob\/[^/]+\//, "")
    .replace(/\/+/g, "/");
}

export function parseRetrievalPlan(input: unknown): AgentRetrievalPlan {
  const value = (input || {}) as Record<string, unknown>;
  const confidence = ["low", "medium", "high"].includes(String(value.confidence))
    ? (value.confidence as ConfidenceLevel)
    : "low";

  const targetFiles = Array.isArray(value.targetFiles)
    ? Array.from(
        new Set(
          value.targetFiles
            .map((item) => normalizeCandidatePath(String(item || "")))
            .filter(Boolean),
        ),
      ).slice(0, MAX_TARGET_FILES)
    : [];

  return {
    needsCodeContext: Boolean(value.needsCodeContext),
    targetFiles,
    reason: String(value.reason || "").slice(0, 240),
    confidence,
  };
}

export function selectFilesWithinBudget(
  files: Array<{ filePath: string; content: string }>,
  limits: { maxFiles: number; maxTotalChars: number; maxCharsPerFile: number },
): Array<{ filePath: string; content: string }> {
  const selected: Array<{ filePath: string; content: string }> = [];
  let totalChars = 0;

  for (const file of files) {
    if (selected.length >= limits.maxFiles) break;
    const content = file.content.slice(0, limits.maxCharsPerFile);
    if (!content) continue;
    if (totalChars + content.length > limits.maxTotalChars) break;
    selected.push({ filePath: file.filePath, content });
    totalChars += content.length;
  }

  return selected;
}

export function buildRetrievedFileEvidence(files: RetrievedFileContext[]): RetrievedFileContext[] {
  return files.slice(0, MAX_TARGET_FILES);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-code-tests src/types/agent.ts src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts
node .tmp-agent-code-tests/__tests__/agent-code-context.test.js
```

Expected:

```text
PASS parses a valid retrieval plan and caps file count
PASS normalizes repo-relative candidate paths
PASS drops over-budget files after preserving the first useful matches
```

- [ ] **Step 5: Commit**

```bash
git add src/types/agent.ts src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts
git commit -m "feat: add agent retrieval metadata helpers"
```

### Task 2: Add GitHub Branch Resolution And Raw File Fetch Support

**Files:**
- Modify: `src/services/github.ts`
- Modify: `src/services/agent-code-context.ts`
- Modify: `src/__tests__/agent-code-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";

import {
  buildRawGithubUrl,
  resolveBranchCandidates,
  truncateFileForPrompt,
} from "../services/agent-code-context.js";

runTest("prefers repository default branch before main/master fallbacks", () => {
  assert.deepEqual(resolveBranchCandidates("develop"), ["develop", "main", "master"]);
  assert.deepEqual(resolveBranchCandidates("main"), ["main", "master"]);
});

runTest("builds raw GitHub URLs with encoded path segments", () => {
  assert.equal(
    buildRawGithubUrl("farion1231", "cc-switch", "main", "src/api/client.ts"),
    "https://raw.githubusercontent.com/farion1231/cc-switch/main/src/api/client.ts",
  );
});

runTest("truncates large files while preserving file path and line span note", () => {
  const truncated = truncateFileForPrompt(
    "src/api/client.ts",
    Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join("\n"),
    120,
  );

  assert.equal(truncated.filePath, "src/api/client.ts");
  assert.equal(truncated.content.includes("line 1"), true);
  assert.equal(truncated.content.includes("line 60"), true);
  assert.equal(truncated.content.includes("truncated"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-code-tests src/types/agent.ts src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts
node .tmp-agent-code-tests/__tests__/agent-code-context.test.js
```

Expected: FAIL with missing `buildRawGithubUrl`, `resolveBranchCandidates`, or `truncateFileForPrompt`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/agent-code-context.ts
export function resolveBranchCandidates(defaultBranch?: string): string[] {
  const ordered = [defaultBranch || "", "main", "master"]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(ordered));
}

export function buildRawGithubUrl(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): string {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`;
}

export function truncateFileForPrompt(
  filePath: string,
  content: string,
  maxChars: number,
): { filePath: string; content: string; snippet: string } {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) {
    return {
      filePath,
      content: trimmed,
      snippet: trimmed.slice(0, 220),
    };
  }

  const headBudget = Math.floor(maxChars * 0.55);
  const tailBudget = Math.max(0, maxChars - headBudget - 48);
  const head = trimmed.slice(0, headBudget).trimEnd();
  const tail = trimmed.slice(-tailBudget).trimStart();

  return {
    filePath,
    content: `${head}\n/* truncated */\n${tail}`,
    snippet: head.slice(0, 220),
  };
}
```

```ts
// src/services/github.ts
export async function getDefaultBranch(owner: string, repo: string): Promise<string | null> {
  try {
    const info = await getRepoInfo(owner, repo);
    return info ? "default_branch" in (info as Record<string, unknown>)
      ? String((info as Record<string, unknown>).default_branch || "")
      : null
      : null;
  } catch {
    return null;
  }
}

export async function getRawFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<string | null> {
  const cacheKey = getCacheKey(owner, repo, `raw_${branch}_${filePath}`);
  const cached = getFromCache<string>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`,
      {},
      10000,
    );
    if (!response.ok) return null;
    const content = await response.text();
    setCache(cacheKey, content);
    return content;
  } catch {
    return null;
  }
}
```

Note for implementation: when updating `RepoInfo`, include `defaultBranch: data.default_branch || "main"` so `getDefaultBranch()` can read a typed field instead of using a record cast.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-code-tests src/types/agent.ts src/services/agent-code-context.ts src/services/github.ts src/__tests__/agent-code-context.test.ts
node .tmp-agent-code-tests/__tests__/agent-code-context.test.js
```

Expected:

```text
PASS prefers repository default branch before main/master fallbacks
PASS builds raw GitHub URLs with encoded path segments
PASS truncates large files while preserving file path and line span note
```

- [ ] **Step 5: Commit**

```bash
git add src/services/github.ts src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts
git commit -m "feat: add github file retrieval helpers for agent"
```

### Task 3: Implement Two-Stage Agent Runtime With Graceful Fallback

**Files:**
- Create: `src/services/agent-chat-runtime.ts`
- Create: `src/__tests__/agent-chat-runtime.test.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/types/agent.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";

import { answerAgentQuestion } from "../services/agent-chat-runtime.js";

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runAsyncTest("uses summary-only mode when planner says code is unnecessary", async () => {
  const result = await answerAgentQuestion({
    payload: {
      repo: { owner: "farion1231", name: "cc-switch" },
      language: "zh",
      question: "这个项目是做什么的？",
      sourceMapSummary: "Core modules: popup, proxy",
      readmeSummary: "README summary",
      recentMessages: [],
      sessionSummary: null,
    },
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "summary is enough",
      confidence: "medium",
    }),
    answerWithSummary: async () => ({
      answer: "这是一个代理切换工具。",
      confidence: "medium",
      evidence: [],
      suggestedNextSteps: [],
      source: "ai",
    }),
    answerWithCode: async () => {
      throw new Error("should not be called");
    },
    fetchFiles: async () => [],
  });

  assert.equal(result.retrievalMode, "summary-only");
  assert.equal(result.answer, "这是一个代理切换工具。");
});

await runAsyncTest("uses github-code mode when planner selects files and fetch succeeds", async () => {
  const result = await answerAgentQuestion({
    payload: {
      repo: { owner: "farion1231", name: "cc-switch" },
      language: "zh",
      question: "测试按钮如何发请求？",
      sourceMapSummary: "Core modules: src/components/Settings.tsx",
      readmeSummary: "README summary",
      recentMessages: [],
      sessionSummary: null,
    },
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: ["src/components/Settings.tsx"],
      reason: "request flow question",
      confidence: "high",
    }),
    fetchFiles: async () => ([
      {
        filePath: "src/components/Settings.tsx",
        branch: "main",
        status: "fetched",
        snippet: "handleTest()",
        content: "const response = await fetch('/v1/messages')",
      },
    ]),
    answerWithSummary: async () => ({
      answer: "fallback",
      confidence: "low",
      evidence: [],
      suggestedNextSteps: [],
      source: "fallback",
    }),
    answerWithCode: async ({ retrievedFiles }) => ({
      answer: `分析了 ${retrievedFiles.length} 个文件后得出结论。`,
      confidence: "high",
      evidence: [],
      suggestedNextSteps: [],
      source: "ai",
    }),
  });

  assert.equal(result.retrievalMode, "github-code");
  assert.equal(result.retrievedFiles?.[0]?.filePath, "src/components/Settings.tsx");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-runtime-tests src/types/agent.ts src/services/agent-code-context.ts src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts
```

Expected: FAIL with `File 'src/services/agent-chat-runtime.ts' not found` or missing exports.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/agent-chat-runtime.ts
import type {
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  AgentRetrievalPlan,
  RetrievedFileContext,
} from "@/types/agent";

interface RetrievedPromptFile extends RetrievedFileContext {
  content?: string;
}

export async function answerAgentQuestion(input: {
  payload: AgentChatRequestPayload;
  planRetriever: (payload: AgentChatRequestPayload) => Promise<AgentRetrievalPlan>;
  fetchFiles: (payload: AgentChatRequestPayload, targetFiles: string[]) => Promise<RetrievedPromptFile[]>;
  answerWithSummary: (payload: AgentChatRequestPayload) => Promise<AgentChatResponsePayload>;
  answerWithCode: (args: {
    payload: AgentChatRequestPayload;
    plan: AgentRetrievalPlan;
    retrievedFiles: RetrievedPromptFile[];
  }) => Promise<AgentChatResponsePayload>;
}): Promise<AgentChatResponsePayload & {
  retrievalMode: "summary-only" | "github-code";
  retrievedFiles: RetrievedPromptFile[];
  retrievalNote?: string;
}> {
  const plan = await input.planRetriever(input.payload);
  if (!plan.needsCodeContext || plan.targetFiles.length === 0) {
    const summaryResult = await input.answerWithSummary(input.payload);
    return {
      ...summaryResult,
      retrievalMode: "summary-only",
      retrievedFiles: [],
    };
  }

  const retrievedFiles = await input.fetchFiles(input.payload, plan.targetFiles);
  const fetchedFiles = retrievedFiles.filter((item) => item.status === "fetched" && item.content);
  if (fetchedFiles.length === 0) {
    const fallback = await input.answerWithSummary(input.payload);
    return {
      ...fallback,
      retrievalMode: "summary-only",
      retrievedFiles,
      retrievalNote: "code_fetch_failed",
    };
  }

  const grounded = await input.answerWithCode({
    payload: input.payload,
    plan,
    retrievedFiles: fetchedFiles,
  });

  return {
    ...grounded,
    retrievalMode: "github-code",
    retrievedFiles,
    retrievalNote: retrievedFiles.some((item) => item.status !== "fetched")
      ? "partial_code_fetch"
      : undefined,
  };
}
```

```ts
// src/background/service-worker.ts
import { answerAgentQuestion } from "@/services/agent-chat-runtime";
import {
  buildRawGithubUrl,
  parseRetrievalPlan,
  resolveBranchCandidates,
  selectFilesWithinBudget,
  truncateFileForPrompt,
} from "@/services/agent-code-context";
import { getDefaultBranch, getRawFileContent } from "@/services/github";

async function fetchAgentFiles(
  payload: AgentChatRequestPayload,
  targetFiles: string[],
): Promise<Array<{ filePath: string; branch?: string; status: "fetched" | "failed"; snippet?: string; reason?: string; content?: string }>> {
  const defaultBranch = await getDefaultBranch(payload.repo.owner, payload.repo.name);
  const candidates = resolveBranchCandidates(defaultBranch || undefined);
  const results = [];

  for (const filePath of targetFiles.slice(0, 5)) {
    let fetched: string | null = null;
    let branchUsed: string | undefined;
    for (const branch of candidates) {
      fetched = await getRawFileContent(payload.repo.owner, payload.repo.name, branch, filePath);
      if (fetched) {
        branchUsed = branch;
        break;
      }
    }

    if (!fetched) {
      results.push({ filePath, status: "failed", reason: "github_fetch_failed" });
      continue;
    }

    const truncated = truncateFileForPrompt(filePath, fetched, 4000);
    results.push({
      filePath,
      branch: branchUsed,
      status: "fetched",
      snippet: truncated.snippet,
      content: truncated.content,
    });
  }

  return selectFilesWithinBudget(
    results.filter((item) => item.status === "fetched" && item.content) as Array<{ filePath: string; content: string; branch?: string; snippet?: string; status: "fetched" }>,
    { maxFiles: 5, maxTotalChars: 12000, maxCharsPerFile: 4000 },
  ).map((item) => ({ ...item, status: "fetched" as const }));
}
```

Implementation note: when wiring `chatWithAgent`, keep the current summary-only prompt as `answerWithSummary`, add a short JSON-only planner prompt, and add a grounded code-answer prompt for `answerWithCode`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-runtime-tests src/types/agent.ts src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts
node .tmp-agent-runtime-tests/__tests__/agent-chat-runtime.test.js
```

Expected:

```text
PASS uses summary-only mode when planner says code is unnecessary
PASS uses github-code mode when planner selects files and fetch succeeds
```

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts src/background/service-worker.ts src/types/agent.ts
git commit -m "feat: add two-stage agent runtime"
```

### Task 4: Persist Retrieval Metadata And Render Analyzed Files In The Chat UI

**Files:**
- Modify: `src/services/agent-session.ts`
- Modify: `src/components/AgentTab.tsx`
- Modify: `src/types/agent.ts`
- Modify: `src/__tests__/agent-chat-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
await runAsyncTest("preserves retrieved files in the final response for UI rendering", async () => {
  const result = await answerAgentQuestion({
    payload: {
      repo: { owner: "farion1231", name: "cc-switch" },
      language: "zh",
      question: "测试按钮如何发请求？",
      sourceMapSummary: "Core modules: SettingsTab",
      readmeSummary: "README summary",
      recentMessages: [],
      sessionSummary: null,
    },
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: ["src/components/SettingsTab.tsx"],
      reason: "request flow question",
      confidence: "high",
    }),
    fetchFiles: async () => ([
      {
        filePath: "src/components/SettingsTab.tsx",
        branch: "main",
        status: "fetched",
        snippet: "handleTest",
        content: "async function handleTest() {}",
      },
    ]),
    answerWithSummary: async () => ({
      answer: "fallback",
      confidence: "low",
      evidence: [],
      suggestedNextSteps: [],
      source: "fallback",
    }),
    answerWithCode: async () => ({
      answer: "最终答案",
      confidence: "high",
      evidence: [],
      suggestedNextSteps: [],
      source: "ai",
    }),
  });

  assert.equal(result.retrievedFiles?.length, 1);
  assert.equal(result.retrievedFiles?.[0]?.branch, "main");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-runtime-tests src/types/agent.ts src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts
node .tmp-agent-runtime-tests/__tests__/agent-chat-runtime.test.js
```

Expected: FAIL because the runtime does not yet carry `retrievedFiles` consistently through the response or the type definition rejects the field.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/agent-session.ts
function normalizeRetrievedFiles(message: AgentMessage): AgentMessage["retrievedFiles"] {
  return Array.isArray(message.retrievedFiles)
    ? message.retrievedFiles
        .filter((item) => item && item.filePath)
        .slice(0, 5)
        .map((item) => ({
          filePath: item.filePath,
          branch: item.branch,
          status: item.status,
          snippet: item.snippet,
          reason: item.reason,
        }))
    : undefined;
}

export function appendMessage(
  session: AgentSession,
  message: AgentMessage,
): AgentSession {
  const content = normalizeMessageContent(message.content, message.role);
  if (!content) return session;

  const normalizedMessage: AgentMessage = {
    ...message,
    content,
    retrievedFiles: normalizeRetrievedFiles(message),
  };

  return {
    ...session,
    recentMessages: [...session.recentMessages, normalizedMessage].slice(-MAX_RECENT_MESSAGES),
    updatedAt: Date.now(),
    messageCount: Math.max(session.messageCount + 1, session.recentMessages.length + 1),
  };
}
```

```tsx
// src/components/AgentTab.tsx
const analyzedFiles = (message.retrievedFiles || []).filter((item) => item.status === "fetched");
const fallbackRelatedFiles =
  analyzedFiles.length > 0
    ? []
    : message.evidence?.filter((item) => item.reason === "related_file" && item.filePath) || [];

{analyzedFiles.length > 0 && (
  <div className="mt-2 space-y-1">
    <p className="text-[11px] text-gray-500">{isZh ? "本次分析文件" : "Analyzed files"}</p>
    {analyzedFiles.map((item) => (
      <button
        key={`${message.id}_${item.filePath}`}
        className="inline-block mr-1 mb-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
        onClick={() => {
          const branch = item.branch || "main";
          window.open(
            `https://github.com/${repo.owner}/${repo.name}/blob/${branch}/${item.filePath}`,
            "_blank",
          );
        }}
      >
        {item.filePath}
      </button>
    ))}
  </div>
)}

{message.retrievalNote && (
  <p className="text-[11px] text-amber-600 mt-1">
    {isZh ? "部分源码获取失败，答案基于已获取内容生成。" : "Some files could not be fetched. Answer is based on available code."}
  </p>
)}
```

Also update the footer copy near the composer:

```tsx
{isZh
  ? "默认先用 README + 源码地图判断，必要时自动抓取 GitHub 源码"
  : "Starts with README + source map and fetches GitHub code when needed"}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-runtime-tests src/types/agent.ts src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts
node .tmp-agent-runtime-tests/__tests__/agent-chat-runtime.test.js
npm run type-check
```

Expected:

```text
PASS preserves retrieved files in the final response for UI rendering
```

And `npm run type-check` should finish without errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-session.ts src/components/AgentTab.tsx src/types/agent.ts src/__tests__/agent-chat-runtime.test.ts
git commit -m "feat: show analyzed files in agent chat"
```

### Task 5: Final Verification And Cleanup

**Files:**
- Verify only: `src/services/agent-code-context.ts`
- Verify only: `src/services/github.ts`
- Verify only: `src/services/agent-chat-runtime.ts`
- Verify only: `src/background/service-worker.ts`
- Verify only: `src/components/AgentTab.tsx`
- Verify only: `src/services/agent-session.ts`

- [ ] **Step 1: Run targeted helper tests**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-final-tests src/types/agent.ts src/services/agent-code-context.ts src/services/agent-chat-runtime.ts src/__tests__/agent-code-context.test.ts src/__tests__/agent-chat-runtime.test.ts
node .tmp-agent-final-tests/__tests__/agent-code-context.test.js
node .tmp-agent-final-tests/__tests__/agent-chat-runtime.test.js
```

Expected:

```text
PASS parses a valid retrieval plan and caps file count
PASS normalizes repo-relative candidate paths
PASS drops over-budget files after preserving the first useful matches
PASS uses summary-only mode when planner says code is unnecessary
PASS uses github-code mode when planner selects files and fetch succeeds
PASS preserves retrieved files in the final response for UI rendering
```

- [ ] **Step 2: Run type check**

Run:

```bash
npm run type-check
```

Expected: `tsc --noEmit` exits successfully with no TypeScript errors.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build succeeds and `dist/` assets are generated without build errors.

- [ ] **Step 4: Manual verification in extension UI**

Verify these cases manually:

```text
1. Ask an orientation question like "这个项目是做什么的？"
   Expected: normal answer, no analyzed-files section, retrievalMode behaves as summary-only.

2. Ask a code-detail question like "测试连接按钮是怎么发请求的？"
   Expected: answer includes analyzed files under the message and those files open on GitHub when clicked.

3. Ask a question against a repo with one invalid candidate file.
   Expected: answer still renders if at least one file was fetched, with a short partial failure note.
```

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-code-context.ts src/services/github.ts src/services/agent-chat-runtime.ts src/services/agent-session.ts src/background/service-worker.ts src/components/AgentTab.tsx src/types/agent.ts src/__tests__/agent-code-context.test.ts src/__tests__/agent-chat-runtime.test.ts
git commit -m "feat: add on-demand code context for agent chat"
```

## Self-Review

### Spec Coverage

- Two-stage retrieval planning and grounded answering are covered by Task 3.
- GitHub raw fetches, branch fallback, and truncation limits are covered by Task 2.
- Retrieval metadata persistence and analyzed-files UI rendering are covered by Task 4.
- Graceful fallback and verification are covered by Tasks 3 and 5.

### Placeholder Scan

- No `TBD`, `TODO`, or cross-task placeholders remain.
- Every code-writing step includes concrete snippets.
- Every validation step includes exact commands and expected outcomes.

### Type Consistency

- `AgentRetrievalPlan`, `RetrievedFileContext`, `retrievalMode`, and `retrievalNote` are introduced first in Task 1 and reused consistently in later tasks.
- The final runtime contract always returns `retrievedFiles`, which aligns with the UI task and session persistence task.
