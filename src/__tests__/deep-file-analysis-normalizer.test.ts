import assert from "node:assert";
import test from "node:test";

import { normalizeDeepFileAnalysisResult } from "../services/deep-file-analysis-normalizer.js";

test("normalizeDeepFileAnalysisResult accepts fileOverview and functions shape", () => {
  const normalized = normalizeDeepFileAnalysisResult(
    {
      fileOverview: "This file builds stable project memory paths.",
      keyTakeaway: "Project paths are hashed so each checkout gets an isolated memory file.",
      codeFlow: [
        {
          step: 1,
          description: "Resolve the current working directory.",
          lineNumber: 3,
          functionName: "get_project_memory_dir",
        },
        {
          step: 2,
          description: "Create and return the memory directory.",
          lineNumber: 4,
          functionName: "get_project_memory_dir",
        },
      ],
      functions: [
        {
          name: "get_project_memory_dir",
          type: "function",
          description: "Builds a deterministic memory directory.",
        },
      ],
      dependencies: ["pathlib", "hashlib"],
      confidence: "medium",
    },
    {
      fileName: "src/openharness/memory/paths.py",
      fileContent: "from pathlib import Path\n\ndef get_project_memory_dir(cwd):\n    return Path(cwd)",
      language: "en",
    },
  );

  assert.strictEqual(normalized.summary, "This file builds stable project memory paths.");
  assert.strictEqual(normalized.role, "This file builds stable project memory paths.");
  assert.deepStrictEqual(normalized.workflow, [
    {
      step: 1,
      description: "Resolve the current working directory.",
      lineNumber: 3,
      functionName: "get_project_memory_dir",
    },
    {
      step: 2,
      description: "Create and return the memory directory.",
      lineNumber: 4,
      functionName: "get_project_memory_dir",
    },
  ]);
  assert.deepStrictEqual(normalized.designNotes, [
    "Project paths are hashed so each checkout gets an isolated memory file.",
  ]);
  assert.deepStrictEqual(normalized.components, [
    {
      name: "get_project_memory_dir",
      type: "function",
      description: "Builds a deterministic memory directory.",
    },
  ]);
  assert.deepStrictEqual(normalized.dependencies, ["pathlib", "hashlib"]);
  assert.strictEqual(normalized.confidence, "medium");
  assert.deepStrictEqual(normalized.evidence, [
    {
      filePath: "src/openharness/memory/paths.py",
      lineStart: 3,
      snippet: "def get_project_memory_dir(cwd):",
      reason: "This is a key function definition that supports the file-entrypoint explanation.",
    },
  ]);
});

test("normalizeDeepFileAnalysisResult accepts nested and Chinese-keyed model output", () => {
  const normalized = normalizeDeepFileAnalysisResult(
    {
      analysis: {
        "摘要": "这个文件负责生成项目级记忆目录和入口文件路径。",
        "组件": [
          {
            "名称": "get_memory_entrypoint",
            "类型": "function",
            "描述": "返回 MEMORY.md 的路径。",
          },
        ],
        "依赖": ["openharness.config.paths"],
        "置信度": "high",
      },
    },
    {
      fileName: "src/openharness/memory/paths.py",
      fileContent: "def get_memory_entrypoint(cwd):\n    return get_project_memory_dir(cwd) / 'MEMORY.md'",
      language: "zh",
    },
  );

  assert.strictEqual(normalized.summary, "这个文件负责生成项目级记忆目录和入口文件路径。");
  assert.strictEqual(normalized.role, "这个文件负责生成项目级记忆目录和入口文件路径。");
  assert.deepStrictEqual(normalized.components, [
    {
      name: "get_memory_entrypoint",
      type: "function",
      description: "返回 MEMORY.md 的路径。",
    },
  ]);
  assert.deepStrictEqual(normalized.dependencies, ["openharness.config.paths"]);
  assert.strictEqual(normalized.confidence, "high");
  assert.strictEqual(normalized.evidence[0].reason, "这是当前文件的关键函数定义，支撑对核心入口的判断。");
});

test("normalizeDeepFileAnalysisResult accepts explicit role workflow and design notes", () => {
  const normalized = normalizeDeepFileAnalysisResult(
    {
      role: "为每个项目生成独立的 MEMORY.md 存储路径。",
      workflow: [
        { step: 1, title: "解析路径", description: "把 cwd 转成绝对路径。", lineNumber: 13 },
        { step: 2, title: "生成目录", description: "创建项目专属 memory 目录。", lineNumber: 15 },
      ],
      designNotes: ["通过路径 hash 避免不同项目共享同一个记忆文件。"],
      components: [
        { name: "get_memory_entrypoint", type: "function", description: "返回 MEMORY.md 路径。" },
      ],
      evidence: [
        {
          filePath: "src/openharness/memory/paths.py",
          lineStart: 22,
          snippet: 'return get_project_memory_dir(cwd) / "MEMORY.md"',
          reason: "说明入口文件固定为 MEMORY.md。",
        },
      ],
      confidence: "high",
    },
    {
      fileName: "src/openharness/memory/paths.py",
      fileContent: "",
      language: "zh",
    },
  );

  assert.strictEqual(normalized.role, "为每个项目生成独立的 MEMORY.md 存储路径。");
  assert.deepStrictEqual(normalized.workflow, [
    { step: 1, title: "解析路径", description: "把 cwd 转成绝对路径。", lineNumber: 13 },
    { step: 2, title: "生成目录", description: "创建项目专属 memory 目录。", lineNumber: 15 },
  ]);
  assert.deepStrictEqual(normalized.designNotes, ["通过路径 hash 避免不同项目共享同一个记忆文件。"]);
  assert.strictEqual(normalized.confidence, "high");
});

test("normalizeDeepFileAnalysisResult enriches shallow model output with source-derived learning fields", () => {
  const normalized = normalizeDeepFileAnalysisResult(
    {
      summary: "Resolves the current working directory to an absolute path and computes a SHA1 hash digest.",
      confidence: "medium",
    },
    {
      fileName: "src/openharness/memory/paths.py",
      fileContent: [
        '"""Paths for persistent project memory."""',
        "",
        "from __future__ import annotations",
        "from hashlib import sha1",
        "from pathlib import Path",
        "from openharness.config.paths import get_data_dir",
        "",
        "def get_project_memory_dir(cwd: str | Path) -> Path:",
        '    """Return the persistent memory directory for a project."""',
        "    path = Path(cwd).resolve()",
        "    digest = sha1(str(path).encode()).hexdigest()[:12]",
        "    return get_data_dir() / 'memory' / digest",
        "",
        "def get_memory_entrypoint(cwd: str | Path) -> Path:",
        "    return get_project_memory_dir(cwd) / 'MEMORY.md'",
      ].join("\n"),
      language: "zh",
    },
  );

  assert.match(normalized.role || "", /memory/);
  assert.match(normalized.role || "", /get_project_memory_dir/);
  assert.ok(normalized.components.some((item) => item.name === "get_project_memory_dir"));
  assert.ok(normalized.components.some((item) => item.name === "get_memory_entrypoint"));
  assert.ok((normalized.workflow || []).length >= 3);
  assert.ok((normalized.workflow || []).some((item) => item.description.includes("return get_data_dir")));
  assert.ok((normalized.designNotes || []).some((item) => item.includes("路径") || item.includes("项目")));
  assert.deepStrictEqual(normalized.dependencies, ["__future__", "hashlib", "pathlib", "openharness.config.paths"]);
  assert.ok(normalized.evidence.some((item) => item.reason.includes("关键函数定义")));
});
