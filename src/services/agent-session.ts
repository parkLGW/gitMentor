import { StorageKeys } from "@/constants/storage";
import type {
  AgentMessage,
  AgentSession,
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
        ? data.recentMessages.slice(-MAX_RECENT_MESSAGES)
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
    recentMessages: session.recentMessages.slice(-MAX_RECENT_MESSAGES),
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

export function appendMessage(
  session: AgentSession,
  message: AgentMessage,
): AgentSession {
  const content = normalizeMessageContent(message.content, message.role);
  if (!content) return session;

  const normalizedMessage: AgentMessage = {
    ...message,
    content,
  };

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
