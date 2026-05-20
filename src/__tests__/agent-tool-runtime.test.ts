import assert from "node:assert";
import test from "node:test";

import {
  executeAgentToolCalls,
  expandImports,
  searchRepoPaths,
} from "../services/agent-tool-runtime.js";

import type { AgentToolCall, RetrievedFileContext } from "../types/agent.js";

test("searchRepoPaths prioritizes planner hints and ranked matching repo paths", () => {
  const ranked = searchRepoPaths({
    question: "登录流程里 session 是怎么建立的？",
    sourceMapSummary: "Auth flow uses src/auth/index.ts and src/auth/session.ts",
    repoPaths: [
      "README.md",
      "src/ui/App.tsx",
      "src/auth/index.ts",
      "src/auth/session.ts",
      "src/network/client.ts",
    ],
    preferredPaths: ["src/auth/index.ts"],
    maxFiles: 3,
  });

  assert.deepStrictEqual(ranked, [
    "src/auth/index.ts",
    "src/auth/session.ts",
    "src/network/client.ts",
  ]);
});

test("searchRepoPaths falls back to file paths mentioned in summaries when tree paths are unavailable", () => {
  const ranked = searchRepoPaths({
    question: "How is session memory stored?",
    sourceMapSummary: [
      "src/components/AgentTab.tsx renders the assistant.",
      "src/services/agent-session.ts persists session memory.",
      "src/services/github.ts talks to GitHub.",
    ].join("\n"),
    repoPaths: [],
    maxFiles: 2,
  });

  assert.strictEqual(ranked[0], "src/services/agent-session.ts");
  assert.strictEqual(ranked.length, 2);
  assert.ok(ranked.every((path) => path.startsWith("src/")));
});

test("searchRepoPaths includes stable root files when neither tree nor path hints are available", () => {
  const ranked = searchRepoPaths({
    question: "这个项目的记忆系统是如何设计的",
    readmeSummary: "This repository explains its architecture in the README.",
    sourceMapSummary: "",
    repoPaths: [],
    maxFiles: 3,
  });

  assert.deepStrictEqual(ranked, [
    "README.md",
    "src/components/index.ts",
    "src/index.ts",
  ]);
});

test("searchRepoPaths bridges Chinese technical terms to English implementation paths", () => {
  const ranked = searchRepoPaths({
    question: "本项目的记忆系统是如何设计的",
    repoPaths: [
      "README.md",
      "src/aaa/config.py",
      "src/api/server.py",
      "src/memory/store.py",
      "src/session/history.py",
      "tests/test_memory.py",
    ],
    maxFiles: 4,
  });

  assert.deepStrictEqual(ranked.slice(0, 2), [
    "src/memory/store.py",
    "src/session/history.py",
  ]);
  assert.ok(!ranked.includes("tests/test_memory.py"));
});

test("searchRepoPaths filters uninspectable assets and prioritizes topic source siblings", () => {
  const ranked = searchRepoPaths({
    question: "本项目的记忆系统是如何设计的",
    readmeSummary: "OpenHarness includes persistent memory and session recovery.",
    repoPaths: [
      "assets/ohmo.png",
      "assets/logo.png",
      "LICENSE",
      "README.md",
      "src/openharness/memory/__init__.py",
      "src/openharness/memory/agent.py",
      "src/openharness/memory/manager.py",
      "src/openharness/memory/memdir.py",
      "src/openharness/memory/paths.py",
      "src/openharness/memory/relevance.py",
      "src/openharness/sandbox/session.py",
    ],
    maxFiles: 6,
  });

  assert.deepStrictEqual(ranked.slice(0, 5), [
    "src/openharness/memory/__init__.py",
    "src/openharness/memory/agent.py",
    "src/openharness/memory/manager.py",
    "src/openharness/memory/memdir.py",
    "src/openharness/memory/paths.py",
  ]);
  assert.ok(!ranked.includes("assets/ohmo.png"));
  assert.ok(!ranked.includes("assets/logo.png"));
  assert.ok(!ranked.includes("LICENSE"));
});

test("expandImports resolves alias and relative imports against repo paths", () => {
  const candidates = expandImports({
    fromFile: "src/components/App.tsx",
    imports: [
      { source: "@/services/github" },
      { source: "./Toolbar" },
      { source: "../shared/useThing" },
      { source: "react" },
    ],
    repoPaths: [
      "src/services/github.ts",
      "src/components/Toolbar.tsx",
      "src/shared/useThing.ts",
      "src/shared/useThing/index.ts",
    ],
  });

  assert.deepStrictEqual(candidates, [
    "src/services/github.ts",
    "src/components/Toolbar.tsx",
    "src/shared/useThing.ts",
  ]);
});

test("executeAgentToolCalls reads files, builds an index, and respects file budgets", async () => {
  const calls: AgentToolCall[] = [
    {
      tool: "readGithubFiles",
      args: { paths: ["src/a.ts", "src/b.ts", "src/c.ts"], reason: "Need code" },
    },
    {
      tool: "buildCodeIndex",
      args: {},
    },
  ];
  const fetched: RetrievedFileContext[] = [
    {
      filePath: "src/a.ts",
      status: "fetched",
      snippet: "import { b } from './b'; export function a() { return b(); }",
    },
    {
      filePath: "src/b.ts",
      status: "fetched",
      snippet: "export function b() { return 1; }",
    },
  ];

  const observations = await executeAgentToolCalls(
    {
      payload: {
        repo: { owner: "acme", name: "widgets" },
        language: "en",
        question: "How does it work?",
        recentMessages: [],
      },
      calls,
      repoPaths: ["src/a.ts", "src/b.ts", "src/c.ts"],
      retrievedFiles: [],
      budget: { maxFiles: 2, maxCharsPerFile: 2200 },
    },
    {
      fetchFiles: async (_payload, paths) => {
        assert.deepStrictEqual(paths, ["src/a.ts", "src/b.ts"]);
        return fetched;
      },
    },
  );

  assert.strictEqual(observations.length, 2);
  assert.strictEqual(observations[0].tool, "readGithubFiles");
  assert.deepStrictEqual(observations[0].retrievedFiles, fetched);
  assert.strictEqual(observations[1].tool, "buildCodeIndex");
  assert.strictEqual(observations[1].codeIndex?.files[0].status, "indexed");
});
