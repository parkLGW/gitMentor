import assert from "node:assert";
import test from "node:test";

import {
  parseLooseAgentJson,
  unwrapNestedAgentJson,
} from "../services/agent-response-parser.js";

test("parseLooseAgentJson parses normal JSON responses", () => {
  assert.deepStrictEqual(parseLooseAgentJson('{"answer":"ok","confidence":"high"}'), {
    answer: "ok",
    confidence: "high",
  });
});

test("parseLooseAgentJson extracts answer from truncated JSON responses", () => {
  const parsed = parseLooseAgentJson(`{
    "answer": "记忆系统基于文件系统实现，每个项目有独立目录。",
    "confidence": "high",
    "evidence": [
      {"filePath": "src/openharness/memory/paths.py", "snippet": "def get_project_memory_dir"
  `);

  assert.deepStrictEqual(parsed, {
    answer: "记忆系统基于文件系统实现，每个项目有独立目录。",
    confidence: "high",
  });
});

test("parseLooseAgentJson extracts JSON from markdown fences", () => {
  assert.deepStrictEqual(parseLooseAgentJson('```json\n{"answer":"ok","confidence":"medium"}\n```'), {
    answer: "ok",
    confidence: "medium",
  });
});

test("unwrapNestedAgentJson unwraps JSON string stored in answer", () => {
  const parsed = unwrapNestedAgentJson({
    answer: `{
      "answer": "记忆系统基于文件系统实现。",
      "confidence": "high",
      "evidence": [
        {"filePath": "src/memory/paths.py", "snippet": "def get_project_memory_dir", "reason": "path hashing"}
      ],
      "suggestedNextSteps": ["继续看 manager.py"]
    }`,
    confidence: "low",
  });

  assert.deepStrictEqual(parsed, {
    answer: "记忆系统基于文件系统实现。",
    confidence: "high",
    evidence: [
      {
        filePath: "src/memory/paths.py",
        snippet: "def get_project_memory_dir",
        reason: "path hashing",
      },
    ],
    suggestedNextSteps: ["继续看 manager.py"],
  });
});

test("unwrapNestedAgentJson recovers truncated nested JSON answers", () => {
  const parsed = unwrapNestedAgentJson({
    answer: `{
      "answer": "记忆系统基于文件系统实现。",
      "confidence": "high",
      "evidence": [
        {"filePath": "src/memory/paths.py", "snippet": "def get_project_memory_dir"
    `,
    confidence: "low",
  });

  assert.deepStrictEqual(parsed, {
    answer: "记忆系统基于文件系统实现。",
    confidence: "high",
  });
});
