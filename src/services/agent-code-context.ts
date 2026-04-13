import type { ConfidenceLevel } from "../types/learning.js";
import type { AgentRetrievalPlan, RetrievedFileContext } from "../types/agent.js";

export interface RetrievalPlanInput {
  needsCodeContext?: boolean;
  targetFiles?: string[];
  reason?: string;
  confidence?: ConfidenceLevel;
}

export interface CandidateFileContent {
  filePath: string;
  content: string;
}

export interface SelectionBudget {
  maxFiles?: number;
  maxTotalChars?: number;
  maxCharsPerFile?: number;
}

const MAX_TARGET_FILES = 5;
const WRAPPING_PUNCTUATION = /^[`"'()[\]{}<>,;:!?]+|[`"'()[\]{}<>,;:!?]+$/g;

function toConfidenceLevel(input?: ConfidenceLevel): ConfidenceLevel {
  if (input === "low" || input === "medium" || input === "high") {
    return input;
  }
  return "low";
}

export function normalizeCandidatePath(input: string): string {
  const trimmed = input.trim().replace(WRAPPING_PUNCTUATION, "");
  if (!trimmed) {
    return "";
  }

  const slashesNormalized = trimmed.replace(/\\/g, "/");
  const noRelativePrefix = slashesNormalized.replace(/^(\.\/)+/, "");
  const normalized = noRelativePrefix.replace(/^\/+/, "");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    return "";
  }

  return normalized;
}

export function parseRetrievalPlan(input: RetrievalPlanInput): AgentRetrievalPlan {
  const targetFiles = (input.targetFiles ?? [])
    .map(normalizeCandidatePath)
    .filter(Boolean)
    .slice(0, MAX_TARGET_FILES);

  return {
    needsCodeContext: Boolean(input.needsCodeContext),
    targetFiles,
    reason: input.reason?.trim() ?? "",
    confidence: toConfidenceLevel(input.confidence),
  };
}

export function selectFilesWithinBudget(
  files: CandidateFileContent[],
  limits: SelectionBudget
): CandidateFileContent[] {
  const maxFiles = limits.maxFiles ?? Number.POSITIVE_INFINITY;
  const maxTotalChars = limits.maxTotalChars ?? Number.POSITIVE_INFINITY;
  const maxCharsPerFile = limits.maxCharsPerFile ?? Number.POSITIVE_INFINITY;

  const selected: CandidateFileContent[] = [];
  let usedChars = 0;

  for (const file of files) {
    if (selected.length >= maxFiles || usedChars >= maxTotalChars) {
      break;
    }

    const remaining = maxTotalChars - usedChars;
    const allowedLength = Math.min(file.content.length, maxCharsPerFile, remaining);
    if (allowedLength <= 0) {
      continue;
    }

    selected.push({
      filePath: file.filePath,
      content: file.content.slice(0, allowedLength),
    });
    usedChars += allowedLength;
  }

  return selected;
}

export function buildRetrievedFileEvidence(
  files: RetrievedFileContext[]
): RetrievedFileContext[] {
  return files.slice(0, MAX_TARGET_FILES);
}
