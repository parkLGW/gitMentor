import assert from "node:assert";
import test from "node:test";

import { fetchRetrievedGithubFiles } from "../services/agent-code-context.js";
import {
  answerAgentQuestion,
  buildFastPathAgentAnswer,
} from "../services/agent-chat-runtime.js";

import type {
  AgentIntent,
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  AgentObservation,
  RetrievedFileMetadata,
  AgentRetrievalPlan,
  RetrievedFileContext,
  AgentSufficiencyDecision,
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

test("fetchRetrievedGithubFiles tries raw HEAD before default branch API lookup", async () => {
  let defaultBranchCalls = 0;
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
        defaultBranchCalls += 1;
        return "develop";
      },
      getRawFileContent: async (_owner, _repo, branch) => {
        branchAttempts.push(branch);
        return branch === "HEAD"
          ? "export async function runRequestFlow() { return true; }"
          : null;
      },
    },
  );

  assert.strictEqual(defaultBranchCalls, 0);
  assert.deepStrictEqual(branchAttempts, ["HEAD"]);
  assert.deepStrictEqual(result, [
    {
      filePath: "src/request-flow.ts",
      branch: "HEAD",
      status: "fetched",
      snippet: "File: src/request-flow.ts\nexport async function runRequestFlow() { return true; }",
    },
  ]);
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
        if (filePath === "src/http/client.ts" && branch === "develop") {
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
    "src/request-flow.ts": ["HEAD", "main"],
    "src/http/client.ts": ["HEAD", "main", "master", "develop"],
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
      branch: "develop",
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

  assert.deepStrictEqual(branchAttempts, ["HEAD", "main", "master"]);
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
  assert.strictEqual(result.confidence, "medium");
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

test("generic agent loop continues with next tool calls until observations are sufficient", async () => {
  const payload = createPayload();
  const events: string[] = [];
  const executed: string[] = [];
  const fetchedFile: RetrievedFileContext = {
    filePath: "src/request-flow.ts",
    branch: "main",
    status: "fetched",
    snippet: "export async function runRequestFlow() {}",
  };
  const intent: AgentIntent = {
    category: "architecture",
    reason: "Need repository implementation details",
    confidence: "high",
    toolCalls: [
      {
        tool: "searchRepoPaths",
        args: { query: "request flow" },
      },
    ],
  };
  let sufficiencyChecks = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => intent,
    executeToolCalls: async (_payload, calls): Promise<AgentObservation[]> => {
      executed.push(calls[0].tool);
      if (calls[0].tool === "searchRepoPaths") {
        return [
          {
            tool: "searchRepoPaths",
            ok: true,
            summary: "Found candidate request-flow file",
            candidateFiles: ["src/request-flow.ts"],
          },
        ];
      }
      return [
        {
          tool: "readGithubFiles",
          ok: true,
          summary: "Fetched request flow",
          retrievedFiles: [fetchedFile],
        },
      ];
    },
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => {
      sufficiencyChecks += 1;
      return {
        enough: true,
        reason: "Source file retrieved",
        confidence: "high",
        nextToolCalls: [],
      };
    },
    answerWithObservations: async ({ observations, retrievedFiles }) => {
      assert.strictEqual(observations.length, 2);
      assert.deepStrictEqual(retrievedFiles, [fetchedFile]);
      return createAnswer("grounded answer");
    },
    onProgress: async (progress) => {
      events.push(progress.stage);
    },
  });

  assert.strictEqual(result.answer, "grounded answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, [fetchedFile]);
  assert.strictEqual(sufficiencyChecks, 0);
  assert.deepStrictEqual(executed, ["searchRepoPaths", "readGithubFiles"]);
  assert.deepStrictEqual(events, [
    "understanding-intent",
    "searching-files",
    "searching-files",
    "drafting-answer",
  ]);
});

test("generic agent loop falls back when sufficiency never becomes true within budget", async () => {
  const payload = createPayload();
  let sufficiencyChecks = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "debugging",
      reason: "Need source",
      confidence: "medium",
      toolCalls: [{ tool: "searchRepoPaths", args: { query: "bug" } }],
    }),
    executeToolCalls: async (): Promise<AgentObservation[]> => [
      {
        tool: "searchRepoPaths",
        ok: true,
        summary: "No decisive candidates",
        candidateFiles: [],
      },
    ],
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => {
      sufficiencyChecks += 1;
      return {
        enough: false,
        reason: "Still need context",
        confidence: "low",
        nextToolCalls: [
          { tool: "searchRepoPaths", args: { query: `bug-${sufficiencyChecks}` } },
        ],
      };
    },
    answerWithObservations: async () => {
      throw new Error("should not draft final answer when loop is insufficient");
    },
  });

  assert.strictEqual(result.source, "fallback");
  assert.strictEqual(result.confidence, "low");
  assert.strictEqual(result.retrievalMode, "summary-only");
  assert.match(result.answer, /did not retrieve enough code evidence/);
  assert.doesNotMatch(result.answer, /timed out/);
  assert.strictEqual(sufficiencyChecks, 3);
});

test("generic agent loop drafts from fetched observations after local coverage checks without sufficiency LLM", async () => {
  const payload = createPayload();
  const executed: string[] = [];
  const fetchedFile: RetrievedFileContext = {
    filePath: "src/memory-store.ts",
    branch: "main",
    status: "fetched",
    snippet: "export function saveMemory() {}",
  };

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "architecture",
      reason: "Need source",
      confidence: "high",
      toolCalls: [{ tool: "readGithubFiles", args: { paths: ["src/memory-store.ts"] } }],
    }),
    executeToolCalls: async (_payload, calls): Promise<AgentObservation[]> => {
      executed.push(calls.map((call) => call.tool).join("+"));
      if (calls[0].tool === "readGithubFiles") {
        return [
          {
            tool: "readGithubFiles",
            ok: true,
            summary: "Fetched memory store",
            retrievedFiles: [fetchedFile],
          },
        ];
      }
      assert.deepStrictEqual(calls.map((call) => call.tool), ["buildCodeIndex", "expandImports"]);
      return [
        {
          tool: "buildCodeIndex",
          ok: true,
          summary: "Indexed memory store",
          codeIndex: {
            files: [
              {
                filePath: "src/memory-store.ts",
                language: "ts",
                status: "indexed",
                imports: [],
                exports: [],
                symbols: [],
              },
            ],
            dependencies: [],
          },
        },
        {
          tool: "expandImports",
          ok: true,
          summary: "No import candidates",
          candidateFiles: [],
        },
      ];
    },
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => ({
      enough: false,
      reason: "Need more implementation details",
      confidence: "low",
      nextToolCalls: [],
    }),
    answerWithObservations: async ({ retrievedFiles, sufficient }) => {
      assert.deepStrictEqual(retrievedFiles, [fetchedFile]);
      assert.strictEqual(sufficient.enough, true);
      return createAnswer("partial but grounded memory answer");
    },
  });

  assert.strictEqual(result.answer, "partial but grounded memory answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, [fetchedFile]);
  assert.deepStrictEqual(executed, ["readGithubFiles", "buildCodeIndex+expandImports"]);
});

test("generic agent loop skips sufficiency LLM after source files are fetched", async () => {
  const payload = createPayload();
  const fetchedFile: RetrievedFileContext = {
    filePath: "src/memory-store.ts",
    branch: "main",
    status: "fetched",
    snippet: "export function saveMemory() {}",
  };
  let sufficiencyChecks = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "architecture",
      reason: "Need source",
      confidence: "high",
      toolCalls: [{ tool: "readGithubFiles", args: { paths: ["src/memory-store.ts"] } }],
    }),
    executeToolCalls: async (): Promise<AgentObservation[]> => [
      {
        tool: "readGithubFiles",
        ok: true,
        summary: "Fetched memory store",
        retrievedFiles: [fetchedFile],
      },
    ],
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => {
      sufficiencyChecks += 1;
      throw new Error("sufficiency should not run after fetched source evidence");
    },
    answerWithObservations: async ({ retrievedFiles, sufficient }) => {
      assert.deepStrictEqual(retrievedFiles, [fetchedFile]);
      assert.strictEqual(sufficient.enough, true);
      assert.match(sufficient.reason, /Fetched source/);
      return createAnswer("source-grounded answer");
    },
  });

  assert.strictEqual(result.answer, "source-grounded answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, [fetchedFile]);
  assert.strictEqual(sufficiencyChecks, 0);
});

test("generic agent loop reads unread candidates before treating fetched source as sufficient", async () => {
  const payload = {
    ...createPayload(),
    question: "How is the memory system designed?",
  };
  const executed: string[] = [];
  const indexFile: RetrievedFileContext = {
    filePath: "src/memory/index.ts",
    branch: "main",
    status: "fetched",
    snippet: "export { MemoryManager } from './manager';",
  };
  const managerFile: RetrievedFileContext = {
    filePath: "src/memory/manager.ts",
    branch: "main",
    status: "fetched",
    snippet: "export class MemoryManager { recall() {} save() {} }",
  };
  let sufficiencyChecks = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "architecture",
      reason: "Need implementation evidence for the memory design.",
      confidence: "high",
      toolCalls: [
        { tool: "searchRepoPaths", args: { query: "memory", maxFiles: 2 } },
        { tool: "readGithubFiles", args: { paths: ["src/memory/index.ts"] } },
      ],
    }),
    executeToolCalls: async (_payload, calls): Promise<AgentObservation[]> => {
      executed.push(calls.map((call) => call.tool).join("+"));
      if (calls.some((call) => call.tool === "searchRepoPaths")) {
        return [
          {
            tool: "searchRepoPaths",
            ok: true,
            summary: "Found memory candidates",
            candidateFiles: ["src/memory/index.ts", "src/memory/manager.ts"],
          },
          {
            tool: "readGithubFiles",
            ok: true,
            summary: "Fetched memory index",
            retrievedFiles: [indexFile],
          },
        ];
      }
      assert.deepStrictEqual(calls, [
        {
          tool: "readGithubFiles",
          args: {
            paths: ["src/memory/manager.ts"],
            reason: "Read remaining candidate files before making code-grounded claims.",
          },
        },
      ]);
      return [
        {
          tool: "readGithubFiles",
          ok: true,
          summary: "Fetched memory manager",
          retrievedFiles: [managerFile],
        },
      ];
    },
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => {
      sufficiencyChecks += 1;
      throw new Error("sufficiency should not run after source coverage is locally sufficient");
    },
    answerWithObservations: async ({ retrievedFiles, sufficient }) => {
      assert.deepStrictEqual(retrievedFiles, [indexFile, managerFile]);
      assert.strictEqual(sufficient.enough, true);
      return createAnswer("grounded memory design answer");
    },
  });

  assert.strictEqual(result.answer, "grounded memory design answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, [indexFile, managerFile]);
  assert.deepStrictEqual(executed, ["searchRepoPaths+readGithubFiles", "readGithubFiles"]);
  assert.strictEqual(sufficiencyChecks, 0);
});

test("generic agent loop reads candidate files before answering architecture questions", async () => {
  const payload = createPayload();
  const executed: string[] = [];
  const fetchedFile: RetrievedFileContext = {
    filePath: "src/memory-store.ts",
    branch: "main",
    status: "fetched",
    snippet: "export function saveMemory() {}",
  };

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "architecture",
      reason: "Need implementation evidence",
      confidence: "high",
      toolCalls: [{ tool: "searchRepoPaths", args: { query: "memory" } }],
    }),
    executeToolCalls: async (_payload, calls): Promise<AgentObservation[]> => {
      executed.push(calls[0].tool);
      if (calls[0].tool === "searchRepoPaths") {
        return [
          {
            tool: "searchRepoPaths",
            ok: true,
            summary: "Found memory candidates",
            candidateFiles: ["src/memory-store.ts"],
          },
        ];
      }
      assert.deepStrictEqual(calls[0].args?.paths, ["src/memory-store.ts"]);
      return [
        {
          tool: "readGithubFiles",
          ok: true,
          summary: "Fetched memory store",
          retrievedFiles: [fetchedFile],
        },
      ];
    },
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => ({
      enough: true,
      reason: "Fallback judge incorrectly treated candidates as enough",
      confidence: "low",
      nextToolCalls: [],
    }),
    answerWithObservations: async ({ retrievedFiles }) => {
      assert.deepStrictEqual(retrievedFiles, [fetchedFile]);
      return createAnswer("memory answer");
    },
  });

  assert.strictEqual(result.answer, "memory answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(executed, ["searchRepoPaths", "readGithubFiles"]);
});

test("generic agent loop forces code evidence when intent only asks for summaries", async () => {
  const payload = {
    ...createPayload(),
    question: "How is the memory system designed?",
  };
  const executed: string[] = [];
  const fetchedFile: RetrievedFileContext = {
    filePath: "src/memory/manager.ts",
    branch: "main",
    status: "fetched",
    snippet: "export class MemoryManager {}",
  };
  let sufficiencyChecks = 0;

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "architecture",
      reason: "The user asks about implementation design.",
      confidence: "high",
      toolCalls: [{ tool: "readSummaries", args: {} }],
    }),
    executeToolCalls: async (_payload, calls): Promise<AgentObservation[]> => {
      executed.push(calls[0].tool);
      if (calls[0].tool === "readSummaries") {
        return [
          {
            tool: "readSummaries",
            ok: true,
            summary: "Read README and source map summaries.",
          },
        ];
      }
      if (calls[0].tool === "searchRepoPaths") {
        return [
          {
            tool: "searchRepoPaths",
            ok: true,
            summary: "Found memory candidates",
            candidateFiles: ["src/memory/manager.ts"],
          },
        ];
      }
      assert.strictEqual(calls[0].tool, "readGithubFiles");
      assert.deepStrictEqual(calls[0].args?.paths, ["src/memory/manager.ts"]);
      return [
        {
          tool: "readGithubFiles",
          ok: true,
          summary: "Fetched memory manager",
          retrievedFiles: [fetchedFile],
        },
      ];
    },
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => {
      sufficiencyChecks += 1;
      return {
        enough: true,
        reason: "Source file retrieved",
        confidence: "high",
        nextToolCalls: [],
      };
    },
    answerWithObservations: async ({ observations, retrievedFiles }) => {
      assert.deepStrictEqual(
        observations.map((observation) => observation.tool),
        ["readSummaries", "searchRepoPaths", "readGithubFiles"],
      );
      assert.deepStrictEqual(retrievedFiles, [fetchedFile]);
      return createAnswer("grounded memory design answer");
    },
  });

  assert.strictEqual(result.answer, "grounded memory design answer");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, [fetchedFile]);
  assert.deepStrictEqual(executed, ["readSummaries", "searchRepoPaths", "readGithubFiles"]);
  assert.strictEqual(sufficiencyChecks, 0);
});

test("generic agent loop allows learning path questions to stay summary-only", async () => {
  const payload = {
    ...createPayload(),
    question: "What should I learn first in this project?",
  };
  const executed: string[] = [];

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "learning-path",
      reason: "The user asks for study guidance.",
      confidence: "medium",
      toolCalls: [{ tool: "readSummaries", args: {} }],
    }),
    executeToolCalls: async (_payload, calls): Promise<AgentObservation[]> => {
      executed.push(calls[0].tool);
      return [
        {
          tool: "readSummaries",
          ok: true,
          summary: "Read README and source map summaries.",
        },
      ];
    },
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => ({
      enough: true,
      reason: "Summaries are enough for a learning path.",
      confidence: "medium",
      nextToolCalls: [],
    }),
    answerWithObservations: async ({ retrievedFiles }) => {
      assert.deepStrictEqual(retrievedFiles, []);
      return createAnswer("learning path answer");
    },
  });

  assert.strictEqual(result.answer, "learning path answer");
  assert.strictEqual(result.retrievalMode, "summary-only");
  assert.deepStrictEqual(result.retrievedFiles, []);
  assert.deepStrictEqual(executed, ["readSummaries"]);
});

test("generic agent loop preserves retrieved files when final observation answer times out", async () => {
  const payload = createPayload();
  const fetchedFile: RetrievedFileContext = {
    filePath: "src/memory-store.ts",
    branch: "main",
    status: "fetched",
    snippet: "export function saveMemory() {}",
  };

  const result = await answerAgentQuestion(payload, {
    planRetriever: async () => ({
      needsCodeContext: false,
      targetFiles: [],
      reason: "legacy unused",
      confidence: "low",
    }),
    fetchFiles: async () => [],
    answerWithSummary: async () => createAnswer("summary answer"),
    answerWithCode: async () => createAnswer("code answer"),
    judgeIntent: async () => ({
      category: "architecture",
      reason: "Need source",
      confidence: "high",
      toolCalls: [{ tool: "readGithubFiles", args: { paths: ["src/memory-store.ts"] } }],
    }),
    executeToolCalls: async (): Promise<AgentObservation[]> => [
      {
        tool: "readGithubFiles",
        ok: true,
        summary: "Fetched memory store",
        retrievedFiles: [fetchedFile],
      },
    ],
    judgeSufficiency: async (): Promise<AgentSufficiencyDecision> => ({
      enough: true,
      reason: "Source retrieved",
      confidence: "high",
      nextToolCalls: [],
    }),
    answerWithObservations: async () => {
      throw new Error("REQUEST_TIMEOUT");
    },
  });

  assert.strictEqual(result.source, "fallback");
  assert.strictEqual(result.retrievalMode, "github-code");
  assert.deepStrictEqual(result.retrievedFiles, [fetchedFile]);
  assert.match(result.answer, /src\/memory-store\.ts/);
  assert.match(result.answer, /saveMemory/);
  assert.doesNotMatch(result.answer, /model timed out|repository summaries|README and source map/i);
  assert.deepStrictEqual(result.evidence, [
    {
      filePath: "src/memory-store.ts",
      lineStart: 1,
      snippet: "export function saveMemory() {}",
      reason: "Fetched source evidence used after final answer timeout.",
    },
  ]);
});
