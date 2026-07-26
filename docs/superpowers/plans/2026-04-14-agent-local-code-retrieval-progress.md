# Agent Local Code Retrieval And Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the conversation assistant so it can automatically locate and read relevant local project files before answering, with simple user-facing progress summaries during the run.

**Architecture:** Keep `chatWithAgent` as the single entrypoint, but replace the one-shot "planner then maybe fetch" flow with a bounded retrieval orchestrator. The orchestrator should search candidate files, read local files first, fall back to GitHub when needed, emit stage progress events, and then call the final answer prompt with grounded code context.

**Tech Stack:** React, TypeScript, Chrome extension service worker, local workspace file access bridge already present in extension runtime, GitHub REST/raw endpoints, node-based tests compiled with `tsc`

---

## File Structure

### New files

- `src/services/agent-progress.ts`
  - Shared types and helpers for compact user-facing progress stages.
- `src/__tests__/agent-progress.test.ts`
  - Covers progress text generation and event shaping.

### Modified files

- `src/types/agent.ts`
  - Extend agent payloads/responses with progress metadata and local retrieval provenance.
- `src/services/agent-code-context.ts`
  - Add candidate search helpers, local-first retrieval orchestration, and bounded file selection utilities.
- `src/services/agent-chat-runtime.ts`
  - Orchestrate automatic retrieval rounds, emit progress callbacks, and preserve fast-path/simple fallback behavior.
- `src/background/service-worker.ts`
  - Wire local workspace search/read helpers, GitHub fallback, and progress event forwarding.
- `src/components/AgentTab.tsx`
  - Replace static "思考中..." placeholder with stage summaries and incremental progress updates.
- `src/__tests__/agent-code-context.test.ts`
  - Cover candidate selection, local-first fallback ordering, and retrieval limits.
- `src/__tests__/agent-chat-runtime.test.ts`
  - Cover multi-stage progress events, automatic retrieval, and summary-only fallback.

---

### Task 1: Define Progress Event Model

**Files:**
- Create: `src/services/agent-progress.ts`
- Create: `src/__tests__/agent-progress.test.ts`
- Modify: `src/types/agent.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";

import { buildAgentProgressText } from "../services/agent-progress.js";

assert.equal(
  buildAgentProgressText({ stage: "locating-files", language: "zh" }),
  "正在定位相关文件",
);

assert.equal(
  buildAgentProgressText({ stage: "reading-files", language: "zh", completed: 2, total: 3 }),
  "正在读取相关文件（2/3）",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-progress-tests src/types/agent.ts src/services/agent-progress.ts src/__tests__/agent-progress.test.ts
```

Expected: FAIL with missing file or missing export errors for `agent-progress.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type AgentProgressStage = "locating-files" | "reading-files" | "drafting-answer";

export function buildAgentProgressText(input: {
  stage: AgentProgressStage;
  language: "zh" | "en";
  completed?: number;
  total?: number;
}): string {
  if (input.stage === "locating-files") {
    return input.language === "zh" ? "正在定位相关文件" : "Locating relevant files";
  }
  if (input.stage === "reading-files") {
    const suffix = input.total ? `（${input.completed || 0}/${input.total}）` : "";
    return input.language === "zh"
      ? `正在读取相关文件${suffix}`
      : `Reading relevant files${suffix ? ` (${input.completed || 0}/${input.total})` : ""}`;
  }
  return input.language === "zh" ? "正在整理答案" : "Preparing the answer";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node .tmp-agent-progress-tests/__tests__/agent-progress.test.js
```

Expected: PASS for both progress text assertions.

- [ ] **Step 5: Commit**

```bash
git add src/types/agent.ts src/services/agent-progress.ts src/__tests__/agent-progress.test.ts
git commit -m "feat: add agent progress stages"
```

### Task 2: Add Local-First Candidate Search And Retrieval

**Files:**
- Modify: `src/services/agent-code-context.ts`
- Modify: `src/__tests__/agent-code-context.test.ts`
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";

import {
  rankCandidateFiles,
  retrieveFilesWithFallback,
} from "../services/agent-code-context.js";

const ranked = rankCandidateFiles({
  question: "登录流程在哪些文件里",
  sourceMapSummary: "Auth flow: src/auth/index.ts, src/auth/session.ts",
  repoPaths: ["src/auth/index.ts", "src/auth/session.ts", "src/ui/App.tsx"],
});

assert.deepEqual(ranked.slice(0, 2), ["src/auth/index.ts", "src/auth/session.ts"]);

const retrieved = await retrieveFilesWithFallback(
  ["src/auth/index.ts"],
  {
    readLocalFile: async (filePath) => filePath === "src/auth/index.ts" ? "local file body" : null,
    readGithubFile: async () => "remote file body",
  },
);

assert.equal(retrieved[0].status, "fetched");
assert.equal(retrieved[0].source, "local");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-code-tests src/types/agent.ts src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts
```

Expected: FAIL with missing `rankCandidateFiles` or `retrieveFilesWithFallback` exports.

- [ ] **Step 3: Write minimal implementation**

```ts
export function rankCandidateFiles(input: {
  question: string;
  sourceMapSummary?: string;
  repoPaths: string[];
}): string[] {
  const tokens = `${input.question} ${input.sourceMapSummary || ""}`.toLowerCase();
  return [...input.repoPaths]
    .map((filePath) => ({
      filePath,
      score: tokens.includes(filePath.toLowerCase()) ? 100 : filePath.toLowerCase().split("/").filter((part) => tokens.includes(part)).length,
    }))
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
    .map((item) => item.filePath);
}

export async function retrieveFilesWithFallback(
  targetFiles: string[],
  deps: {
    readLocalFile: (filePath: string) => Promise<string | null>;
    readGithubFile: (filePath: string) => Promise<string | null>;
  },
) {
  return await Promise.all(
    targetFiles.map(async (filePath) => {
      const local = await deps.readLocalFile(filePath);
      if (local) return { filePath, status: "fetched" as const, source: "local" as const, snippet: local };
      const remote = await deps.readGithubFile(filePath);
      if (remote) return { filePath, status: "fetched" as const, source: "github" as const, snippet: remote };
      return { filePath, status: "failed" as const, reason: "content_unavailable" };
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node .tmp-agent-code-tests/__tests__/agent-code-context.test.js
```

Expected: PASS for candidate ranking and local-first retrieval.

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-code-context.ts src/__tests__/agent-code-context.test.ts src/background/service-worker.ts
git commit -m "feat: add local-first agent code retrieval"
```

### Task 3: Orchestrate Automatic Retrieval And Progress Updates

**Files:**
- Modify: `src/services/agent-chat-runtime.ts`
- Modify: `src/__tests__/agent-chat-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";

import { answerAgentQuestion } from "../services/agent-chat-runtime.js";

const progressEvents: string[] = [];

const result = await answerAgentQuestion(payload, {
  planRetriever: async () => ({ needsCodeContext: true, targetFiles: [], reason: "auth flow", confidence: "medium" }),
  searchFiles: async () => ["src/auth/index.ts", "src/auth/session.ts"],
  fetchFiles: async (_payload, targetFiles) => targetFiles.map((filePath) => ({ filePath, status: "fetched" as const, source: "local" as const, snippet: "code" })),
  answerWithSummary: async () => summaryAnswer,
  answerWithCode: async () => codeAnswer,
  onProgress: (event) => progressEvents.push(event.stage),
});

assert.deepEqual(progressEvents, ["locating-files", "reading-files", "drafting-answer"]);
assert.equal(result.retrievalMode, "github-code");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./node_modules/.bin/tsc --module NodeNext --moduleResolution NodeNext --target ES2020 --types node --esModuleInterop --outDir .tmp-agent-runtime-tests src/types/agent.ts src/services/agent-progress.ts src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts
```

Expected: FAIL because `answerAgentQuestion` does not yet accept `searchFiles`/`onProgress` or emit progress stages.

- [ ] **Step 3: Write minimal implementation**

```ts
await deps.onProgress?.({ stage: "locating-files", language: payload.language });
const discoveredFiles = plan.targetFiles.length > 0
  ? plan.targetFiles
  : await deps.searchFiles(payload, plan);

await deps.onProgress?.({ stage: "reading-files", language: payload.language, total: discoveredFiles.length, completed: 0 });
const retrievedFiles = await deps.fetchFiles(payload, discoveredFiles);

await deps.onProgress?.({ stage: "drafting-answer", language: payload.language });
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node .tmp-agent-runtime-tests/__tests__/agent-chat-runtime.test.js
```

Expected: PASS with ordered progress events and code-grounded response.

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-chat-runtime.ts src/__tests__/agent-chat-runtime.test.ts
git commit -m "feat: orchestrate agent retrieval progress"
```

### Task 4: Surface Progress In The Chat UI

**Files:**
- Modify: `src/components/AgentTab.tsx`

- [ ] **Step 1: Write the failing test**

Document the UI expectation in the existing agent runtime tests by asserting the background response can carry progress snapshots, then add a focused render assertion if the project already has a React test harness. If no React test harness exists, use a pure helper for the message text instead of adding a new UI framework.

- [ ] **Step 2: Run test to verify it fails**

Run the smallest existing targeted test command that covers the new helper or view function.

- [ ] **Step 3: Write minimal implementation**

```ts
setStreamingStatus(isZh ? "正在定位相关文件" : "Locating relevant files");
// ...
setStreamingStatus(isZh ? `正在读取相关文件（${completed}/${total}）` : `Reading relevant files (${completed}/${total})`);
// ...
setStreamingStatus(isZh ? "正在整理答案" : "Preparing the answer");
```

- [ ] **Step 4: Run test to verify it passes**

Run the same targeted helper/view test and confirm the placeholder text updates by stage.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentTab.tsx
git commit -m "feat: show agent retrieval progress in chat"
```

### Task 5: Verify Integrated Behavior And Build Output

**Files:**
- Modify: `dist/*` via build output only

- [ ] **Step 1: Run targeted tests**

Run:

```bash
./node_modules/.bin/tsc -p tsconfig.json --noEmit
node .tmp-agent-progress-tests/__tests__/agent-progress.test.js
node .tmp-agent-code-tests/__tests__/agent-code-context.test.js
node .tmp-agent-runtime-tests/__tests__/agent-chat-runtime.test.js
```

Expected: PASS for typecheck and all targeted tests.

- [ ] **Step 2: Build the extension**

Run:

```bash
pnpm build
```

Expected: successful build and updated `dist` assets.

- [ ] **Step 3: Manual verification**

1. Reload the unpacked extension from `D:\projects\products\gitMentor\dist`.
2. Open a repository popup and ask a code question such as “登录流程在哪些文件里？”.
3. Confirm the placeholder progresses through:
   - `正在定位相关文件`
   - `正在读取相关文件`
   - `正在整理答案`
4. Confirm the final answer shows analyzed files and returns quickly for a greeting.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-14-agent-local-code-retrieval-progress.md
git commit -m "docs: add agent local retrieval plan"
```
