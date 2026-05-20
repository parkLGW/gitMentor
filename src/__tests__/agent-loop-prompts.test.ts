import assert from "node:assert";
import test from "node:test";

import {
  buildAgentFinalAnswerPrompt,
  buildAgentFinalAnswerPromptCompact,
  buildAgentFinalAnswerPromptLite,
  buildAgentIntentPrompt,
  buildAgentSufficiencyPrompt,
  normalizeAgentIntent,
  normalizeAgentSufficiencyDecision,
} from "../services/agent-loop-prompts.js";

import type { AgentChatRequestPayload, AgentObservation } from "../types/agent.js";

function createPayload(): AgentChatRequestPayload {
  return {
    repo: { owner: "acme", name: "widgets" },
    language: "en",
    question: "How does this project work?",
    readmeSummary: "README says this is a widget tool.",
    sourceMapSummary: "Core modules are popup and services.",
    sessionSummary: null,
    recentMessages: [],
  };
}

test("loop prompts frame repository content as untrusted context and list read-only tools", () => {
  const intentPrompt = buildAgentIntentPrompt(createPayload(), "en");
  const finalPrompt = buildAgentFinalAnswerPrompt(
    createPayload(),
    {
      category: "architecture",
      reason: "Need code",
      confidence: "high",
      toolCalls: [],
    },
    [],
    "en",
  );

  assert.match(intentPrompt, /untrusted context/i);
  assert.match(intentPrompt, /readGithubFiles/);
  assert.match(intentPrompt, /expandImports/);
  assert.match(finalPrompt, /Do not cite files that are not present in observations/i);
});

test("normalizeAgentIntent keeps only allowed tools and provides a safe default", () => {
  const intent = normalizeAgentIntent({
    category: "architecture",
    reason: "Need source",
    confidence: "high",
    toolCalls: [
      { tool: "runShell", args: { command: "npm test" } },
      { tool: "readGithubFiles", args: { paths: ["src/App.tsx", "../secret"] } },
    ],
  });

  assert.strictEqual(intent.category, "architecture");
  assert.strictEqual(intent.confidence, "high");
  assert.deepStrictEqual(intent.toolCalls, [
    { tool: "readGithubFiles", args: { paths: ["src/App.tsx"] } },
  ]);

  assert.deepStrictEqual(normalizeAgentIntent(null).toolCalls, [
    { tool: "readSummaries", args: {} },
  ]);
});

test("normalizeAgentSufficiencyDecision caps next tool calls and defaults to not enough", () => {
  const decision = normalizeAgentSufficiencyDecision({
    enough: false,
    reason: "Need implementation files",
    confidence: "medium",
    nextToolCalls: [
      { tool: "searchRepoPaths", args: { query: "entry" } },
      { tool: "readGithubFiles", args: { paths: ["src/main.ts", "src/App.tsx"] } },
      { tool: "buildCodeIndex", args: {} },
      { tool: "expandImports", args: {} },
    ],
  });

  assert.strictEqual(decision.enough, false);
  assert.strictEqual(decision.reason, "Need implementation files");
  assert.strictEqual(decision.confidence, "medium");
  assert.strictEqual(decision.nextToolCalls.length, 3);
});

test("buildAgentSufficiencyPrompt summarizes observations without raw code overload", () => {
  const observations: AgentObservation[] = [
    {
      tool: "readGithubFiles",
      ok: true,
      summary: "Fetched src/App.tsx",
      retrievedFiles: [
        {
          filePath: "src/App.tsx",
          status: "fetched",
          snippet: "x".repeat(1000),
        },
      ],
    },
  ];

  const prompt = buildAgentSufficiencyPrompt(
    createPayload(),
    {
      category: "architecture",
      reason: "Need source",
      confidence: "high",
      toolCalls: [],
    },
    observations,
    "en",
  );

  assert.match(prompt, /src\/App\.tsx/);
  assert.ok(prompt.length < 2500);
});

test("buildAgentFinalAnswerPrompt includes bounded retrieved file snippets", () => {
  const prompt = buildAgentFinalAnswerPrompt(
    createPayload(),
    {
      category: "architecture",
      reason: "Need implementation evidence",
      confidence: "high",
      toolCalls: [],
    },
    [
      {
        tool: "readGithubFiles",
        ok: true,
        summary: "Fetched src/App.tsx",
        retrievedFiles: [
          {
            filePath: "src/App.tsx",
            status: "fetched",
            snippet: "export function App() {\n  return <AgentTab />;\n}",
          },
        ],
      },
    ],
    "en",
  );

  assert.match(prompt, /Code evidence/i);
  assert.match(prompt, /src\/App\.tsx/);
  assert.match(prompt, /return <AgentTab \/>/);
  assert.match(prompt, /2-4 evidence items/i);
  assert.match(prompt, /under 80 characters/i);
});

test("architecture final answer prompt asks for sufficient structure over terse sentences", () => {
  const prompt = buildAgentFinalAnswerPrompt(
    createPayload(),
    {
      category: "architecture",
      reason: "Need implementation evidence",
      confidence: "high",
      toolCalls: [],
    },
    [
      {
        tool: "readGithubFiles",
        ok: true,
        summary: "Fetched src/App.tsx",
        retrievedFiles: [
          {
            filePath: "src/App.tsx",
            status: "fetched",
            snippet: "export function App() {\n  return <AgentTab />;\n}",
          },
        ],
      },
    ],
    "en",
  );

  assert.match(prompt, /core modules/i);
  assert.match(prompt, /data flow/i);
  assert.match(prompt, /uncertainty/i);
  assert.doesNotMatch(prompt, /2-6 concise sentences/i);
});

test("final answer prompt prioritizes relevant fetched code over earlier low-value files", () => {
  const payload: AgentChatRequestPayload = {
    ...createPayload(),
    question: "本项目的记忆系统是如何设计的",
    readmeSummary: "OpenHarness mentions memory as a core component.",
  };
  const observations: AgentObservation[] = [
    {
      tool: "readGithubFiles",
      ok: true,
      summary: "Fetched mixed files",
      retrievedFiles: [
        {
          filePath: "assets/ohmo.png",
          status: "fetched",
          snippet: "\u0000PNG binary data",
        },
        {
          filePath: "README.md",
          status: "fetched",
          snippet: "Memory is a feature.",
        },
        {
          filePath: "src/openharness/memory/agent.py",
          status: "fetched",
          snippet: "class MemoryAgent:\n    def recall(self):\n        return self.manager.recall()",
        },
      ],
    },
  ];

  const prompt = buildAgentFinalAnswerPromptCompact(
    payload,
    {
      category: "architecture",
      reason: "Need memory implementation evidence",
      confidence: "high",
      toolCalls: [],
    },
    observations,
    "zh",
  );

  const evidenceStart = prompt.indexOf("Code evidence:");
  assert.ok(evidenceStart >= 0);
  const evidence = prompt.slice(evidenceStart);
  assert.ok(evidence.indexOf("src/openharness/memory/agent.py") < evidence.indexOf("README.md"));
  assert.doesNotMatch(evidence, /assets\/ohmo\.png/);
  assert.match(evidence, /class MemoryAgent/);
});

test("final answer compact prompts materially reduce evidence size for retries", () => {
  const observations: AgentObservation[] = [
    {
      tool: "readGithubFiles",
      ok: true,
      summary: "Fetched several implementation files",
      retrievedFiles: Array.from({ length: 6 }, (_, index) => ({
        filePath: `src/file-${index}.ts`,
        status: "fetched",
        snippet: `export const value${index} = "${"x".repeat(1200)}";`,
      })),
    },
  ];
  const intent = {
    category: "architecture",
    reason: "Need implementation evidence",
    confidence: "high" as const,
    toolCalls: [],
  };

  const full = buildAgentFinalAnswerPrompt(createPayload(), intent, observations, "en");
  const compact = buildAgentFinalAnswerPromptCompact(createPayload(), intent, observations, "en");
  const lite = buildAgentFinalAnswerPromptLite(createPayload(), intent, observations, "en");

  assert.ok(compact.length < full.length);
  assert.ok(lite.length < compact.length);
  assert.ok(lite.length < 2200);
  assert.match(lite, /src\/file-0\.ts/);
});
