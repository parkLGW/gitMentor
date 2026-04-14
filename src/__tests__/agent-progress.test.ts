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

test("buildAgentProgressText renders drafting stage text", () => {
  assert.strictEqual(
    buildAgentProgressText({ stage: "drafting-answer" }, "zh"),
    "正在整理答案",
  );
});
