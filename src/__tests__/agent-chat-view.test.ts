import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGithubBlobUrl,
  buildRetrievalUiNote,
  getAnalyzedFiles,
  getFallbackRelatedFiles,
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
    "GitHub 源码未成功获取，本次回答回退为 README、源码地图和会话上下文。",
  );
  assert.equal(
    buildRetrievalUiNote(partialMessage, "en"),
    "Used 1/2 requested GitHub files.",
  );
});
