import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGithubBlobUrl,
  buildRetrievalUiNote,
  getAnalyzedFiles,
  getFallbackRelatedFiles,
  formatConfidenceLabel,
  getDisplayEvidence,
  shortenFilePathForDisplay,
  shortenFilePathsForDisplay,
} from "../services/agent-chat-view.js";

import type { AgentMessage } from "../types/agent.js";

function createAssistantMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "assistant_1",
    role: "assistant",
    content: "answer",
    createdAt: 1,
    evidence: [],
    confidence: "medium",
    ...overrides,
  };
}

test("getAnalyzedFiles returns deduped fetched files and buildGithubBlobUrl preserves branch", () => {
  const message = createAssistantMessage({
    retrievedFiles: [
      { filePath: "src/request-flow.ts", branch: "release", status: "fetched" },
      { filePath: "src/request-flow.ts", branch: "release", status: "fetched" },
      { filePath: "src/http/client.ts", branch: "main", status: "failed" },
      { filePath: "src/http/retry.ts", status: "fetched" },
    ],
  });

  assert.deepStrictEqual(getAnalyzedFiles(message), [
    { filePath: "src/request-flow.ts", branch: "release", status: "fetched" },
    { filePath: "src/http/retry.ts", status: "fetched" },
  ]);
  assert.equal(
    buildGithubBlobUrl(
      { owner: "acme", name: "widgets" },
      "docs/README #1.md",
      "release/candidate",
    ),
    "https://github.com/acme/widgets/blob/release%2Fcandidate/docs/README%20%231.md",
  );
});

test("getFallbackRelatedFiles prefers explicit related-file evidence and dedupes results", () => {
  const message = createAssistantMessage({
    evidence: [
      { filePath: "src/request-flow.ts", snippet: "", reason: "related_file" },
      { filePath: "src/request-flow.ts", snippet: "", reason: "related_file" },
      { filePath: "src/http/client.ts", snippet: "fetch()", reason: "entry point" },
    ],
  });

  assert.deepStrictEqual(getFallbackRelatedFiles(message), ["src/request-flow.ts"]);
});

test("buildRetrievalUiNote localizes summary fallback and partial fetch states", () => {
  const fallbackMessage = createAssistantMessage({
    retrievalMode: "summary-only",
    retrievalNote: "code_fetch_failed",
    retrievedFiles: [
      { filePath: "src/request-flow.ts", status: "failed", reason: "404" },
    ],
  });
  const partialMessage = createAssistantMessage({
    retrievalMode: "github-code",
    retrievalNote: "partial_code_fetch",
    retrievedFiles: [
      { filePath: "src/request-flow.ts", status: "fetched", branch: "main" },
      { filePath: "src/http/client.ts", status: "failed", reason: "404" },
    ],
  });

  assert.equal(
    buildRetrievalUiNote(fallbackMessage, "zh"),
    "GitHub 源码未成功获取（通常是接口限流或网络问题），本次回答回退为 README、源码地图和会话上下文。建议在设置中配置 GitHub Token 或稍后重试以提升成功率。",
  );
  assert.equal(
    buildRetrievalUiNote(partialMessage, "en"),
    "Used 1/2 requested GitHub files.",
  );
});

test("formatConfidenceLabel localizes the raw enum instead of showing 'low' in zh UI", () => {
  assert.equal(formatConfidenceLabel("high", "zh"), "高");
  assert.equal(formatConfidenceLabel("medium", "zh"), "中");
  assert.equal(formatConfidenceLabel("low", "zh"), "低");
  assert.equal(formatConfidenceLabel(undefined, "zh"), "低");
  assert.equal(formatConfidenceLabel("high", "en"), "high");
});

test("shortenFilePathForDisplay keeps the identifying tail of deep paths", () => {
  assert.equal(
    shortenFilePathForDisplay("packages/agent/src/harness/tools/index.ts"),
    "…/tools/index.ts",
  );
  assert.equal(shortenFilePathForDisplay("src/index.ts"), "src/index.ts");
  assert.equal(shortenFilePathForDisplay("README.md"), "README.md");
  assert.equal(shortenFilePathForDisplay(""), "");
});

test("shortenFilePathsForDisplay keeps same-named files in a monorepo distinguishable", () => {
  const labels = shortenFilePathsForDisplay([
    "packages/cli/src/commands/search.ts",
    "packages/web/src/commands/search.ts",
    "packages/cli/README.md",
  ]);

  // Truncating each path independently would render the first two identically.
  assert.notEqual(labels[0], labels[1]);
  assert.equal(new Set(labels).size, labels.length);
  assert.match(labels[0], /cli/);
  assert.match(labels[1], /web/);
});

test("shortenFilePathsForDisplay still compacts when there is no collision", () => {
  assert.deepEqual(
    shortenFilePathsForDisplay(["packages/agent/src/harness/tools/index.ts", "README.md"]),
    ["…/tools/index.ts", "README.md"],
  );
});

test("getDisplayEvidence drops duplicate rows the model repeats", () => {
  const message = createAssistantMessage({
    evidence: [
      { filePath: "packages/cli/README.md", reason: "明确说明认证不需要", snippet: "No auth required" },
      { filePath: "packages/cli/README.md", reason: "明确说明认证不需要", snippet: "No auth required" },
      { filePath: "src/auth.ts", reason: "no login path", snippet: "export function auth()" },
      { filePath: "src/other.ts", reason: "related_file", snippet: "" },
    ],
  });

  const evidence = getDisplayEvidence(message);
  assert.equal(evidence.length, 2);
  assert.deepEqual(
    evidence.map((item) => item.filePath),
    ["packages/cli/README.md", "src/auth.ts"],
  );
});
