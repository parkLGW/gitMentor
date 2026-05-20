import assert from "node:assert/strict";
import test from "node:test";

import { buildOllamaChatBody } from "../services/llm-request.js";

test("buildOllamaChatBody caps local model output with num_predict", () => {
  const body = buildOllamaChatBody({
    model: "qwen2.5:7b",
    prompt: "Return JSON only.",
    maxTokens: 180,
  });

  assert.deepEqual(body, {
    model: "qwen2.5:7b",
    messages: [{ role: "user", content: "Return JSON only." }],
    stream: false,
    options: {
      temperature: 0.3,
      num_predict: 180,
    },
  });
});
