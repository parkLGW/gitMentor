import type { ConfidenceLevel } from "../types/learning.js";
import type {
  AgentProgressEvent,
  AgentRetrievalPlan,
  RetrievedFileContext,
} from "../types/agent.js";

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
  skipDefaultBranchLookup?: boolean;
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

export interface RepoTreeNode {
  name?: string;
  path: string;
  type: "dir" | "file";
  children?: RepoTreeNode[];
}

export interface CandidateRankingInput {
  question: string;
  repoPaths: string[];
  preferredPaths?: string[];
  sourceMapSummary?: string;
  readmeSummary?: string;
  sessionSummary?: string;
}

const MAX_TARGET_FILES = 8;
const WRAPPING_PUNCTUATION = /^[`"'()[\]{}<>,;:!?]+|[`"'()[\]{}<>,;:!?]+$/g;
const CODE_FILE_EXTENSION_PATTERN =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|rb|php|cs|swift|kt|scala|vue|svelte)$/i;
const INSPECTABLE_FILE_EXTENSION_PATTERN =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|rs|rb|php|cs|swift|kt|scala|vue|svelte|json|md|mdx|txt|yml|yaml|toml|ini|env|css|scss|html|htm|sh|bash|zsh|ps1|sql|graphql|gql|proto|xml)$/i;
const INSPECTABLE_BASENAME_PATTERN =
  /^(dockerfile|makefile|gemfile|rakefile|procfile|readme|license|copying|notice|changelog)(\.[a-z0-9_-]+)?$/i;
const LOW_PRIORITY_PATH_PATTERN =
  /(^|\/)(dist|build|coverage|node_modules|vendor|\.next|\.github)(\/|$)/i;
const LOW_VALUE_ROOT_FILE_PATTERN =
  /^(license|copying|notice|changelog|release_notes(?:_[^/]+)?)(?:\.[a-z0-9_-]+)?$/i;
const PATH_LIKE_HINT_PATTERN =
  /(?:^|[\s`"'([{<])((?:\.\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_.-]+)?)/g;
const MULTILINGUAL_RANKING_ALIASES: Array<[RegExp, string[]]> = [
  [/记忆|记住|内存/u, ["memory", "session", "history", "store", "storage"]],
  [/会话|上下文/u, ["session", "context", "history"]],
  [/历史|记录/u, ["history", "record"]],
  [/存储|保存|持久化/u, ["store", "storage", "persist"]],
  [/缓存/u, ["cache"]],
  [/入口|启动|初始化/u, ["entry", "main", "index", "init", "bootstrap"]],
  [/配置|设置/u, ["config", "settings", "options"]],
  [/认证|鉴权|登录/u, ["auth", "login", "signin"]],
  [/路由/u, ["route", "router", "routing"]],
  [/数据库/u, ["database", "db", "sql"]],
  [/接口|请求/u, ["api", "request", "client"]],
  [/工具/u, ["tool", "utils", "helper"]],
  [/任务|作业/u, ["task", "job", "worker"]],
  [/流程|工作流/u, ["flow", "workflow", "pipeline"]],
  [/模型/u, ["model"]],
  [/插件/u, ["plugin", "extension"]],
];

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

export function isInspectableRepoPath(input: string): boolean {
  const normalized = normalizeCandidatePath(input);
  if (!normalized) return false;
  const basename = normalized.split("/").pop() || normalized;
  return INSPECTABLE_FILE_EXTENSION_PATTERN.test(normalized) ||
    INSPECTABLE_BASENAME_PATTERN.test(basename);
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

export function flattenTreeFilePaths(nodes: RepoTreeNode[]): string[] {
  const paths: string[] = [];

  const visit = (items: RepoTreeNode[]) => {
    for (const item of items) {
      if (item.type === "file") {
        const normalized = normalizeCandidatePath(item.path);
        if (normalized) {
          paths.push(normalized);
        }
        continue;
      }
      if (item.children?.length) {
        visit(item.children);
      }
    }
  };

  visit(nodes);
  return Array.from(new Set(paths));
}

function tokenizeRankingText(input: string): string[] {
  const aliases = MULTILINGUAL_RANKING_ALIASES.flatMap(([pattern, terms]) =>
    pattern.test(input) ? terms : [],
  );

  return Array.from(
    new Set(
      [
        ...input
          .toLowerCase()
          .replace(/[^a-z0-9/_-]+/g, " ")
          .split(/\s+/),
        ...aliases,
      ]
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 2),
    ),
  );
}

function extractPathLikeHints(input: string): string[] {
  const paths: string[] = [];
  for (const match of input.matchAll(PATH_LIKE_HINT_PATTERN)) {
    const normalized = normalizeCandidatePath(match[1]);
    if (normalized) paths.push(normalized);
  }
  return paths;
}

function scoreCandidateFile(
  filePath: string,
  preferredPaths: Set<string>,
  joinedText: string,
  tokens: string[],
  questionTokens: string[],
): number {
  let score = 0;
  const normalized = filePath.toLowerCase();
  const fileName = normalized.split("/").pop() || normalized;
  const fileStem = fileName.replace(/\.[^.]+$/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (preferredPaths.has(normalized)) {
    score += 10_000;
  }
  if (joinedText.includes(normalized)) {
    score += 800;
  }
  if (joinedText.includes(fileName)) {
    score += 320;
  }
  if (fileStem.length >= 3 && joinedText.includes(fileStem)) {
    score += 220;
  }

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += token.length >= 5 ? 90 : 45;
    }
    if (segments.includes(token)) {
      score += token.length >= 5 ? 300 : 150;
    }
    if (fileStem === token) {
      score += token.length >= 5 ? 80 : 40;
    }
  }

  for (const token of questionTokens) {
    if (normalized.includes(token)) {
      score += token.length >= 5 ? 140 : 70;
    }
    if (segments.includes(token)) {
      score += token.length >= 5 ? 500 : 250;
    }
    if (fileStem === token) {
      score += token.length >= 5 ? 80 : 40;
    }
  }

  if (CODE_FILE_EXTENSION_PATTERN.test(normalized)) {
    score += 40;
  }
  if (LOW_PRIORITY_PATH_PATTERN.test(normalized)) {
    score -= 120;
  }
  if (/(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/i.test(normalized)) {
    score -= 500;
  }
  if (/(^|\/)(readme|docs)(\/|$)|\.md$/i.test(normalized)) {
    score -= 60;
  }
  if (segments.length === 1 && LOW_VALUE_ROOT_FILE_PATTERN.test(fileName)) {
    score -= tokens.some((token) =>
      token === "license" || token === "legal" || token === "copyright" || token === fileStem
    )
      ? 0
      : 280;
  }
  if (segments.includes("src")) {
    score += 25;
  }

  return score;
}

export function rankCandidateFiles(input: CandidateRankingInput): string[] {
  const normalizedRepoPaths = Array.from(
    new Set(input.repoPaths.map(normalizeCandidatePath).filter(Boolean)),
  );
  const pathHints = new Set(
    [
      ...(input.preferredPaths || []),
      ...extractPathLikeHints(input.question),
      ...extractPathLikeHints(input.sourceMapSummary || ""),
      ...extractPathLikeHints(input.readmeSummary || ""),
      ...extractPathLikeHints(input.sessionSummary || ""),
    ]
      .map(normalizeCandidatePath)
      .filter(Boolean)
      .map((item) => item.toLowerCase()),
  );
  const repoPaths = normalizedRepoPaths.filter((filePath) =>
    isInspectableRepoPath(filePath) || pathHints.has(filePath.toLowerCase()),
  );
  const preferredPaths = new Set(
    (input.preferredPaths || [])
      .map(normalizeCandidatePath)
      .filter(Boolean)
      .map((item) => item.toLowerCase()),
  );
  const rankingText = [
    input.question,
    input.sourceMapSummary || "",
    input.readmeSummary || "",
    input.sessionSummary || "",
    ...(input.preferredPaths || []),
  ]
    .join("\n")
    .toLowerCase();
  const tokens = tokenizeRankingText(rankingText);
  const questionTokens = tokenizeRankingText(input.question);

  return [...repoPaths]
    .map((filePath) => ({
      filePath,
      score: scoreCandidateFile(filePath, preferredPaths, rankingText, tokens, questionTokens),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.filePath.localeCompare(right.filePath);
    })
    .map((item) => item.filePath);
}

export async function fetchRetrievedGithubFiles(
  request: GithubFileRetrievalRequest,
  deps: GithubFileRetrievalDependencies,
  onProgress?: (
    progress: Pick<AgentProgressEvent, "completed" | "total">
  ) => void | Promise<void>,
): Promise<RetrievedFileContext[]> {
  let defaultBranchCandidates: string[] | null = null;
  const initialBranchCandidates = resolveBranchCandidates();
  const loadDefaultBranchCandidates = async (triedBranches: Set<string>) => {
    if (request.skipDefaultBranchLookup) {
      return [];
    }
    if (!defaultBranchCandidates) {
      let defaultBranch: string | undefined;
      try {
        defaultBranch = await deps.getDefaultBranch(request.owner, request.repo, {
          timeoutMs: request.timeoutMs,
        });
      } catch {
        defaultBranch = undefined;
      }
      defaultBranchCandidates = resolveBranchCandidates(defaultBranch);
    }
    return defaultBranchCandidates.filter((branch) => !triedBranches.has(branch));
  };
  const maxFiles = request.maxFiles ?? MAX_TARGET_FILES;
  const maxCharsPerFile = request.maxCharsPerFile ?? Number.POSITIVE_INFINITY;

  const targetFiles = request.targetFiles.slice(0, maxFiles);
  const retrievedFiles: RetrievedFileContext[] = [];

  for (const [index, filePath] of targetFiles.entries()) {
    let retrieved: RetrievedFileContext | null = null;
    const triedBranches = new Set<string>();

    for (const branch of initialBranchCandidates) {
      triedBranches.add(branch);
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
      retrieved = {
        filePath,
        branch,
        status: "fetched",
        snippet: truncated.prompt,
      };
      break;
    }

    if (!retrieved) {
      const fallbackBranches = await loadDefaultBranchCandidates(triedBranches);
      for (const branch of fallbackBranches) {
        triedBranches.add(branch);
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
        retrieved = {
          filePath,
          branch,
          status: "fetched",
          snippet: truncated.prompt,
        };
        break;
      }
    }

    if (!retrieved) {
      retrieved = {
        filePath,
        status: "failed",
        reason: "content_unavailable",
      };
    }

    retrievedFiles.push(retrieved);
    await onProgress?.({
      completed: index + 1,
      total: targetFiles.length,
    });
  }

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

  pushUnique("HEAD");
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
