import assert from "node:assert/strict";
import test from "node:test";

import { analyzeReadme } from "../services/analysis.js";

test("overview preview removes inline Markdown from the README introduction", () => {
  const result = analyzeReadme(`
# Codex Security

\`@openai/codex-security\` is a **CLI** and [TypeScript SDK](https://example.com) for finding vulnerabilities.
`);

  assert.equal(
    result.coreValue,
    "@openai/codex-security is a CLI and TypeScript SDK for finding vulnerabilities.",
  );
});

test("overview preview does not invent generic problems or use cases", () => {
  const result = analyzeReadme(`
# TOML Reader

A focused utility for parsing TOML files reliably.
`);

  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.useCases, []);
});

test("overview preview skips leading badge rows when choosing the introduction", () => {
  const result = analyzeReadme(`
# Widget

![Build Status](https://img.shields.io/build.svg) ![Coverage](https://img.shields.io/coverage.svg) ![npm](https://img.shields.io/npm.svg)

Widget is a focused library for validating release artifacts before publication.
`);

  assert.equal(
    result.coreValue,
    "Widget is a focused library for validating release artifacts before publication.",
  );
});

test("overview preview leaves core value empty when README has only a title and badges", () => {
  const result = analyzeReadme(`
# Widget

![Build Status](https://img.shields.io/build.svg) ![Coverage](https://img.shields.io/coverage.svg)
`);

  assert.equal(result.coreValue, "");
});
