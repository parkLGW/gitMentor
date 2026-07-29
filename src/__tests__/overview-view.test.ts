import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("overview labels fallback content as a preliminary README and GitHub preview", () => {
  const source = readFileSync("src/components/OverviewTab.tsx", "utf8");

  assert.match(source, /基于 README 和 GitHub 数据的初步概览/);
  assert.match(source, /AI 分析完成后会自动替换/);
  assert.match(source, /Preliminary overview based on README and GitHub data/);
});

test("overview invalidates in-flight AI work when readiness is cleared", () => {
  const source = readFileSync("src/components/OverviewTab.tsx", "utf8");

  assert.match(source, /analysisRequestIdRef/);
  assert.match(source, /if \(!llmReady\)[\s\S]*setAiLoading\(false\)/);
  assert.match(source, /analysisRequestIdRef\.current\+\+/);
});
