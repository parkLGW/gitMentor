import assert from "node:assert";
import test from "node:test";

import { buildCodeIndex } from "../services/agent-code-index.js";

import type { RetrievedFileContext } from "../types/agent.js";

test("buildCodeIndex extracts imports, exports, symbols, and dependencies from TSX", () => {
  const files: RetrievedFileContext[] = [
    {
      filePath: "src/components/App.tsx",
      status: "fetched",
      snippet: `
import React from "react";
import { useRepo } from "../hooks/useRepo";
import * as github from "@/services/github";
import "../setup";

type AppProps = { title: string };
interface ViewModel { name: string }

export function App(props: AppProps) {
  const repo = useRepo();
  return <main>{props.title}{repo?.name}</main>;
}

export const useLocalState = () => {
  return github;
};
`,
    },
  ];

  const index = buildCodeIndex(files);
  const app = index.files[0];

  assert.strictEqual(app.status, "indexed");
  assert.deepStrictEqual(
    app.imports.map((item) => ({
      source: item.source,
      imported: item.imported,
      kind: item.kind,
    })),
    [
      { source: "react", imported: ["React"], kind: "default" },
      { source: "../hooks/useRepo", imported: ["useRepo"], kind: "named" },
      { source: "@/services/github", imported: ["github"], kind: "namespace" },
      { source: "../setup", imported: [], kind: "side-effect" },
    ],
  );
  assert.deepStrictEqual(
    app.exports.map((item) => ({ name: item.name, kind: item.kind })),
    [
      { name: "App", kind: "function" },
      { name: "useLocalState", kind: "const" },
    ],
  );
  assert.ok(app.symbols.some((item) => item.name === "App" && item.kind === "component"));
  assert.ok(app.symbols.some((item) => item.name === "useLocalState" && item.kind === "hook"));
  assert.ok(app.symbols.some((item) => item.name === "AppProps" && item.kind === "type"));
  assert.ok(app.symbols.some((item) => item.name === "ViewModel" && item.kind === "interface"));
  assert.deepStrictEqual(index.dependencies, [
    { from: "src/components/App.tsx", source: "react" },
    { from: "src/components/App.tsx", source: "../hooks/useRepo" },
    { from: "src/components/App.tsx", source: "@/services/github" },
    { from: "src/components/App.tsx", source: "../setup" },
  ]);
});

test("buildCodeIndex marks unsupported or invalid files as failed without throwing", () => {
  const index = buildCodeIndex([
    {
      filePath: "src/broken.ts",
      status: "fetched",
      snippet: "export function () {",
    },
    {
      filePath: "README.md",
      status: "fetched",
      snippet: "# docs",
    },
  ]);

  assert.strictEqual(index.files[0].status, "failed");
  assert.match(index.files[0].error || "", /parse/i);
  assert.strictEqual(index.files[1].status, "failed");
  assert.match(index.files[1].error || "", /unsupported/i);
});
