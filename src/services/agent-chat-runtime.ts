import type {
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  AgentProgressEvent,
  AgentRetrievalPlan,
  RetrievedFileContext,
} from "../types/agent.js";

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

export function buildLocalFallbackAnswer(
  payload: AgentChatRequestPayload,
  retrievedFiles: RetrievedFileContext[]
): AgentChatResponsePayload {
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
    ? [
        `模型回答超时，我先基于当前仓库摘要给出保守结论。`,
        `问题围绕 ${repoLabel}，建议先结合 README 和源码地图确认主流程与核心模块。`,
        fetchedFiles.length > 0
          ? `本次已抓取到这些相关文件：${fetchedFiles.join("、")}。你可以继续追问其中某个文件或模块。`
          : `这次还没有拿到足够稳定的代码回答，建议把问题缩小到具体模块、目录或文件。`,
        sourceHints.length > 0
          ? `如果你继续提问，我会优先基于现有 README/源码地图摘要继续收敛答案。`
          : `如果仓库 README 或源码地图还没生成完整，先刷新它们会更稳。`,
      ].join("")
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
  ).slice(0, 5);
}

export async function answerAgentQuestion(
  payload: AgentChatRequestPayload,
  deps: AnswerAgentQuestionDependencies
): Promise<AgentChatResponsePayload> {
  const fastPathAnswer = buildFastPathAgentAnswer(payload);
  if (fastPathAnswer) {
    return fastPathAnswer;
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
