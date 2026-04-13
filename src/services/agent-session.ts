import { StorageKeys } from "@/constants/storage";
import type {
  AgentRetrievalMode,
  AgentMessage,
  AgentSession,
  RetrievedFileMetadata,
  RetrievedFileStatus,
  SessionSummary,
} from "@/types/agent";
import { estimateTokens } from "@/services/usage-tracker";
import { setJsonCacheWithEviction } from "@/utils/local-cache";

const AGENT_SESSION_SCHEMA_VERSION = 1;
const MAX_CONTEXT_MESSAGES = 8;
const MAX_RECENT_MESSAGES = 12;
const COMPRESSION_MESSAGE_THRESHOLD = 14;
const COMPRESSION_TOKEN_THRESHOLD = 5200;
const MAX_QUESTION_LENGTH = 1200;
const MAX_ANSWER_LENGTH = 3000;
const MAX_RETRIEVED_FILES = 5;
const MAX_RETRIEVAL_NOTE_LENGTH = 220;
const MAX_RETRIEVED_FILE_PATH_LENGTH = 260;
const MAX_RETRIEVED_FILE_BRANCH_LENGTH = 120;
const MAX_RETRIEVED_FILE_REASON_LENGTH = 160;

export function getRepoKey(repo: { owner: string; name: string }): string {
  return `${repo.owner}/${repo.name}`;
}

export function getAgentSessionStorageKey(repoKey: string): string {
  return StorageKeys.agentSession(repoKey);
}

export function createEmptyAgentSession(repoKey: string): AgentSession {
  return {
    schemaVersion: AGENT_SESSION_SCHEMA_VERSION,
    repoKey,
    updatedAt: Date.now(),
    recentMessages: [],
    summary: null,
    messageCount: 0,
  };
}

export function loadAgentSession(repoKey: string): AgentSession {
  const cacheKey = getAgentSessionStorageKey(repoKey);
  const raw = localStorage.getItem(cacheKey);
  if (!raw) return createEmptyAgentSession(repoKey);
  try {
    const parsed = JSON.parse(raw) as {
      data?: AgentSession;
      timestamp?: number;
    };
    const data = parsed?.data;
    if (!data) return createEmptyAgentSession(repoKey);
    if (data.schemaVersion !== AGENT_SESSION_SCHEMA_VERSION) {
      return createEmptyAgentSession(repoKey);
    }
    if (data.repoKey !== repoKey) return createEmptyAgentSession(repoKey);
    return {
      ...data,
      recentMessages: Array.isArray(data.recentMessages)
        ? data.recentMessages
          .map((message) => normalizeAgentMessage(message))
          .filter((message) => Boolean(message.content))
          .slice(-MAX_RECENT_MESSAGES)
        : [],
      messageCount: typeof data.messageCount === "number"
        ? data.messageCount
        : data.recentMessages?.length || 0,
    };
  } catch {
    return createEmptyAgentSession(repoKey);
  }
}

export function persistAgentSession(session: AgentSession): boolean {
  const normalized: AgentSession = {
    ...session,
    schemaVersion: AGENT_SESSION_SCHEMA_VERSION,
    updatedAt: Date.now(),
    recentMessages: session.recentMessages
      .map((message) => normalizeAgentMessage(message))
      .filter((message) => Boolean(message.content))
      .slice(-MAX_RECENT_MESSAGES),
  };
  return setJsonCacheWithEviction(
    getAgentSessionStorageKey(session.repoKey),
    normalized,
  );
}

function normalizeMessageContent(content: string, role: AgentMessage["role"]): string {
  const trimmed = String(content || "").trim();
  if (!trimmed) return "";
  const limit = role === "user" ? MAX_QUESTION_LENGTH : MAX_ANSWER_LENGTH;
  return trimmed.slice(0, limit);
}

function normalizeRetrievedFileStatus(input: unknown): RetrievedFileStatus | undefined {
  if (input === "fetched" || input === "failed" || input === "skipped") {
    return input;
  }
  return undefined;
}

function normalizeRetrievalMode(input: unknown): AgentRetrievalMode | undefined {
  if (input === "summary-only" || input === "github-code") return input;
  return undefined;
}

function normalizeRetrievedFiles(input: unknown): RetrievedFileMetadata[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const seen = new Set<string>();
  const normalized = input
    .map((item) => {
      const value = item as Partial<RetrievedFileMetadata>;
      const filePath = String(value?.filePath || "")
        .trim()
        .replace(/\\/g, "/")
        .slice(0, MAX_RETRIEVED_FILE_PATH_LENGTH);
      const status = normalizeRetrievedFileStatus(value?.status);
      if (!filePath || !status) return null;

      const branch = String(value?.branch || "")
        .trim()
        .slice(0, MAX_RETRIEVED_FILE_BRANCH_LENGTH);
      const reason = String(value?.reason || "")
        .trim()
        .slice(0, MAX_RETRIEVED_FILE_REASON_LENGTH);

      const key = `${filePath}::${branch || "main"}::${status}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        filePath,
        status,
        ...(branch ? { branch } : {}),
        ...(reason ? { reason } : {}),
      } satisfies RetrievedFileMetadata;
    })
    .filter(Boolean) as RetrievedFileMetadata[];

  return normalized.length ? normalized.slice(0, MAX_RETRIEVED_FILES) : undefined;
}

function normalizeRetrievalNote(input: unknown): string | undefined {
  const trimmed = String(input || "").trim();
  return trimmed ? trimmed.slice(0, MAX_RETRIEVAL_NOTE_LENGTH) : undefined;
}

function normalizeAgentMessage(message: AgentMessage): AgentMessage {
  return {
    ...message,
    content: normalizeMessageContent(message.content, message.role),
    retrievedFiles: normalizeRetrievedFiles(message.retrievedFiles),
    retrievalMode: normalizeRetrievalMode(message.retrievalMode),
    retrievalNote: normalizeRetrievalNote(message.retrievalNote),
  };
}

export function appendMessage(
  session: AgentSession,
  message: AgentMessage,
): AgentSession {
  const normalizedMessage = normalizeAgentMessage(message);
  if (!normalizedMessage.content) return session;

  return {
    ...session,
    recentMessages: [...session.recentMessages, normalizedMessage].slice(
      -MAX_RECENT_MESSAGES,
    ),
    updatedAt: Date.now(),
    messageCount: Math.max(session.messageCount + 1, session.recentMessages.length + 1),
  };
}

export function estimateSessionTokens(session: AgentSession): number {
  const summaryText = session.summary
    ? [
      session.summary.summary,
      ...session.summary.keyConcepts,
      ...session.summary.unresolvedQuestions,
      ...session.summary.evidenceFiles,
    ].join("\n")
    : "";
  const messagesText = session.recentMessages
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join("\n");
  return estimateTokens(`${summaryText}\n${messagesText}`);
}

export function needsCompression(session: AgentSession): boolean {
  if (session.recentMessages.length >= COMPRESSION_MESSAGE_THRESHOLD) return true;
  return estimateSessionTokens(session) >= COMPRESSION_TOKEN_THRESHOLD;
}

export function buildCompressionChunk(
  session: AgentSession,
): { toCompress: AgentMessage[]; keep: AgentMessage[] } {
  const keep = session.recentMessages.slice(-MAX_CONTEXT_MESSAGES);
  const toCompress = session.recentMessages.slice(
    0,
    Math.max(0, session.recentMessages.length - keep.length),
  );
  return { toCompress, keep };
}

export function applyCompressionResult(
  session: AgentSession,
  keepMessages: AgentMessage[],
  summary: SessionSummary,
): AgentSession {
  return {
    ...session,
    summary,
    recentMessages: keepMessages.slice(-MAX_RECENT_MESSAGES),
    compressedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function extractTopEvidenceFiles(messages: AgentMessage[]): string[] {
  const files = new Set<string>();
  messages.forEach((message) => {
    message.evidence?.forEach((evidence) => {
      if (evidence.filePath) files.add(evidence.filePath);
    });
  });
  return Array.from(files).slice(0, 8);
}

export function createLocalSummary(
  messages: AgentMessage[],
  previousSummary: SessionSummary | null,
  language: "zh" | "en",
): SessionSummary {
  const userQuestions = messages
    .filter((item) => item.role === "user")
    .map((item) => item.content.trim())
    .filter(Boolean)
    .slice(-6);
  const assistantAnswers = messages
    .filter((item) => item.role === "assistant")
    .map((item) => item.content.trim())
    .filter(Boolean)
    .slice(-6);

  const summaryText = language === "zh"
    ? `已讨论 ${userQuestions.length} 个问题，最近重点：${userQuestions.slice(-3).join("；") || "暂无"}。`
    : `Discussed ${userQuestions.length} questions. Recent focus: ${userQuestions.slice(-3).join("; ") || "N/A"}.`;

  const unresolvedQuestions = userQuestions
    .slice(-3)
    .filter(
      (question) =>
        !assistantAnswers.some((answer) =>
          answer.toLowerCase().includes(question.slice(0, 12).toLowerCase()),
        ),
    );

  return {
    summary: previousSummary?.summary
      ? `${previousSummary.summary}\n${summaryText}`.slice(0, 1200)
      : summaryText.slice(0, 1200),
    keyConcepts: previousSummary?.keyConcepts?.slice(0, 8) || [],
    unresolvedQuestions: unresolvedQuestions.slice(0, 6),
    evidenceFiles: extractTopEvidenceFiles(messages),
    updatedAt: Date.now(),
  };
}

export function getContextMessages(session: AgentSession): AgentMessage[] {
  return session.recentMessages.slice(-MAX_CONTEXT_MESSAGES);
}
