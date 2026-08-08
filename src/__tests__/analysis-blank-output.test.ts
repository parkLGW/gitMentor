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

function installProvider(response: LLMResponse): void {
  Reflect.set(llmManager, "currentProvider", {
    isConfigured: () => true,
    complete: async () => response,
  });
}

test("project analysis reports the exhausted output budget instead of a JSON error", async () => {
  installProvider({ content: "", finishReason: "length", model: "deepseek-v4-flash" });

  await assert.rejects(
    AIAnalysisService.analyzeProject("project", "readme", "en"),
    /output limit.*reasoning|reasoning.*output limit/i,
  );
});

test("project analysis reports the exhausted output budget in Chinese", async () => {
  installProvider({ content: "", finishReason: "length", model: "deepseek-v4-flash" });

  await assert.rejects(
    AIAnalysisService.analyzeProject("project", "readme", "zh"),
    /思考/,
  );
});

test("a blank answer that was not truncated is reported as an empty response", async () => {
  installProvider({ content: "   ", finishReason: "stop", model: "deepseek-v4-flash" });

  await assert.rejects(
    AIAnalysisService.analyzeProject("project", "readme", "en"),
    /empty response/i,
  );
});

test("source map and file analysis surface the same blank-output error", async () => {
  installProvider({ content: "", finishReason: "length", model: "deepseek-v4-flash" });

  await assert.rejects(
    AIAnalysisService.generateSourceMap("project", "tree", undefined, "en"),
    /output limit/i,
  );
  await assert.rejects(
    AIAnalysisService.analyzeFile("index.ts", "const a = 1", "en"),
    /output limit/i,
  );
});

test("project analysis reports a cut-off answer instead of blaming the JSON parser", async () => {
  // The exact shape that reached safeParseJSON in the field: an opening fence,
  // real content, and nothing closing either the fence or the braces.
  installProvider({
    content: "```json\n{\n  \"coreValue\": \"一个视频分镜工具\",\n  \"useCases\": [\"把长视频切成",
    finishReason: "length",
    model: "deepseek-v4-flash",
  });

  await assert.rejects(
    AIAnalysisService.analyzeProject("project", "readme", "en"),
    (error: Error) =>
      /out of room|truncat/i.test(error.message) && !/Invalid JSON format/.test(error.message),
  );
});

test("a cut-off answer is reported in Chinese too", async () => {
  installProvider({
    content: "```json\n{\"coreValue\": \"半截",
    finishReason: "length",
    model: "deepseek-v4-flash",
  });

  await assert.rejects(
    AIAnalysisService.analyzeProject("project", "readme", "zh"),
    (error: Error) => /截断/.test(error.message) && !/Invalid JSON format/.test(error.message),
  );
});

test("quick start still reports truncation of a partial answer, not a blank one", async () => {
  installProvider({ content: "{\"prerequisites\":[", finishReason: "length", model: "fixture" });

  await assert.rejects(
    AIAnalysisService.generateQuickStart("project", "readme", undefined, "en"),
    /AI output was truncated/i,
  );
});
