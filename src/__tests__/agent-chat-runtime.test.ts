import assert from "node:assert";
import test from "node:test";

import { fetchRetrievedGithubFiles } from "../services/agent-code-context.js";
import {
  answerAgentQuestion,
  buildFastPathAgentAnswer,
} from "../services/agent-chat-runtime.js";

import type {
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  RetrievedFileMetadata,
  AgentRetrievalPlan,
  RetrievedFileContext,
} from "../types/agent.js";

function createPayload(): AgentChatRequestPayload {
  return {
    repo: { owner: "acme", name: "widgets" },
    language: "en",
    question: "How does the request flow work?",
    sourceMapSummary: "Source map summary",
    readmeSummary: "README summary",
    sessionSummary: null,
    recentMessages: [],
  };
}

function createAnswer(answer: string): AgentChatResponsePayload {
  return {
    answer,
    confidence: "medium",
    evidence: [],
    suggestedNextSteps: [],
    source: "ai",
  };
}

test("returns summary-only answer when planner says code context is unnecessary", async () => {
  const payload = createPayload();
  const calls = {
    fetchFiles: 0,
    answerWithSummary: 0,
    answerWithCode: 0,
  };

  const result = await answerAgentQuestion(payload, {
    planRetriever: async (receivedPayload) => {
      assert.strictEqual(receivedPayload, payload);
      return {
        needsCodeContext: false,
        targetFiles: ["src/request-flow.ts"],
        reason: "Summaries are enough",
        confidence: "high",
      } satisfies AgentRetrievalPlan;
    },
    fetchFiles: async () => {
      calls.fetchFiles += 1;
      return [];
    },
    answerWithSummary: async (receivedPayload) => {
      calls.answerWithSummary += 1;
      assert.strictEqual(receivedPayload, payload);
      return createAnswer("summary answer");
    },
    answerWithCode: async () => {
      calls.answerWithCode += 1;
      return createAnswer("code answer");
    },
  });

  assert.strictEqual(result.answer, "summary answer");
  assert.strictEqual(result.retrievalMode, "summary-only");
  assert.deepStrictEqual(result.retrievedFiles, []);
  assert.strictEqual(result.retrievalNote, undefined);
  assert.strictEqual(calls.fetchFiles, 0);
  assert.strictEqual(calls.answerWithSummary, 1);
  assert.strictEqual(calls.answerWithCode, 0);
});

test("returns github-code answer when planner selects files and at least one fetch succeeds", async () => {
  const payload = createPayload();
  const plan: AgentRetrievalPlan = {
    needsCodeContext: true,
    targetFiles: ["src/request-flow.ts", "src/http/client.ts"],
    reason: "Need concrete implementation details",
    confidence: "high",
  };
  const retrievedFiles: RetrievedFileContext[] = [
    {
      filePath: "src/request-flow.ts",
      branch: "main",
      status: "fetched",
      snippet: "export async function runRequestFlow() {}",
    },
    {
      filePath: "src/http/client.ts",
      branch: "main",
      status: "fetched",
      snippet: "export class HttpClient {}",
    },
  ];
  let summaryCalls = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => plan,
    fetchFiles: async (receivedPayload, targetFiles) => {
      assert.strictEqual(receivedPayload, payload);
      assert.deepStrictEqual(targetFiles, plan.targetFiles);
      return retrievedFiles;
    },
    answerWithSummary: async () => {
      summaryCalls += 1;
      return createAnswer("summary answer");
    },
    answerWithCode: async ({ payload: receivedPayload, plan: receivedPlan, retrievedFiles: receivedFiles }) => {
      assert.strictEqual(receivedPayload, payload);
      assert.strictEqual(receivedPlan, plan);
      assert.strictEqual(receivedFiles, retrievedFiles);
      return createAnswer("code answer");
    },
  });

  assert.strictEqual(result.answer, "code answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, retrievedFiles);
  assert.strictEqual(result.retrievalNote, undefined);
  assert.strictEqual(summaryCalls, 0);
});

test("falls back to summary-only answer when planner selects files but no fetch succeeds", async () => {
  const payload = createPayload();
  const retrievedFiles: RetrievedFileContext[] = [
    {
      filePath: "src/request-flow.ts",
      branch: "main",
      status: "failed",
      reason: "404",
    },
    {
      filePath: "src/http/client.ts",
      branch: "main",
      status: "failed",
      reason: "timeout",
    },
  ];
  let codeCalls = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: retrievedFiles.map((file) => file.filePath),
      reason: "Need code details",
      confidence: "medium",
    }),
    fetchFiles: async () => retrievedFiles,
    answerWithSummary: async () => createAnswer("summary fallback answer"),
    answerWithCode: async () => {
      codeCalls += 1;
      return createAnswer("code answer");
    },
  });

  assert.strictEqual(result.answer, "summary fallback answer");
  assert.strictEqual(result.retrievalMode, "summary-only");
  assert.deepStrictEqual(result.retrievedFiles, retrievedFiles);
  assert.strictEqual(
    result.retrievalNote,
    "Fell back to summary-only because GitHub code context could not be retrieved for 2 requested files.",
  );
  assert.strictEqual(codeCalls, 0);
});

test("adds a partial retrieval note when some requested files fail but at least one succeeds", async () => {
  const payload = createPayload();
  const retrievedFiles: RetrievedFileContext[] = [
    {
      filePath: "src/request-flow.ts",
      branch: "main",
      status: "fetched",
      snippet: "export async function runRequestFlow() {}",
    },
    {
      filePath: "src/http/client.ts",
      branch: "main",
      status: "failed",
      reason: "404",
    },
  ];

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: retrievedFiles.map((file) => file.filePath),
      reason: "Need code details",
      confidence: "high",
    }),
    fetchFiles: async () => retrievedFiles,
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
  });

  assert.strictEqual(result.answer, "code answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, retrievedFiles);
  assert.strictEqual(
    result.retrievalNote,
    "Used GitHub code context from 1 of 2 requested files.",
  );
});

test("preserves UI-facing answer fields alongside retrieval metadata in code-context responses", async () => {
  const payload = createPayload();
  const retrievedFiles: RetrievedFileMetadata[] = [
    {
      filePath: "src/request-flow.ts",
      branch: "release",
      status: "fetched",
    },
    {
      filePath: "src/http/client.ts",
      branch: "release",
      status: "failed",
      reason: "404",
    },
  ];

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: retrievedFiles.map((file) => file.filePath),
      reason: "Need implementation details",
      confidence: "high",
    }),
    fetchFiles: async () => retrievedFiles,
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => ({
      answer: "code answer",
      confidence: "high",
      evidence: [
        {
          filePath: "src/request-flow.ts",
          lineStart: 12,
          snippet: "runRequestFlow();",
          reason: "entry point",
        },
      ],
      suggestedNextSteps: ["Inspect the HTTP client retry path."],
      source: "ai",
      downgraded: true,
      reason: "lite_prompt_retry",
    }),
  });

  assert.strictEqual(result.answer, "code answer");
  assert.strictEqual(result.confidence, "high");
  assert.deepStrictEqual(result.evidence, [
    {
      filePath: "src/request-flow.ts",
      lineStart: 12,
      snippet: "runRequestFlow();",
      reason: "entry point",
    },
  ]);
  assert.deepStrictEqual(result.suggestedNextSteps, [
    "Inspect the HTTP client retry path.",
  ]);
  assert.strictEqual(result.source, "ai");
  assert.strictEqual(result.downgraded, true);
  assert.strictEqual(result.reason, "lite_prompt_retry");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, retrievedFiles);
  assert.strictEqual(
    result.retrievalNote,
    "Used GitHub code context from 1 of 2 requested files.",
  );
});

test("fetchRetrievedGithubFiles retries branch candidates per file until one succeeds", async () => {
  const branchAttempts: Array<{ branch: string; filePath: string }> = [];
  const progressEvents: Array<{ completed?: number; total?: number }> = [];

  const result = await fetchRetrievedGithubFiles(
    {
      owner: "acme",
      repo: "widgets",
      targetFiles: ["src/request-flow.ts", "src/http/client.ts"],
      timeoutMs: 7000,
      maxCharsPerFile: 200,
    },
    {
      getDefaultBranch: async () => "develop",
      getRawFileContent: async (_owner, _repo, branch, filePath) => {
        branchAttempts.push({ branch, filePath });
        if (filePath === "src/request-flow.ts" && branch === "main") {
          return "export async function runRequestFlow() { return true; }";
        }
        if (filePath === "src/http/client.ts" && branch === "master") {
          return "export class HttpClient {}";
        }
        return null;
      },
    },
    (progress) => {
      progressEvents.push({
        completed: progress.completed,
        total: progress.total,
      });
    },
  );

  const attemptsByFile = branchAttempts.reduce<Record<string, string[]>>((acc, item) => {
    acc[item.filePath] ||= [];
    acc[item.filePath].push(item.branch);
    return acc;
  }, {});

  assert.deepStrictEqual(attemptsByFile, {
    "src/request-flow.ts": ["develop", "main"],
    "src/http/client.ts": ["develop", "main", "master"],
  });
  assert.deepStrictEqual(result, [
    {
      filePath: "src/request-flow.ts",
      branch: "main",
      status: "fetched",
      snippet: "File: src/request-flow.ts\nexport async function runRequestFlow() { return true; }",
    },
    {
      filePath: "src/http/client.ts",
      branch: "master",
      status: "fetched",
      snippet: "File: src/http/client.ts\nexport class HttpClient {}",
    },
  ]);
});

test("fetchRetrievedGithubFiles falls back to main and master when default branch lookup fails", async () => {
  const branchAttempts: string[] = [];

  const result = await fetchRetrievedGithubFiles(
    {
      owner: "acme",
      repo: "widgets",
      targetFiles: ["src/request-flow.ts"],
      timeoutMs: 7000,
      maxCharsPerFile: 200,
    },
    {
      getDefaultBranch: async () => {
        throw new Error("lookup failed");
      },
      getRawFileContent: async (_owner, _repo, branch) => {
        branchAttempts.push(branch);
        return null;
      },
    },
  );

  assert.deepStrictEqual(branchAttempts, ["main", "master"]);
  assert.deepStrictEqual(result, [
    {
      filePath: "src/request-flow.ts",
      status: "failed",
      reason: "content_unavailable",
    },
  ]);
});

test("falls back to a local summary answer when summary generation times out", async () => {
  const payload = createPayload();

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "Summaries are enough",
      confidence: "medium",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => {
      throw new Error("REQUEST_TIMEOUT");
    },
    answerWithCode: async () => createAnswer("code answer"),
  });

  assert.strictEqual(result.retrievalMode, "summary-only");
  assert.deepStrictEqual(result.retrievedFiles, []);
  assert.strictEqual(result.source, "fallback");
  assert.strictEqual(result.confidence, "low");
  assert.match(result.answer, /README|source map|源码地图|README/);
});

test("falls back to a local answer when code-grounded generation times out", async () => {
  const payload = createPayload();
  const retrievedFiles: RetrievedFileContext[] = [
    {
      filePath: "src/request-flow.ts",
      branch: "main",
      status: "fetched",
      snippet: "export async function runRequestFlow() {}",
    },
  ];

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: ["src/request-flow.ts"],
      reason: "Need implementation details",
      confidence: "high",
    }),
    fetchFiles: async () => retrievedFiles,
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => {
      throw new Error("REQUEST_TIMEOUT");
    },
  });

  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, retrievedFiles);
  assert.strictEqual(result.source, "fallback");
  assert.strictEqual(result.confidence, "low");
  assert.match(result.answer, /src\/request-flow\.ts|README|source map|源码地图/);
});

test("handles greeting-only turns locally without invoking retrieval planning", async () => {
  const payload: AgentChatRequestPayload = {
    ...createPayload(),
    language: "zh",
    question: "你好",
  };

  let plannerCalls = 0;
  let summaryCalls = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => {
      plannerCalls += 1;
      return {
        needsCodeContext: false,
        targetFiles: [],
        reason: "unused",
        confidence: "low",
      };
    },
    fetchFiles: async () => [],
    answerWithSummary: async () => {
      summaryCalls += 1;
      return createAnswer("summary answer");
    },
    answerWithCode: async () => createAnswer("code answer"),
  });

  assert.strictEqual(plannerCalls, 0);
  assert.strictEqual(summaryCalls, 0);
  assert.strictEqual(result.retrievalMode, "summary-only");
  assert.deepStrictEqual(result.retrievedFiles, []);
  assert.strictEqual(result.source, "fallback");
  assert.match(result.answer, /GitMentor|仓库|README|源码地图/);
});

test("buildFastPathAgentAnswer returns immediate reply for greeting-only turns", () => {
  const result = buildFastPathAgentAnswer({
    ...createPayload(),
    language: "zh",
    question: "你好",
  });

  assert.ok(result);
  assert.strictEqual(result?.retrievalMode, "summary-only");
  assert.deepStrictEqual(result?.retrievedFiles, []);
  assert.match(String(result?.answer || ""), /GitMentor|仓库/);
});

test("buildFastPathAgentAnswer skips normal repo questions", () => {
  const result = buildFastPathAgentAnswer(createPayload());

  assert.strictEqual(result, null);
});

test("emits user-facing progress stages while locating, reading, and drafting code answers", async () => {
  const payload = createPayload();
  const progressStages: string[] = [];
  const readingCounts: Array<{ completed?: number; total?: number }> = [];
  const retrievedFiles: RetrievedFileContext[] = [
    {
      filePath: "src/auth/index.ts",
      branch: "main",
      status: "fetched",
      snippet: "export function startAuth() {}",
    },
    {
      filePath: "src/auth/session.ts",
      branch: "main",
      status: "fetched",
      snippet: "export function createSession() {}",
    },
  ];

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: true,
      targetFiles: [],
      reason: "Need auth implementation details",
      confidence: "high",
    }),
    discoverFiles: async () => [
      "src/auth/index.ts",
      "src/auth/session.ts",
    ],
    fetchFiles: async (_receivedPayload, targetFiles, onFileProgress) => {
      assert.deepStrictEqual(targetFiles, [
        "src/auth/index.ts",
        "src/auth/session.ts",
      ]);
      await onFileProgress?.({ completed: 1, total: 2 });
      await onFileProgress?.({ completed: 2, total: 2 });
      return retrievedFiles;
    },
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    onProgress: async (event) => {
      progressStages.push(event.stage);
      if (event.stage === "reading-files") {
        readingCounts.push({
          completed: event.completed,
          total: event.total,
        });
      }
    },
  });

  assert.strictEqual(result.answer, "code answer");
  assert.deepStrictEqual(progressStages, [
    "locating-files",
    "reading-files",
    "reading-files",
    "reading-files",
    "drafting-answer",
  ]);
  assert.deepStrictEqual(readingCounts, [
    { completed: 0, total: 2 },
    { completed: 1, total: 2 },
    { completed: 2, total: 2 },
  ]);
});
