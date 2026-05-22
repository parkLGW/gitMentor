import type { ConfidenceLevel } from "../types/learning.js";

function parseJsonStringLiteral(input: string): string {
  try {
    return JSON.parse(`"${input}"`);
  } catch {
    return input
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, "\t");
  }
}

function extractStringProperty(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!match) return undefined;
  return parseJsonStringLiteral(match[1]).trim();
}

function extractConfidence(text: string): ConfidenceLevel | undefined {
  const value = extractStringProperty(text, "confidence")?.toLowerCase();
  if (value === "high" || value === "medium" || value === "low") return value;
  return undefined;
}

function cleanupJson(text: string): string {
  return text
    .trim()
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return undefined;
}

function firstArray(value: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const item = value[key];
    if (Array.isArray(item)) return item;
  }
  return undefined;
}

function looksLikeAgentJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("{") ||
    trimmed.startsWith("```") ||
    /"answer"\s*:/.test(trimmed)
  );
}

export function unwrapNestedAgentJson(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;

  const answerText = typeof raw.answer === "string" ? raw.answer.trim() : "";
  if (!answerText || !looksLikeAgentJson(answerText)) return raw;

  const nested = parseLooseAgentJson(answerText);
  if (!nested || typeof nested.answer !== "string") return raw;

  const nestedAnswer = nested.answer.trim();
  if (!nestedAnswer || nestedAnswer === answerText) return raw;

  const unwrapped: Record<string, unknown> = {
    ...raw,
    ...nested,
    confidence: nested.confidence ?? raw.confidence,
  };

  const evidence = Array.isArray(nested.evidence) ? nested.evidence : raw.evidence;
  if (evidence !== undefined) unwrapped.evidence = evidence;

  const suggestedNextSteps = Array.isArray(nested.suggestedNextSteps)
    ? nested.suggestedNextSteps
    : raw.suggestedNextSteps;
  if (suggestedNextSteps !== undefined) unwrapped.suggestedNextSteps = suggestedNextSteps;

  return unwrapped;
}

export function normalizeAgentJsonFields(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;

  const normalized: Record<string, unknown> = { ...raw };
  const answer = firstString(raw, ["answer", "答案", "回答", "response"]);
  if (answer) normalized.answer = answer;

  const confidence = firstString(raw, ["confidence", "置信度"]);
  if (confidence) normalized.confidence = confidence;

  const evidence = firstArray(raw, ["evidence", "证据"]);
  if (evidence) normalized.evidence = evidence;

  const suggestedNextSteps = firstArray(raw, [
    "suggestedNextSteps",
    "suggestions",
    "nextSteps",
    "下一步建议",
    "建议",
  ]);
  if (suggestedNextSteps) normalized.suggestedNextSteps = suggestedNextSteps;

  return normalized;
}

export function parseLooseAgentJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(cleanupJson(trimmed));
  } catch {
    // Continue with markdown and partial-JSON recovery.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(cleanupJson(fenced[1]));
    } catch {
      // Continue with partial-JSON recovery below.
    }
  }

  const answer = extractStringProperty(trimmed, "answer");
  if (!answer) return null;

  return {
    answer,
    confidence: extractConfidence(trimmed),
  };
}
