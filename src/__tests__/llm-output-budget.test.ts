import assert from "node:assert/strict";
import test from "node:test";

import {
  clearReasoningBudgetMemory,
  isBlankCompletion,
  isOutputBudgetRejection,
  isUnusableCompletion,
  rememberBudgetExhausted,
  rememberBudgetCeiling,
  reasoningRetryBudget,
  reducedOutputBudget,
  startingOutputBudget,
} from "../services/llm-output-budget.js";

test("a completion with no visible text is blank whatever whitespace it carries", () => {
  assert.equal(isBlankCompletion(""), true);
  assert.equal(isBlankCompletion("   \n\t "), true);
  assert.equal(isBlankCompletion(undefined), true);
  assert.equal(isBlankCompletion("{\"partial\":true"), false);
});

test("an answer cut off mid-sentence is as unusable as no answer at all", () => {
  // Half a JSON object never parses, so it is the same budget failure as a
  // blank one and needs the same larger retry.
  assert.equal(isUnusableCompletion("```json\n{\"coreValue\":\"half", "length"), true);
  assert.equal(isUnusableCompletion("", "length"), true);
  assert.equal(isUnusableCompletion("   ", "stop"), true);
  assert.equal(isUnusableCompletion("{\"ok\":true}", "stop"), false);
  assert.equal(isUnusableCompletion("{\"ok\":true}", undefined), false);
});

test("retry budget leaves room for hidden reasoning plus the answer", () => {
  assert.equal(reasoningRetryBudget(2000), 32000);
  assert.equal(reasoningRetryBudget(360), 32000);
  assert.equal(reasoningRetryBudget(12000), 48000);
});

test("retry budget stops at the largest output limit worth attempting", () => {
  assert.equal(reasoningRetryBudget(32000), 64000);
});

test("retry budget is null when it could not grow, so no identical call is wasted", () => {
  assert.equal(reasoningRetryBudget(64000), null);
  assert.equal(reasoningRetryBudget(128000), null);
});

test("a model known to return blank completions starts at the larger budget", () => {
  clearReasoningBudgetMemory();
  assert.equal(startingOutputBudget("deepseek:deepseek-v4-flash", 2000), 2000);

  rememberBudgetExhausted("deepseek:deepseek-v4-flash");

  assert.equal(startingOutputBudget("deepseek:deepseek-v4-flash", 2000), 32000);
  assert.equal(startingOutputBudget("deepseek:deepseek-chat", 2000), 2000);
  clearReasoningBudgetMemory();
});

test("memory never shrinks a budget the caller asked for", () => {
  clearReasoningBudgetMemory();
  rememberBudgetExhausted("deepseek:deepseek-v4-flash");

  assert.equal(startingOutputBudget("deepseek:deepseek-v4-flash", 64000), 64000);
  clearReasoningBudgetMemory();
});

test("an over-limit rejection is recognized from the provider error", () => {
  assert.equal(
    isOutputBudgetRejection(new Error("max_tokens: must be <= 8192")),
    true,
  );
  assert.equal(
    isOutputBudgetRejection(new Error("Invalid 'max tokens' value for this model")),
    true,
  );
  assert.equal(isOutputBudgetRejection(new Error("Insufficient balance")), false);
  assert.equal(isOutputBudgetRejection(new Error("401 Unauthorized")), false);
});

test("a rejected budget steps down toward what the caller originally asked for", () => {
  assert.equal(reducedOutputBudget(32000, 2000), 8000);
  assert.equal(reducedOutputBudget(8000, 2000), 2000);
  assert.equal(reducedOutputBudget(2000, 2000), null);
  assert.equal(reducedOutputBudget(3000, 2000), 2000);
});

test("a model that rejected a budget never gets offered it again", () => {
  clearReasoningBudgetMemory();
  rememberBudgetExhausted("ollama:qwen3");
  assert.equal(startingOutputBudget("ollama:qwen3", 2000), 32000);

  rememberBudgetCeiling("ollama:qwen3", 8000);

  assert.equal(startingOutputBudget("ollama:qwen3", 2000), 8000);
  clearReasoningBudgetMemory();
});
