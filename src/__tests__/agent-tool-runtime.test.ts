import assert from "node:assert";
import test from "node:test";

import {
  expandImports,
  extractRepoPathHintsFromText,
} from "../services/agent-tool-runtime.js";

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

test("expandImports follows a barrel re-export pointer to its target file", () => {
  const candidates = expandImports({
    fromFile: "packages/agent/src/index.ts",
    imports: [{ source: "./harness/tools/index" }],
    repoPaths: [
      "packages/agent/src/harness/tools/index.ts",
      "packages/agent/src/other.ts",
    ],
  });

  assert.deepStrictEqual(candidates, ["packages/agent/src/harness/tools/index.ts"]);
});

test("extractRepoPathHintsFromText pulls repo-relative source paths out of prose", () => {
  const hints = extractRepoPathHintsFromText(
    "See src/services/github.ts and also `src/background/service-worker.ts`.",
    undefined,
    "unrelated text without a path",
  );

  assert.deepStrictEqual(hints, [
    "src/services/github.ts",
    "src/background/service-worker.ts",
  ]);
});
