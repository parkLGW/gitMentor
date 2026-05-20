export interface OllamaChatBodyInput {
  model: string;
  prompt: string;
  maxTokens?: number;
}

export function normalizeMaxTokens(input: unknown): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return undefined;
  }
  return Math.floor(input);
}

export function buildOllamaChatBody(input: OllamaChatBodyInput): Record<string, unknown> {
  const maxTokens = normalizeMaxTokens(input.maxTokens);
  return {
    model: input.model,
    messages: [{ role: "user", content: input.prompt }],
    stream: false,
    ...(maxTokens
      ? {
          options: {
            temperature: 0.3,
            num_predict: maxTokens,
          },
        }
      : {}),
  };
}
