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

export interface GithubFileRetrievalRequest {
  owner: string;
  repo: string;
  targetFiles: string[];
  timeoutMs?: number;
  maxFiles?: number;
  maxCharsPerFile?: number;
}

export interface GithubFileRetrievalDependencies {
  getDefaultBranch: (
    owner: string,
    repo: string,
    options?: { timeoutMs?: number }
  ) => Promise<string>;
  getRawFileContent: (
    owner: string,
    repo: string,
    branch: string,
    filePath: string,
    options?: { timeoutMs?: number }
  ) => Promise<string | null>;
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

export function normalizeGithubFilePath(input: string): string {
  return normalizeCandidatePath(input);
}

export function parseRetrievalPlan(input: RetrievalPlanInput): AgentRetrievalPlan {
  const targetFiles = Array.from(
    new Set(
      (input.targetFiles ?? [])
        .map(normalizeCandidatePath)
        .filter(Boolean),
    ),
  ).slice(0, MAX_TARGET_FILES);

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

export async function fetchRetrievedGithubFiles(
  request: GithubFileRetrievalRequest,
  deps: GithubFileRetrievalDependencies
): Promise<RetrievedFileContext[]> {
  let defaultBranch: string | undefined;
  try {
    defaultBranch = await deps.getDefaultBranch(request.owner, request.repo, {
      timeoutMs: request.timeoutMs,
    });
  } catch {
    defaultBranch = undefined;
  }

  const branchCandidates = resolveBranchCandidates(defaultBranch);
  const maxFiles = request.maxFiles ?? MAX_TARGET_FILES;
  const maxCharsPerFile = request.maxCharsPerFile ?? Number.POSITIVE_INFINITY;

  const retrievedFiles = await Promise.all(
    request.targetFiles.slice(0, maxFiles).map(async (filePath) => {
      for (const branch of branchCandidates) {
        const content = await deps.getRawFileContent(
          request.owner,
          request.repo,
          branch,
          filePath,
          { timeoutMs: request.timeoutMs }
        );
        if (!content) {
          continue;
        }

        const truncated = truncateFileForPrompt(filePath, content, maxCharsPerFile);
        return {
          filePath,
          branch,
          status: "fetched" as const,
          snippet: truncated.prompt,
        };
      }

      return {
        filePath,
        status: "failed" as const,
        reason: "content_unavailable",
      };
    })
  );

  return buildRetrievedFileEvidence(retrievedFiles);
}

export function resolveBranchCandidates(defaultBranch?: string): string[] {
  const candidates: string[] = [];

  const pushUnique = (branch: string | undefined) => {
    const value = branch?.trim();
    if (!value) return;
    if (candidates.includes(value)) return;
    candidates.push(value);
  };

  pushUnique(defaultBranch);
  pushUnique("main");
  pushUnique("master");

  return candidates;
}

export function buildRawGithubUrl(
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): string {
  const normalized = normalizeGithubFilePath(filePath);
  if (!normalized) return "";

  const encodedPath = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://raw.githubusercontent.com/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
}

export interface PromptTruncationResult {
  prompt: string;
  snippet: string;
  wasTruncated: boolean;
}

const TRUNCATION_MARKER = "\n\n... [TRUNCATED FOR PROMPT] ...\n\n";
const DEFAULT_SNIPPET_LIMIT = 260;

export function truncateFileForPrompt(
  filePath: string,
  content: string,
  maxChars: number
): PromptTruncationResult {
  const max = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  const header = `File: ${filePath}\n`;

  if (max <= header.length) {
    const prompt = header.slice(0, max);
    return {
      prompt,
      snippet: prompt.slice(0, DEFAULT_SNIPPET_LIMIT),
      wasTruncated: content.length > 0,
    };
  }

  const available = max - header.length;
  if (content.length <= available) {
    return {
      prompt: header + content,
      snippet: content.slice(0, DEFAULT_SNIPPET_LIMIT),
      wasTruncated: false,
    };
  }

  const marker = TRUNCATION_MARKER;
  if (available <= marker.length + 2) {
    const prompt = header + marker.slice(0, available);
    return {
      prompt,
      snippet: prompt.slice(0, DEFAULT_SNIPPET_LIMIT),
      wasTruncated: true,
    };
  }

  const remainingForContent = available - marker.length;
  let headLen = Math.ceil(remainingForContent / 2);
  let tailLen = Math.floor(remainingForContent / 2);
  if (headLen <= 0) headLen = 1;
  if (tailLen <= 0) tailLen = 1;

  const head = content.slice(0, headLen);
  const tail = content.slice(Math.max(0, content.length - tailLen));
  const body = head + marker + tail;
  const prompt = header + body;

  return {
    prompt,
    snippet: body.slice(0, DEFAULT_SNIPPET_LIMIT),
    wasTruncated: true,
  };
}
