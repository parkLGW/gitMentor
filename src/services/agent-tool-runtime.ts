import { buildCodeIndex } from "./agent-code-index.js";
import { normalizeCandidatePath, rankCandidateFiles } from "./agent-code-context.js";

import type {
  AgentChatRequestPayload,
  AgentCodeImport,
  AgentCodeIndex,
  AgentObservation,
  AgentProgressEvent,
  AgentToolCall,
  RetrievedFileContext,
} from "../types/agent.js";

export interface SearchRepoPathsInput {
  question: string;
  repoPaths: string[];
  preferredPaths?: string[];
  sourceMapSummary?: string;
  readmeSummary?: string;
  sessionSummary?: string;
  maxFiles?: number;
}

export interface ExpandImportsInput {
  fromFile: string;
  imports: Array<Pick<AgentCodeImport, "source">>;
  repoPaths: string[];
}

export interface AgentToolBudget {
  maxFiles: number;
  maxCharsPerFile: number;
}

export interface ExecuteAgentToolCallsInput {
  payload: AgentChatRequestPayload;
  calls: AgentToolCall[];
  repoPaths: string[];
  retrievedFiles: RetrievedFileContext[];
  budget: AgentToolBudget;
  codeIndex?: AgentCodeIndex;
}

export interface ExecuteAgentToolCallsDependencies {
  fetchFiles: (
    payload: AgentChatRequestPayload,
    targetFiles: string[],
    onFileProgress?: (
      progress: Pick<AgentProgressEvent, "completed" | "total">
    ) => Promise<void> | void,
  ) => Promise<RetrievedFileContext[]> | RetrievedFileContext[];
  listRepoTree?: (
    payload: AgentChatRequestPayload,
    depth?: number,
  ) => Promise<string[]> | string[];
  onProgress?: (progress: AgentProgressEvent) => Promise<void> | void;
}

const PATH_HINT_PATTERN =
  /(?:^|[\s`"'([{<])((?:\.\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|vue|svelte|py|go|java|rs|rb|php|cs|swift|kt|scala))/g;
const DEFAULT_REPO_PATH_CANDIDATES = [
  "README.md",
  "package.json",
  "src/index.ts",
  "src/main.ts",
  "src/App.tsx",
  "src/App.ts",
  "src/services/index.ts",
  "src/components/index.ts",
];

export function extractRepoPathHintsFromText(...texts: Array<string | undefined | null>): string[] {
  const paths: string[] = [];

  texts.forEach((text) => {
    if (!text) return;
    for (const match of text.matchAll(PATH_HINT_PATTERN)) {
      const normalized = normalizeCandidatePath(match[1]);
      if (normalized && !paths.includes(normalized)) {
        paths.push(normalized);
      }
    }
  });

  return paths;
}

export function searchRepoPaths(input: SearchRepoPathsInput): string[] {
  const pathHints = extractRepoPathHintsFromText(
    input.sourceMapSummary,
    input.readmeSummary,
    input.sessionSummary,
    input.question,
    ...(input.preferredPaths || []),
  );
  const repoPaths = Array.from(new Set([
    ...(input.repoPaths.length > 0 ? input.repoPaths : []),
    ...pathHints,
    ...(input.repoPaths.length === 0 && pathHints.length === 0
      ? DEFAULT_REPO_PATH_CANDIDATES
      : []),
  ]));

  return rankCandidateFiles({
    question: input.question,
    repoPaths,
    preferredPaths: input.preferredPaths,
    sourceMapSummary: input.sourceMapSummary,
    readmeSummary: input.readmeSummary,
    sessionSummary: input.sessionSummary,
  }).slice(0, input.maxFiles ?? 5);
}

function dirname(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/");
}

function normalizePath(path: string): string {
  const output: string[] = [];
  path.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      output.pop();
      return;
    }
    output.push(part);
  });
  return output.join("/");
}

function resolveImportBase(fromFile: string, source: string): string | null {
  if (source.startsWith("@/")) return normalizeCandidatePath(`src/${source.slice(2)}`);
  if (source.startsWith("./") || source.startsWith("../")) {
    return normalizeCandidatePath(normalizePath(`${dirname(fromFile)}/${source}`));
  }
  return null;
}

function candidatePaths(base: string): string[] {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
}

export function expandImports(input: ExpandImportsInput): string[] {
  const repoPathSet = new Set(input.repoPaths.map(normalizeCandidatePath).filter(Boolean));
  const resolved: string[] = [];

  input.imports.forEach((item) => {
    const base = resolveImportBase(input.fromFile, item.source);
    if (!base) return;
    const found = candidatePaths(base).find((path) => repoPathSet.has(path));
    if (found && !resolved.includes(found)) {
      resolved.push(found);
    }
  });

  return resolved;
}

function mergeRetrievedFiles(
  current: RetrievedFileContext[],
  next: RetrievedFileContext[],
): RetrievedFileContext[] {
  const byPath = new Map<string, RetrievedFileContext>();
  [...current, ...next].forEach((file) => {
    byPath.set(file.filePath, file);
  });
  return Array.from(byPath.values());
}

function observation(
  tool: AgentToolCall["tool"],
  input: Partial<AgentObservation>,
): AgentObservation {
  return {
    tool,
    ok: input.ok ?? true,
    summary: input.summary || "",
    ...input,
  };
}

export async function executeAgentToolCalls(
  input: ExecuteAgentToolCallsInput,
  deps: ExecuteAgentToolCallsDependencies,
): Promise<AgentObservation[]> {
  let retrievedFiles = [...input.retrievedFiles];
  let codeIndex = input.codeIndex;
  let repoPaths = [...input.repoPaths];
  const observations: AgentObservation[] = [];

  for (const call of input.calls) {
    if (call.tool === "readSummaries") {
      observations.push(observation(call.tool, {
        summary: "Read repository summaries from current context.",
      }));
      continue;
    }

    if (call.tool === "listRepoTree") {
      repoPaths = deps.listRepoTree
        ? await deps.listRepoTree(input.payload, call.args?.depth)
        : repoPaths;
      observations.push(observation(call.tool, {
        summary: `Listed ${repoPaths.length} repository paths.`,
        treePaths: repoPaths,
      }));
      continue;
    }

    if (call.tool === "searchRepoPaths") {
      const candidateFiles = searchRepoPaths({
        question: call.args?.query || input.payload.question,
        repoPaths,
        preferredPaths: call.args?.paths,
        sourceMapSummary: input.payload.sourceMapSummary,
        readmeSummary: input.payload.readmeSummary,
        maxFiles: call.args?.maxFiles ?? input.budget.maxFiles,
      });
      observations.push(observation(call.tool, {
        summary: `Found ${candidateFiles.length} candidate files.`,
        candidateFiles,
      }));
      continue;
    }

    if (call.tool === "readGithubFiles") {
      const remaining = Math.max(0, input.budget.maxFiles - retrievedFiles.length);
      const targetFiles = (call.args?.paths || []).map(normalizeCandidatePath).filter(Boolean).slice(0, remaining);
      if (targetFiles.length > 0) {
        await deps.onProgress?.({
          stage: "reading-files",
          completed: 0,
          total: targetFiles.length,
        });
      }
      const fetched = targetFiles.length > 0
        ? await deps.fetchFiles(input.payload, targetFiles, async (progress) => {
            await deps.onProgress?.({
              stage: "reading-files",
              completed: progress.completed,
              total: progress.total,
            });
          })
        : [];
      retrievedFiles = mergeRetrievedFiles(retrievedFiles, fetched);
      observations.push(observation(call.tool, {
        summary: `Fetched ${fetched.filter((file) => file.status === "fetched").length} files.`,
        retrievedFiles: fetched,
      }));
      continue;
    }

    if (call.tool === "buildCodeIndex") {
      await deps.onProgress?.({ stage: "indexing-code" });
      codeIndex = buildCodeIndex(retrievedFiles);
      observations.push(observation(call.tool, {
        summary: `Indexed ${codeIndex.files.filter((file) => file.status === "indexed").length} files.`,
        codeIndex,
      }));
      continue;
    }

    if (call.tool === "expandImports") {
      const currentIndex = codeIndex || buildCodeIndex(retrievedFiles);
      const candidateFiles = currentIndex.files.flatMap((file) =>
        file.status === "indexed"
          ? expandImports({
              fromFile: file.filePath,
              imports: file.imports,
              repoPaths,
            })
          : [],
      ).slice(0, input.budget.maxFiles);
      observations.push(observation(call.tool, {
        summary: `Expanded imports to ${candidateFiles.length} candidate files.`,
        candidateFiles,
      }));
    }
  }

  return observations;
}
