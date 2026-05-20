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
