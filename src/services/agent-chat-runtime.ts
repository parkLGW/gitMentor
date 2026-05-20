import type {
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  AgentIntent,
  AgentObservation,
  AgentProgressEvent,
  AgentRetrievalPlan,
  AgentSufficiencyDecision,
  AgentToolCall,
  RetrievedFileContext,
} from "../types/agent.js";
import { AGENT_LOOP_MAX_ITERATIONS } from "./agent-timeouts.js";

const MAX_CANDIDATE_FILES_TO_READ = 8;

export interface AnswerAgentQuestionDependencies {
  planRetriever: (
    payload: AgentChatRequestPayload
  ) => Promise<AgentRetrievalPlan> | AgentRetrievalPlan;
  discoverFiles?: (
    payload: AgentChatRequestPayload,
    plan: AgentRetrievalPlan
  ) => Promise<string[]> | string[];
  fetchFiles: (
    payload: AgentChatRequestPayload,
    targetFiles: string[],
    onFileProgress?: (
      progress: Pick<AgentProgressEvent, "completed" | "total">
    ) => Promise<void> | void,
  ) => Promise<RetrievedFileContext[]> | RetrievedFileContext[];
  answerWithSummary: (
    payload: AgentChatRequestPayload
  ) => Promise<AgentChatResponsePayload> | AgentChatResponsePayload;
  answerWithCode: (input: {
    payload: AgentChatRequestPayload;
    plan: AgentRetrievalPlan;
    retrievedFiles: RetrievedFileContext[];
  }) => Promise<AgentChatResponsePayload> | AgentChatResponsePayload;
  judgeIntent?: (
    payload: AgentChatRequestPayload
  ) => Promise<AgentIntent> | AgentIntent;
  executeToolCalls?: (
    payload: AgentChatRequestPayload,
    calls: AgentToolCall[],
    context: {
      observations: AgentObservation[];
      retrievedFiles: RetrievedFileContext[];
      iteration: number;
    }
  ) => Promise<AgentObservation[]> | AgentObservation[];
  judgeSufficiency?: (input: {
    payload: AgentChatRequestPayload;
    intent: AgentIntent;
    observations: AgentObservation[];
    retrievedFiles: RetrievedFileContext[];
    iteration: number;
  }) => Promise<AgentSufficiencyDecision> | AgentSufficiencyDecision;
  answerWithObservations?: (input: {
    payload: AgentChatRequestPayload;
    intent: AgentIntent;
    observations: AgentObservation[];
    retrievedFiles: RetrievedFileContext[];
    sufficient: AgentSufficiencyDecision;
  }) => Promise<AgentChatResponsePayload> | AgentChatResponsePayload;
  onProgress?: (
    progress: AgentProgressEvent
  ) => Promise<void> | void;
}

function isRequestTimeout(error: unknown): boolean {
  return error instanceof Error && error.message.includes("REQUEST_TIMEOUT");
}

function normalizeConversationText(input: string): string {
  return input.trim().toLowerCase();
}

function isSimpleConversationTurn(input: string): boolean {
  const text = normalizeConversationText(input);
  if (!text) return false;

  const exactMatches = new Set([
    "hi",
    "hello",
    "hey",
    "thanks",
    "thank you",
    "thx",
    "yo",
    "你好",
    "您好",
    "嗨",
    "哈喽",
    "谢谢",
    "谢了",
    "继续",
    "继续吧",
    "在吗",
  ]);

  if (exactMatches.has(text)) return true;

  const punctuationStripped = text.replace(/[.!?。！？~\s]/g, "");
  return exactMatches.has(punctuationStripped);
}

function buildSimpleConversationAnswer(
  payload: AgentChatRequestPayload
): AgentChatResponsePayload {
  const isZh = payload.language === "zh";
  const repoLabel = `${payload.repo.owner}/${payload.repo.name}`;

  return {
    answer: isZh
      ? `你好，我在。当前仓库是 ${repoLabel}。你可以直接问我项目结构、入口文件、某个模块职责，或者贴一个文件路径让我解释。`
      : `Hi, I'm here. The current repo is ${repoLabel}. You can ask about the project structure, entry files, a module's responsibility, or a specific file path.`,
    confidence: "low",
    evidence: [],
    suggestedNextSteps: isZh
      ? [
          "问这个项目的主流程是什么。",
          "问应该先看哪几个文件。",
        ]
      : [
          "Ask about the main project flow.",
          "Ask which files to read first.",
        ],
    source: "fallback",
  };
}

export function buildFastPathAgentAnswer(
  payload: AgentChatRequestPayload
): AgentChatResponsePayload | null {
  if (!isSimpleConversationTurn(payload.question)) {
    return null;
  }

  return {
    ...buildSimpleConversationAnswer(payload),
    retrievalMode: "summary-only",
    retrievedFiles: [],
  };
}

type LocalFallbackReason = "timeout" | "no-code-evidence";

function compactSnippetLine(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 180);
}

function extractEvidenceLine(file: RetrievedFileContext): { snippet: string; lineStart: number } | null {
  const rawSnippet = String(file.snippet || "");
  if (!rawSnippet.trim()) return null;

  const lines = rawSnippet
    .split("\n")
    .filter((line, index) => !(index === 0 && line.trim() === `File: ${file.filePath}`));
  const preferredIndex = lines.findIndex((line) =>
    /\b(async\s+def|def|class|function|const|let|var|export|interface|type|import|from)\b/.test(line)
  );
  const fallbackIndex = lines.findIndex((line) => line.trim().length > 0);
  const selectedIndex = preferredIndex >= 0 ? preferredIndex : fallbackIndex;
  if (selectedIndex < 0) return null;

  const snippet = compactSnippetLine(lines[selectedIndex]);
  return snippet ? { snippet, lineStart: selectedIndex + 1 } : null;
}

function buildSourceGroundedFallbackAnswer(
  payload: AgentChatRequestPayload,
  retrievedFiles: RetrievedFileContext[],
): AgentChatResponsePayload | null {
  const fetchedFiles = retrievedFiles
    .filter((file) => file.status === "fetched" && file.snippet)
    .slice(0, 4);
  if (fetchedFiles.length === 0) return null;

  const isZh = payload.language === "zh";
  const repoLabel = `${payload.repo.owner}/${payload.repo.name}`;
  const evidence = fetchedFiles
    .map((file) => {
      const line = extractEvidenceLine(file);
      if (!line) return null;
      return {
        filePath: file.filePath,
        lineStart: line.lineStart,
        snippet: line.snippet,
        reason: isZh
          ? "最终回答模型超时后使用的已读取源码证据。"
          : "Fetched source evidence used after final answer timeout.",
      };
    })
    .filter(Boolean)
    .slice(0, 3) as AgentChatResponsePayload["evidence"];

  const fileList = fetchedFiles.map((file) => file.filePath).join(isZh ? "、" : ", ");
  const evidenceText = evidence
    .map((item) => isZh
      ? `${item.filePath} 中出现了 ${item.snippet}`
      : `${item.filePath} contains ${item.snippet}`)
    .join(isZh ? "；" : "; ");

  return {
    answer: isZh
      ? [
        `从本次已读取的源码看，${repoLabel} 相关实现集中在 ${fileList}。`,
        evidenceText ? `${evidenceText}。` : `这些文件已经被读取，但没有提取到稳定的短代码片段。`,
        `因此可以先基于这些文件继续追问具体职责、数据结构或调用关系。`,
      ].join("")
      : [
        `From the fetched source, the relevant implementation in ${repoLabel} is concentrated in ${fileList}.`,
        evidenceText ? ` ${evidenceText}.` : " The files were fetched, but no stable short code snippet could be extracted.",
        " Use these files as the grounded starting point for a narrower follow-up about responsibilities, data structures, or call flow.",
      ].join(""),
    confidence: evidence.length > 0 ? "medium" : "low",
    evidence,
    suggestedNextSteps: fetchedFiles.slice(0, 2).map((file) =>
      isZh ? `继续追问 ${file.filePath} 的职责和调用关系。` : `Ask about the responsibility and call flow in ${file.filePath}.`
    ),
    source: "fallback",
    downgraded: true,
    reason: "final_answer_timeout_source_grounded_fallback",
  };
}

export function buildLocalFallbackAnswer(
  payload: AgentChatRequestPayload,
  retrievedFiles: RetrievedFileContext[],
  reason: LocalFallbackReason = "timeout",
): AgentChatResponsePayload {
  if (reason === "timeout") {
    const sourceGrounded = buildSourceGroundedFallbackAnswer(payload, retrievedFiles);
    if (sourceGrounded) return sourceGrounded;
  }

  const isZh = payload.language === "zh";
  const fetchedFiles = retrievedFiles
    .filter((file) => file.status === "fetched")
    .map((file) => file.filePath)
    .slice(0, 3);
  const repoLabel = `${payload.repo.owner}/${payload.repo.name}`;
  const sourceHints = [
    payload.readmeSummary?.trim(),
    payload.sourceMapSummary?.trim(),
  ].filter(Boolean);

  const answer = isZh
    ? reason === "no-code-evidence"
      ? [
        `这次没有拿到足够的代码证据，所以我不能给出确定的源码结论。`,
        `问题围绕 ${repoLabel}，需要先定位并读取相关实现文件。`,
        fetchedFiles.length > 0
          ? `本次已抓取到这些相关文件：${fetchedFiles.join("、")}。你可以继续追问其中某个文件或模块。`
          : `这次没有成功抓取到可用于回答的源码文件。`,
        sourceHints.length > 0
          ? `当前只能参考 README/源码地图摘要，结论需要等源码读取成功后再确认。`
          : `如果仓库 README 或源码地图还没生成完整，先刷新它们会更稳。`,
      ].join("")
      : [
        `模型回答超时，我先基于当前仓库摘要给出保守结论。`,
        `问题围绕 ${repoLabel}，建议先结合 README 和源码地图确认主流程与核心模块。`,
        fetchedFiles.length > 0
          ? `本次已抓取到这些相关文件：${fetchedFiles.join("、")}。你可以继续追问其中某个文件或模块。`
          : `这次还没有拿到足够稳定的代码回答，建议把问题缩小到具体模块、目录或文件。`,
        sourceHints.length > 0
          ? `如果你继续提问，我会优先基于现有 README/源码地图摘要继续收敛答案。`
          : `如果仓库 README 或源码地图还没生成完整，先刷新它们会更稳。`,
      ].join("")
    : reason === "no-code-evidence"
      ? [
        `The agent did not retrieve enough code evidence to make a source-grounded claim.`,
        `For ${repoLabel}, it needs to locate and read the relevant implementation files first.`,
        fetchedFiles.length > 0
          ? `Retrieved files in this attempt: ${fetchedFiles.join(", ")}. You can ask a narrower follow-up about one of them.`
          : `This attempt did not retrieve usable source files for the answer.`,
        sourceHints.length > 0
          ? `The current README/source-map summaries can guide another attempt, but source claims need fetched code evidence.`
          : `If the README or source map is sparse, refreshing them first should help.`,
      ].join(" ")
      : [
        `The model timed out, so here is a conservative fallback based on the repository summaries.`,
        `For ${repoLabel}, start from the README and source map to confirm the main flow and core modules.`,
        fetchedFiles.length > 0
          ? `Retrieved files in this attempt: ${fetchedFiles.join(", ")}. You can ask a narrower follow-up about one of them.`
          : `This attempt did not produce a stable code-grounded answer, so narrowing the question to a module or file should help.`,
        sourceHints.length > 0
          ? `A follow-up can still rely on the current README/source-map summaries.`
          : `If the README or source map is sparse, refreshing them first should help.`,
      ].join(" ");

  return {
    answer,
    confidence: "low",
    evidence: [],
    suggestedNextSteps: fetchedFiles.length > 0
      ? fetchedFiles.map((file) =>
        isZh ? `继续追问文件 ${file} 的职责。` : `Ask specifically about ${file}.`
      )
      : [
        isZh ? "把问题缩小到一个目录、模块或文件。" : "Narrow the question to one module, directory, or file.",
      ],
    source: "fallback",
  };
}

function countFetchedFiles(files: RetrievedFileContext[]): number {
  return files.filter((file) => file.status === "fetched").length;
}

function buildFallbackNote(requestedCount: number): string | undefined {
  if (requestedCount <= 0) return undefined;
  return `Fell back to summary-only because GitHub code context could not be retrieved for ${requestedCount} requested files.`;
}

function buildPartialNote(
  requestedCount: number,
  fetchedCount: number
): string | undefined {
  if (requestedCount <= 0) return undefined;
  if (fetchedCount <= 0 || fetchedCount >= requestedCount) return undefined;
  return `Used GitHub code context from ${fetchedCount} of ${requestedCount} requested files.`;
}

async function emitProgress(
  deps: AnswerAgentQuestionDependencies,
  progress: AgentProgressEvent,
): Promise<void> {
  await deps.onProgress?.(progress);
}

function normalizeTargetFiles(targetFiles: string[]): string[] {
  return Array.from(
    new Set(
      targetFiles
        .map((item) => String(item || "").trim().replace(/\\/g, "/"))
        .filter(Boolean),
    ),
  ).slice(0, MAX_CANDIDATE_FILES_TO_READ);
}

function hasGenericLoopDeps(deps: AnswerAgentQuestionDependencies): boolean {
  return Boolean(
    deps.judgeIntent &&
    deps.executeToolCalls &&
    deps.judgeSufficiency &&
    deps.answerWithObservations,
  );
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

function collectRetrievedFiles(observations: AgentObservation[]): RetrievedFileContext[] {
  return observations.reduce<RetrievedFileContext[]>((files, observation) => {
    return mergeRetrievedFiles(files, observation.retrievedFiles || []);
  }, []);
}

function hasFetchedFiles(files: RetrievedFileContext[]): boolean {
  return files.some((file) => file.status === "fetched");
}

function buildSourceEvidenceSufficiencyDecision(
  intent: AgentIntent,
  observations: AgentObservation[],
  retrievedFiles: RetrievedFileContext[],
): AgentSufficiencyDecision | null {
  if (!hasFetchedFiles(retrievedFiles)) return null;
  const fetchedCount = countFetchedFiles(retrievedFiles);
  const checkedRelatedFiles =
    hasObservationForTool(observations, "searchRepoPaths") ||
    hasObservationForTool(observations, "expandImports");

  return {
    enough: true,
    reason: needsCodeEvidence(intent)
      ? checkedRelatedFiles
        ? `Fetched source evidence from ${fetchedCount} file${fetchedCount === 1 ? "" : "s"} and checked related-file coverage; draft a grounded answer.`
        : `Fetched source evidence from ${fetchedCount} file${fetchedCount === 1 ? "" : "s"} within the tool budget; draft a grounded answer with uncertainty.`
      : "Fetched context is available; draft the answer.",
    confidence: checkedRelatedFiles || fetchedCount >= 2 ? "medium" : "low",
    nextToolCalls: [],
  };
}

function needsCodeEvidence(intent: AgentIntent): boolean {
  return intent.category !== "learning-path";
}

function hasObservationForTool(
  observations: AgentObservation[],
  tool: AgentToolCall["tool"],
): boolean {
  return observations.some((observation) => observation.tool === tool);
}

function latestCandidateFiles(observations: AgentObservation[]): string[] {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const candidateFiles = observations[index].candidateFiles;
    if (candidateFiles?.length) {
      return Array.from(
        new Set(
          candidateFiles
            .map((file) => String(file || "").trim().replace(/\\/g, "/"))
            .filter(Boolean),
        ),
      );
    }
  }
  return [];
}

function remainingCandidateFiles(
  observations: AgentObservation[],
  retrievedFiles: RetrievedFileContext[],
): string[] {
  const alreadyTried = new Set(retrievedFiles.map((file) => file.filePath));
  return latestCandidateFiles(observations)
    .filter((filePath) => !alreadyTried.has(filePath));
}

function shouldSearchCandidatesBeforeJudging(
  intent: AgentIntent,
  observations: AgentObservation[],
  retrievedFiles: RetrievedFileContext[],
  iteration: number,
): AgentToolCall | null {
  if (iteration >= AGENT_LOOP_MAX_ITERATIONS - 1) return null;
  if (!needsCodeEvidence(intent)) return null;
  if (hasFetchedFiles(retrievedFiles)) return null;
  if (latestCandidateFiles(observations).length > 0) return null;
  if (hasObservationForTool(observations, "searchRepoPaths")) return null;

  return {
    tool: "searchRepoPaths",
    args: {
      query: intent.reason || "",
      maxFiles: MAX_CANDIDATE_FILES_TO_READ,
      reason: "Find candidate source files before judging sufficiency.",
    },
  };
}

function shouldReadCandidatesBeforeAnswer(
  intent: AgentIntent,
  observations: AgentObservation[],
  retrievedFiles: RetrievedFileContext[],
  iteration: number,
): AgentToolCall | null {
  if (iteration >= AGENT_LOOP_MAX_ITERATIONS - 1) return null;
  if (!needsCodeEvidence(intent)) return null;

  const paths = remainingCandidateFiles(observations, retrievedFiles)
    .slice(0, MAX_CANDIDATE_FILES_TO_READ);

  if (paths.length === 0) return null;

  return {
    tool: "readGithubFiles",
    args: {
      paths,
      reason: "Read remaining candidate files before making code-grounded claims.",
    },
  };
}

function shouldExpandImportsBeforeAnswer(
  intent: AgentIntent,
  observations: AgentObservation[],
  retrievedFiles: RetrievedFileContext[],
  iteration: number,
): AgentToolCall[] | null {
  if (iteration >= AGENT_LOOP_MAX_ITERATIONS - 1) return null;
  if (!needsCodeEvidence(intent)) return null;
  if (!hasFetchedFiles(retrievedFiles)) return null;
  if (remainingCandidateFiles(observations, retrievedFiles).length > 0) return null;
  if (hasObservationForTool(observations, "searchRepoPaths")) return null;
  if (hasObservationForTool(observations, "expandImports")) return null;

  return [
    {
      tool: "buildCodeIndex",
      args: {
        reason: "Index fetched source before deciding whether imported files are needed.",
      },
    },
    {
      tool: "expandImports",
      args: {
        reason: "Find imported files that may be needed for a sufficient code-grounded answer.",
      },
    },
  ];
}

async function answerWithGenericLoop(
  payload: AgentChatRequestPayload,
  deps: AnswerAgentQuestionDependencies,
): Promise<AgentChatResponsePayload> {
  await emitProgress(deps, { stage: "understanding-intent" });
  const intent = await deps.judgeIntent!(payload);
  const observations: AgentObservation[] = [];
  let retrievedFiles: RetrievedFileContext[] = [];
  let nextToolCalls = intent.toolCalls;
  let sufficient: AgentSufficiencyDecision | null = null;

  for (let iteration = 0; iteration < AGENT_LOOP_MAX_ITERATIONS; iteration += 1) {
    if (nextToolCalls.length > 0) {
      await emitProgress(deps, {
        stage: "searching-files",
        note: nextToolCalls.map((call) => call.tool).join(", "),
      });
      const nextObservations = await deps.executeToolCalls!(payload, nextToolCalls, {
        observations,
        retrievedFiles,
        iteration,
      });
      observations.push(...nextObservations);
      retrievedFiles = collectRetrievedFiles(observations);
    }

    const candidateSearchCall = shouldSearchCandidatesBeforeJudging(
      intent,
      observations,
      retrievedFiles,
      iteration,
    );
    if (candidateSearchCall) {
      nextToolCalls = [candidateSearchCall];
      continue;
    }

    const candidateReadCall = shouldReadCandidatesBeforeAnswer(
      intent,
      observations,
      retrievedFiles,
      iteration,
    );
    if (candidateReadCall) {
      nextToolCalls = [candidateReadCall];
      continue;
    }

    const importExpansionCalls = shouldExpandImportsBeforeAnswer(
      intent,
      observations,
      retrievedFiles,
      iteration,
    );
    if (importExpansionCalls) {
      nextToolCalls = importExpansionCalls;
      continue;
    }

    sufficient = buildSourceEvidenceSufficiencyDecision(intent, observations, retrievedFiles)
      ?? await deps.judgeSufficiency!({
        payload,
        intent,
        observations,
        retrievedFiles,
        iteration,
      });

    if (sufficient.enough) {
      await emitProgress(deps, { stage: "drafting-answer" });
      let answer: AgentChatResponsePayload;
      try {
        answer = await deps.answerWithObservations!({
          payload,
          intent,
          observations,
          retrievedFiles,
          sufficient,
        });
      } catch (error) {
        if (!isRequestTimeout(error)) throw error;
        answer = buildLocalFallbackAnswer(payload, retrievedFiles);
      }
      return {
        ...answer,
        retrievalMode: hasFetchedFiles(retrievedFiles) ? "github-code" : "summary-only",
        retrievedFiles,
      };
    }

    nextToolCalls = sufficient.nextToolCalls;
    if (nextToolCalls.length === 0) break;
  }

  if (hasFetchedFiles(retrievedFiles)) {
    await emitProgress(deps, {
      stage: "drafting-answer",
      note: "calling final LLM with fetched files after tool budget was exhausted",
    });
    let answer: AgentChatResponsePayload;
    try {
      answer = await deps.answerWithObservations!({
        payload,
        intent,
        observations,
        retrievedFiles,
        sufficient: sufficient ?? {
          enough: false,
          reason: "Tool budget exhausted with partial evidence.",
          confidence: "low",
          nextToolCalls: [],
        },
      });
    } catch (error) {
      if (!isRequestTimeout(error)) throw error;
      answer = buildLocalFallbackAnswer(payload, retrievedFiles);
    }
    return {
      ...answer,
      retrievalMode: "github-code",
      retrievedFiles,
    };
  }

  await emitProgress(deps, {
    stage: "drafting-answer",
    note: "no fetched files available for final LLM answer",
  });
  return {
    ...buildLocalFallbackAnswer(payload, retrievedFiles, "no-code-evidence"),
    retrievalMode: hasFetchedFiles(retrievedFiles) ? "github-code" : "summary-only",
    retrievedFiles,
  };
}

export async function answerAgentQuestion(
  payload: AgentChatRequestPayload,
  deps: AnswerAgentQuestionDependencies
): Promise<AgentChatResponsePayload> {
  const fastPathAnswer = buildFastPathAgentAnswer(payload);
  if (fastPathAnswer) {
    return fastPathAnswer;
  }

  if (hasGenericLoopDeps(deps)) {
    try {
      return await answerWithGenericLoop(payload, deps);
    } catch (error) {
      if (!isRequestTimeout(error)) throw error;
      return {
        ...buildLocalFallbackAnswer(payload, []),
        retrievalMode: "summary-only",
        retrievedFiles: [],
      };
    }
  }

  const plan = await deps.planRetriever(payload);
  if (!plan.needsCodeContext) {
    await emitProgress(deps, { stage: "drafting-answer" });
    let summaryAnswer: AgentChatResponsePayload;
    try {
      summaryAnswer = await deps.answerWithSummary(payload);
    } catch (error) {
      if (!isRequestTimeout(error)) throw error;
      summaryAnswer = buildLocalFallbackAnswer(payload, []);
    }
    return {
      ...summaryAnswer,
      retrievalMode: "summary-only",
      retrievedFiles: [],
    };
  }

  await emitProgress(deps, { stage: "locating-files" });
  const discoveredFiles = deps.discoverFiles
    ? await deps.discoverFiles(payload, plan)
    : plan.targetFiles;
  const targetFiles = normalizeTargetFiles(
    discoveredFiles.length > 0 ? discoveredFiles : plan.targetFiles,
  );

  if (targetFiles.length === 0) {
    await emitProgress(deps, { stage: "drafting-answer" });
    let summaryAnswer: AgentChatResponsePayload;
    try {
      summaryAnswer = await deps.answerWithSummary(payload);
    } catch (error) {
      if (!isRequestTimeout(error)) throw error;
      summaryAnswer = buildLocalFallbackAnswer(payload, []);
    }
    return {
      ...summaryAnswer,
      retrievalMode: "summary-only",
      retrievedFiles: [],
    };
  }

  await emitProgress(deps, {
    stage: "reading-files",
    completed: 0,
    total: targetFiles.length,
  });
  const retrievedFiles = await deps.fetchFiles(
    payload,
    targetFiles,
    async (progress) =>
      await emitProgress(deps, {
        stage: "reading-files",
        completed: progress.completed,
        total: progress.total,
      }),
  );
  const fetchedCount = countFetchedFiles(retrievedFiles);

  if (fetchedCount === 0) {
    await emitProgress(deps, { stage: "drafting-answer" });
    let summaryAnswer: AgentChatResponsePayload;
    try {
      summaryAnswer = await deps.answerWithSummary(payload);
    } catch (error) {
      if (!isRequestTimeout(error)) throw error;
      summaryAnswer = buildLocalFallbackAnswer(payload, retrievedFiles);
    }
    return {
      ...summaryAnswer,
      retrievalMode: "summary-only",
      retrievedFiles,
      retrievalNote: buildFallbackNote(targetFiles.length),
    };
  }

  await emitProgress(deps, { stage: "drafting-answer" });
  let codeAnswer: AgentChatResponsePayload;
  try {
    codeAnswer = await deps.answerWithCode({
      payload,
      plan,
      retrievedFiles,
    });
  } catch (error) {
    if (!isRequestTimeout(error)) throw error;
    codeAnswer = buildLocalFallbackAnswer(payload, retrievedFiles);
  }

  const retrievalNote = buildPartialNote(targetFiles.length, fetchedCount);
  return {
    ...codeAnswer,
    retrievalMode: "github-code",
    retrievedFiles,
    ...(retrievalNote ? { retrievalNote } : {}),
  };
}
