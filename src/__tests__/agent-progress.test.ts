import assert from "node:assert";
import test from "node:test";

import { buildAgentProgressText } from "../services/agent-progress.js";

test("buildAgentProgressText renders user-facing locating text", () => {
  assert.strictEqual(
    buildAgentProgressText({ stage: "locating-files" }, "zh"),
    "正在定位相关文件",
  );
  assert.strictEqual(
    buildAgentProgressText({ stage: "locating-files" }, "en"),
    "Locating relevant files",
  );
});

test("buildAgentProgressText renders reading progress counts", () => {
  assert.strictEqual(
    buildAgentProgressText(
      { stage: "reading-files", completed: 2, total: 3 },
      "zh",
    ),
    "正在读取相关文件（2/3）",
  );
  assert.strictEqual(
    buildAgentProgressText(
      { stage: "reading-files", completed: 2, total: 3 },
      "en",
    ),
    "Reading relevant files (2/3)",
  );
});

test("buildAgentProgressText appends concise progress notes", () => {
  assert.strictEqual(
    buildAgentProgressText(
      { stage: "drafting-answer", note: "final LLM" },
      "zh",
    ),
    "正在整理答案：final LLM",
  );
});

test("buildAgentProgressText renders drafting stage text", () => {
  assert.strictEqual(
    buildAgentProgressText({ stage: "drafting-answer" }, "zh"),
    "正在整理答案",
  );
});

test("buildAgentProgressText renders generic agent loop stages", () => {
  assert.strictEqual(
    buildAgentProgressText({ stage: "understanding-intent" }, "zh"),
    "正在理解问题意图",
  );
  assert.strictEqual(
    buildAgentProgressText({ stage: "searching-files" }, "en"),
    "Searching repository context",
  );
  assert.strictEqual(
    buildAgentProgressText({ stage: "indexing-code" }, "zh"),
    "正在建立代码索引",
  );
});
