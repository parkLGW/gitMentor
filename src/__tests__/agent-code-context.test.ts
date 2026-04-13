import assert from "node:assert";
import test from "node:test";

import {
  buildRetrievedFileEvidence,
  normalizeCandidatePath,
  parseRetrievalPlan,
  selectFilesWithinBudget,
} from "../services/agent-code-context.js";

test("parseRetrievalPlan caps target files and normalizes paths", () => {
  const plan = parseRetrievalPlan({
    needsCodeContext: true,
    targetFiles: [
      "./src/features/alpha.ts",
      ".\\src\\widgets\\beta.ts",
      "docs/guide.md",
      "./src/features/gamma.ts",
      "src/utils/helpers.ts",
      "src/extra.ts",
    ],
    reason: "Gather context",
    confidence: "high",
  });

  assert.strictEqual(plan.needsCodeContext, true);
  assert.strictEqual(plan.reason, "Gather context");
  assert.strictEqual(plan.confidence, "high");
  assert.strictEqual(plan.targetFiles.length, 5);
  assert.deepStrictEqual(plan.targetFiles, [
    "src/features/alpha.ts",
    "src/widgets/beta.ts",
    "docs/guide.md",
    "src/features/gamma.ts",
    "src/utils/helpers.ts",
  ]);
});

test("parseRetrievalPlan defaults confidence to low when missing or invalid", () => {
  const missingConfidence = parseRetrievalPlan({
    targetFiles: ["src/index.ts"],
  });
  const invalidConfidence = parseRetrievalPlan({
    targetFiles: ["src/index.ts"],
    confidence: "invalid" as unknown as "low",
  });

  assert.strictEqual(missingConfidence.confidence, "low");
  assert.strictEqual(invalidConfidence.confidence, "low");
});

test("normalizeCandidatePath converts leading ./ and backslashes", () => {
  assert.strictEqual(
    normalizeCandidatePath("./src\\nested\\file.ts"),
    "src/nested/file.ts"
  );
  assert.strictEqual(
    normalizeCandidatePath("`./src\\api/client.ts`,"),
    "src/api/client.ts"
  );
  assert.strictEqual(
    normalizeCandidatePath("///src\\nested\\file.ts"),
    "src/nested/file.ts"
  );
  assert.strictEqual(normalizeCandidatePath(".gitignore"), ".gitignore");
  assert.strictEqual(normalizeCandidatePath("../foo.ts"), "");
  assert.strictEqual(normalizeCandidatePath("'../foo.ts'"), "");
  assert.strictEqual(normalizeCandidatePath("   "), "");
});

test("selectFilesWithinBudget keeps early files and respects budgets", () => {
  const files = [
    { filePath: "first.ts", content: "aaaaaa" },
    { filePath: "second.ts", content: "bbbbbbbbbbbb" },
    { filePath: "third.ts", content: "ccc" },
  ];

  const selected = selectFilesWithinBudget(files, {
    maxFiles: 2,
    maxTotalChars: 8,
    maxCharsPerFile: 5,
  });

  assert.strictEqual(selected.length, 2);
  assert.strictEqual(selected[0].filePath, "first.ts");
  assert.strictEqual(selected[0].content.length, 5);
  assert.strictEqual(selected[1].filePath, "second.ts");
  assert.strictEqual(selected[1].content.length, 3);
  assert.strictEqual(selected[0].content, "aaaaa");
  assert.strictEqual(selected[1].content, "bbb");
});

test("selectFilesWithinBudget skips empty early files without blocking later files", () => {
  const files = [
    { filePath: "empty.ts", content: "" },
    { filePath: "useful.ts", content: "abcde" },
  ];

  const selected = selectFilesWithinBudget(files, {
    maxFiles: 2,
    maxTotalChars: 3,
    maxCharsPerFile: 10,
  });

  assert.deepStrictEqual(selected, [{ filePath: "useful.ts", content: "abc" }]);
});

test("buildRetrievedFileEvidence passthrough caps by max target files", () => {
  const files = [
    { filePath: "src/1.ts", status: "fetched" as const },
    { filePath: "src/2.ts", status: "failed" as const },
    { filePath: "src/3.ts", status: "skipped" as const },
    { filePath: "src/4.ts", status: "fetched" as const },
    { filePath: "src/5.ts", status: "failed" as const },
    { filePath: "src/6.ts", status: "skipped" as const },
  ];

  const evidence = buildRetrievedFileEvidence(files);
  assert.deepStrictEqual(evidence, files.slice(0, 5));
});
