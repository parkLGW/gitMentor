import assert from "node:assert/strict";
import test from "node:test";

import {
  readClaudeMessageStream,
  readOpenAICompatibleStream,
  readOllamaJsonStream,
} from "../services/llm-stream.js";

function createStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
    },
  });
}

test("readOpenAICompatibleStream stitches SSE delta chunks into one answer", async () => {
  const response = createStreamResponse([
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
    "data: [DONE]\n",
  ]);

  const result = await readOpenAICompatibleStream(response);

  assert.equal(result, "Hello");
});

test("readClaudeMessageStream collects text_delta events and ignores others", async () => {
  const response = createStreamResponse([
    'event: ping\n',
    'data: {"type":"ping"}\n',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}\n',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}\n',
  ]);

  const result = await readClaudeMessageStream(response);

  assert.equal(result, "你好");
});

test("readOllamaJsonStream concatenates streamed json lines", async () => {
  const response = createStreamResponse([
    '{"message":{"content":"foo"}}\n',
    '{"message":{"content":"bar"}}\n',
  ]);

  const result = await readOllamaJsonStream(response);

  assert.equal(result, "foobar");
});
