import assert from "node:assert/strict";
import test from "node:test";

import { AIAnalysisService } from "../services/ai-analysis.js";
import { llmManager } from "../services/llm.js";
import type { LLMResponse } from "../types/llm.js";

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: () => null,
    setItem: () => undefined,
  },
});

const validGuide = JSON.stringify({
  prerequisites: ["Node.js"],
  steps: [{ title: "Install", description: "Install dependencies", commands: ["pnpm install"] }],
  firstExample: { title: "Run", code: "pnpm dev", explanation: "Starts development" },
  commonMistakes: [],
  nextSteps: "Read the source map",
});

function installProvider(responses: LLMResponse[], prompts: string[]): void {
  Reflect.set(llmManager, "currentProvider", {
    isConfigured: () => true,
    complete: async (prompt: string) => {
      prompts.push(prompt);
      const response = responses.shift();
      if (!response) throw new Error("Unexpected extra completion call");
      return response;
    },
  });
}

test("quick start retries one truncated response with a compact prompt", async () => {
  const prompts: string[] = [];
  installProvider([
    { content: "{\"prerequisites\":[", finishReason: "length", model: "fixture" },
    { content: validGuide, finishReason: "stop", model: "fixture" },
  ], prompts);

  const result = await AIAnalysisService.generateQuickStart("project", "readme", undefined, "en");

  assert.equal(result.steps[0]?.commands?.[0], "pnpm install");
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /compact/i);
});

test("quick start reports truncation explicitly after the compact retry is also truncated", async () => {
  const prompts: string[] = [];
  installProvider([
    { content: "{\"prerequisites\":[", finishReason: "length", model: "fixture" },
    { content: "{\"prerequisites\":[\"Node", finishReason: "length", model: "fixture" },
  ], prompts);

  await assert.rejects(
    AIAnalysisService.generateQuickStart("project", "readme", undefined, "en"),
    /AI output was truncated/i,
  );
  assert.equal(prompts.length, 2);
});

test("quick start accepts valid JSON surrounded by model prose", async () => {
  const prompts: string[] = [];
  installProvider([
    { content: `Here is the guide:\n${validGuide}\nDone.`, finishReason: "stop", model: "fixture" },
  ], prompts);

  const result = await AIAnalysisService.generateQuickStart("project", "readme", undefined, "en");
  assert.equal(result.nextSteps, "Read the source map");
  assert.equal(prompts.length, 1);
});

test("quick start rejects JSON whose nested guide fields are invalid", async () => {
  const prompts: string[] = [];
  installProvider([{
    content: JSON.stringify({
      prerequisites: [1],
      steps: [{}],
      firstExample: {},
      commonMistakes: [null],
      nextSteps: "",
    }),
    finishReason: "stop",
    model: "fixture",
  }], prompts);

  await assert.rejects(
    AIAnalysisService.generateQuickStart("project", "readme", undefined, "en"),
    /Invalid quick start JSON format/,
  );
});
