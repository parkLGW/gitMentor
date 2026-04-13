import type {
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  AgentRetrievalPlan,
  RetrievedFileContext,
} from "../types/agent.js";

export interface AnswerAgentQuestionDependencies {
  planRetriever: (
    payload: AgentChatRequestPayload
  ) => Promise<AgentRetrievalPlan> | AgentRetrievalPlan;
  fetchFiles: (
    payload: AgentChatRequestPayload,
    targetFiles: string[]
  ) => Promise<RetrievedFileContext[]> | RetrievedFileContext[];
  answerWithSummary: (
    payload: AgentChatRequestPayload
  ) => Promise<AgentChatResponsePayload> | AgentChatResponsePayload;
  answerWithCode: (input: {
    payload: AgentChatRequestPayload;
    plan: AgentRetrievalPlan;
    retrievedFiles: RetrievedFileContext[];
  }) => Promise<AgentChatResponsePayload> | AgentChatResponsePayload;
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

export async function answerAgentQuestion(
  payload: AgentChatRequestPayload,
  deps: AnswerAgentQuestionDependencies
): Promise<AgentChatResponsePayload> {
  const plan = await deps.planRetriever(payload);
  if (!plan.needsCodeContext || plan.targetFiles.length === 0) {
    const summaryAnswer = await deps.answerWithSummary(payload);
    return {
      ...summaryAnswer,
      retrievalMode: "summary-only",
      retrievedFiles: [],
    };
  }

  const retrievedFiles = await deps.fetchFiles(payload, plan.targetFiles);
  const fetchedCount = countFetchedFiles(retrievedFiles);

  if (fetchedCount === 0) {
    const summaryAnswer = await deps.answerWithSummary(payload);
    return {
      ...summaryAnswer,
      retrievalMode: "summary-only",
      retrievedFiles,
      retrievalNote: buildFallbackNote(plan.targetFiles.length),
    };
  }

  const codeAnswer = await deps.answerWithCode({
    payload,
    plan,
    retrievedFiles,
  });

  const retrievalNote = buildPartialNote(plan.targetFiles.length, fetchedCount);
  return {
    ...codeAnswer,
    retrievalMode: "github-code",
    retrievedFiles,
    ...(retrievalNote ? { retrievalNote } : {}),
  };
}
