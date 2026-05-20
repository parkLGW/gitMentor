import assert from "node:assert";
import test from "node:test";

import { buildFileLocalInsight } from "../services/file-insights.js";

test("buildFileLocalInsight extracts Python imports, symbols, metrics, and zh questions", () => {
  const insight = buildFileLocalInsight(
    "src/openharness/memory/paths.py",
    [
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
      "    return get_data_dir() / 'memory'",
      "",
      "def get_memory_entrypoint(cwd: str | Path) -> Path:",
      "    return get_project_memory_dir(cwd) / 'MEMORY.md'",
    ].join("\n"),
    "zh",
  );

  assert.strictEqual(insight.fileName, "paths.py");
  assert.strictEqual(insight.languageLabel, "Python");
  assert.strictEqual(insight.totalLines, 14);
  assert.ok(insight.loc >= 8);
  assert.deepStrictEqual(
    insight.imports.map((item) => item.source),
    ["__future__", "hashlib", "pathlib", "openharness.config.paths"],
  );
  assert.deepStrictEqual(
    insight.symbols.map((item) => `${item.kind}:${item.name}:${item.lineStart}`),
    ["function:get_project_memory_dir:8", "function:get_memory_entrypoint:13"],
  );
  assert.ok(insight.quickQuestions.some((item) => item.includes("实现原理")));
  assert.ok(insight.quickQuestions.some((item) => item.includes("memory")));
});

test("buildFileLocalInsight extracts TSX imports, component, hook, type, and todos", () => {
  const insight = buildFileLocalInsight(
    "src/components/AgentPanel.tsx",
    [
      "import React from 'react';",
      "import { useAgentSession } from '@/hooks/useAgentSession';",
      "",
      "type AgentPanelProps = { repo: string };",
      "",
      "export function AgentPanel(props: AgentPanelProps) {",
      "  // TODO: wire keyboard shortcuts",
      "  return <section>{props.repo}</section>;",
      "}",
      "",
      "export const useAgentPanel = () => null;",
    ].join("\n"),
    "en",
  );

  assert.strictEqual(insight.languageLabel, "TSX");
  assert.strictEqual(insight.todos, 1);
  assert.deepStrictEqual(
    insight.imports.map((item) => item.source),
    ["react", "@/hooks/useAgentSession"],
  );
  assert.deepStrictEqual(
    insight.symbols.map((item) => `${item.kind}:${item.name}:${item.lineStart}`),
    ["type:AgentPanelProps:4", "component:AgentPanel:6", "hook:useAgentPanel:11"],
  );
  assert.ok(insight.quickQuestions.some((item) => item.includes("implementation")));
  assert.ok(insight.quickQuestions.some((item) => item.includes("components")));
});
