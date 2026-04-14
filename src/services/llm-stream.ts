function extractSsePayloads(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split("\n");
  return {
    lines: lines.slice(0, -1),
    rest: lines[lines.length - 1] || "",
  };
}

async function readStreamChunks(
  response: Response,
  onLine: (line: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = extractSsePayloads(buffer);
    buffer = parsed.rest;

    for (const line of parsed.lines) {
      onLine(line);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    onLine(tail);
  }
}

export async function readOpenAICompatibleStream(response: Response): Promise<string> {
  let content = "";

  await readStreamChunks(response, (line) => {
    if (!line.startsWith("data: ")) return;

    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") return;

    try {
      const data = JSON.parse(payload);
      const chunk = data.choices?.[0]?.delta?.content;
      if (typeof chunk === "string") {
        content += chunk;
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  });

  return content;
}

export async function readClaudeMessageStream(response: Response): Promise<string> {
  let content = "";

  await readStreamChunks(response, (line) => {
    if (!line.startsWith("data: ")) return;

    const payload = line.slice(6).trim();
    if (!payload) return;

    try {
      const data = JSON.parse(payload);
      if (data.type !== "content_block_delta" || data.delta?.type !== "text_delta") {
        return;
      }

      const chunk = data.delta?.text;
      if (typeof chunk === "string") {
        content += chunk;
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  });

  return content;
}

export async function readOllamaJsonStream(response: Response): Promise<string> {
  let content = "";

  await readStreamChunks(response, (line) => {
    const payload = line.trim();
    if (!payload) return;

    try {
      const data = JSON.parse(payload);
      const chunk = data.message?.content ?? data.response;
      if (typeof chunk === "string") {
        content += chunk;
      }
    } catch {
      // Ignore malformed json lines.
    }
  });

  return content;
}
