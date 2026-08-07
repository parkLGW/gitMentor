import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyUnparseableResponse,
  compactRetryInstruction,
  describeReasoningOnlyResponse,
  describeUnparseableResponse,
  looksLikeDeepAnalysis,
} from "../services/deep-analysis-response.js";
import { parseLooseJson } from "../services/llm-json.js";

test("looksLikeDeepAnalysis accepts the requested shape, bare or wrapped", () => {
  assert.equal(looksLikeDeepAnalysis({ role: "entry point", summary: "s" }), true);
  assert.equal(looksLikeDeepAnalysis({ confidence: "high" }), true);
  assert.equal(
    looksLikeDeepAnalysis({ analysis: { summary: "s", components: [] } }),
    true,
  );
});

test("looksLikeDeepAnalysis rejects the inner fragment a truncated reply parses into", () => {
  // parseLooseJson scans for any balanced object, so a reply cut off mid-array
  // yields a lone component entry that would otherwise be padded into an
  // analysis that merely looks empty
  const truncated = '{"role":"a","components":[{"name":"x","type":"function"},';
  const parsed = parseLooseJson(truncated);

  assert.notEqual(parsed, null, "the loose parser does recover something here");
  assert.equal(looksLikeDeepAnalysis(parsed), false);

  assert.equal(looksLikeDeepAnalysis(null), false);
  assert.equal(looksLikeDeepAnalysis("string"), false);
  assert.equal(looksLikeDeepAnalysis([{ role: "a" }]), false);
  assert.equal(looksLikeDeepAnalysis({ name: "x", type: "function" }), false);
});

test("no failure message points at a setting the UI does not have", () => {
  // maxTokens exists on the config type but nothing in the UI ever writes it, so
  // telling the reader to raise it is advice they cannot act on
  const messages = [
    describeUnparseableResponse("   ", "zh"),
    describeUnparseableResponse("   ", "en"),
    describeUnparseableResponse("I cannot.", "zh"),
    describeUnparseableResponse('{"a":"b', "zh"),
    describeUnparseableResponse('{"a":"b', "en"),
    describeUnparseableResponse("{,}", "zh"),
    describeReasoningOnlyResponse("zh"),
    describeReasoningOnlyResponse("en"),
  ];

  for (const message of messages) {
    assert.doesNotMatch(message, /设置里调大|maximum output length in settings/);
  }
});

test("describeReasoningOnlyResponse names the actual remedy", () => {
  assert.match(describeReasoningOnlyResponse("zh"), /非推理模型/);
  assert.match(describeReasoningOnlyResponse("en"), /non-reasoning model/i);
});

test("describeUnparseableResponse separates empty, prose, truncated, and malformed", () => {
  assert.match(describeUnparseableResponse("   ", "en"), /no content at all/i);
  assert.match(
    describeUnparseableResponse("I cannot analyze this file.", "en"),
    /prose instead of JSON/i,
  );
  assert.match(
    describeUnparseableResponse('{"role":"entry","summary":"the file inj', "en"),
    /cut off by the length limit/i,
  );
  assert.match(
    describeUnparseableResponse('{"role":,}', "en"),
    /Could not parse the JSON/i,
  );
});

test("describeUnparseableResponse is localised", () => {
  assert.match(describeUnparseableResponse("   ", "zh"), /没有返回任何内容/);
  assert.match(describeUnparseableResponse('{"role":"a', "zh"), /截断/);
});

test("classifyUnparseableResponse separates the four failure shapes", () => {
  assert.equal(classifyUnparseableResponse("   "), "empty");
  assert.equal(classifyUnparseableResponse("I cannot analyze this."), "prose");
  assert.equal(classifyUnparseableResponse('{"role":"a","summary":"the fi'), "truncated");
  assert.equal(classifyUnparseableResponse('{"role":,}'), "malformed");
  assert.equal(classifyUnparseableResponse('```json\n{"role":"a"}\n```'), "malformed");
});

test("compactRetryInstruction asks for a smaller object in both languages", () => {
  assert.match(compactRetryInstruction("en"), /compact but complete JSON/i);
  assert.match(compactRetryInstruction("zh"), /截断/);
});

test("deep file analysis treats its token budget as a floor, not a cap", () => {
  const source = readFileSync("src/background/service-worker.ts", "utf8");

  // It previously fell through to callLLM's 420-token default while asking for
  // role, summary, workflow, components, designNotes, dependencies, evidence
  // and suggestions, so the reply was routinely cut off mid-object
  const budget = source.match(/const DEEP_ANALYSIS_MIN_TOKENS = (\d+)/);
  assert.ok(budget, "expected an explicit deep-analysis token floor");
  assert.ok(Number(budget[1]) >= 1500, `floor too small: ${budget[1]}`);
  // Older models still enforce a 4096-token output cap, so the first attempt has
  // to stay under it rather than risk an API rejection
  assert.ok(Number(budget[1]) <= 4096, `floor risks rejection: ${budget[1]}`);

  // A reasoning model that spends the whole budget thinking is re-asked with
  // real room instead of being reported as a parse failure
  assert.match(source, /const REASONING_ONLY_ERROR = 'LLM_REASONING_ONLY'/);
  assert.match(source, /DEEP_ANALYSIS_REASONING_TOKENS/);
  assert.match(source, /describeReasoningOnlyResponse\(lang\)/);
  // Chain-of-thought text must never be handed back as if it were the answer
  assert.doesNotMatch(source, /return value\s*\n?\s*\}\s*\n\s*return ''/);

  // callLLM treats an explicit maxTokens as an override, so a user who
  // configured a larger budget must not be silently capped back down
  assert.match(source, /configured > DEEP_ANALYSIS_MIN_TOKENS/);
  assert.match(source, /classifyUnparseableResponse\(response\) === 'truncated'/);
  assert.match(source, /compactRetryInstruction\(lang\)/);
});
