import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { StorageKeys } from "@/constants/storage";
import {
  appendMessage,
  applyCompressionResult,
  buildCompressionChunk,
  createEmptyAgentSession,
  createLocalSummary,
  getContextMessages,
  getRepoKey,
  loadAgentSession,
  needsCompression,
  persistAgentSession,
} from "@/services/agent-session";
import {
  buildGithubBlobUrl,
  buildRetrievalUiNote,
  getAnalyzedFiles,
  getFallbackRelatedFiles,
} from "@/services/agent-chat-view";
import { buildAgentProgressText } from "@/services/agent-progress";
import {
  AGENT_CHAT_REQUEST_TIMEOUT_MS,
  AGENT_SUMMARY_TIMEOUT_MS as SUMMARY_TIMEOUT_MS,
} from "@/services/agent-timeouts";
import type {
  AgentProgressEvent,
  AgentChatResponsePayload,
  AgentMessage,
  AgentSession,
  SessionSummary,
} from "@/types/agent";
import type { SourceMapOutput } from "@/prompts/types";

interface AgentTabProps {
  repo: { owner: string; name: string };
  language: "zh" | "en";
}

interface AgentSummaryResponse {
  summary?: SessionSummary;
}

type AgentChatStreamMessage =
  | { type: "progress"; progress?: AgentProgressEvent }
  | { type: "result"; data?: AgentChatResponsePayload }
  | { type: "error"; error?: string };

const MAX_RENDER_MESSAGES = 12;
const AGENT_CHAT_PORT_NAME = "gitmentor-agent-chat";

function buildId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseCacheData<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { data?: T };
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function buildSourceMapSummary(sourceMap: SourceMapOutput | null, language: "zh" | "en"): string {
  if (!sourceMap) return "";
  const moduleNames = sourceMap.coreModules.map((module) => module.name).slice(0, 6);
  const learningPath = sourceMap.learningPath.map((phase) => phase.title).slice(0, 4);
  const concepts = sourceMap.keyConcepts.map((concept) => concept.term).slice(0, 5);
  if (language === "zh") {
    return [
      `架构摘要：${sourceMap.architectureSummary || "暂无"}`,
      `核心模块：${moduleNames.join("、") || "暂无"}`,
      `学习路径：${learningPath.join(" -> ") || "暂无"}`,
      `关键概念：${concepts.join("、") || "暂无"}`,
    ].join("\n");
  }
  return [
    `Architecture: ${sourceMap.architectureSummary || "N/A"}`,
    `Core modules: ${moduleNames.join(", ") || "N/A"}`,
    `Learning path: ${learningPath.join(" -> ") || "N/A"}`,
    `Key concepts: ${concepts.join(", ") || "N/A"}`,
  ].join("\n");
}

function buildReadmeSummary(readme: string | null): string {
  if (!readme) return "";
  return readme.slice(0, 1800);
}

function formatAssistantAnswer(
  baseAnswer: string,
  suggestedNextSteps: string[],
  language: "zh" | "en",
): string {
  if (!suggestedNextSteps.length) return baseAnswer;
  const title = language === "zh" ? "下一步建议" : "Suggested next steps";
  const list = suggestedNextSteps.slice(0, 4).map((item) => `- ${item}`).join("\n");
  return `${baseAnswer}\n\n${title}:\n${list}`;
}

function stripRelatedFilesLine(text: string): string {
  return String(text || "")
    .replace(/(?:^|\n)\s*(相关文件|参考文件|Relevant files|Files)\s*[:：]\s*[^\n]+/gi, "")
    .trim();
}

function hasVisibleContent(text: string): boolean {
  return /[A-Za-z0-9\u4e00-\u9fff]/.test(String(text || ""));
}

function sanitizeAssistantBody(text: string, language: "zh" | "en"): string {
  let value = stripRelatedFilesLine(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
  if (!value) return "";

  if (language === "zh") {
    value = value.replace(/^(先看|建议先看|先读|先阅读|可以先看|先从|先看一下)\s*/u, "").trim();
  } else {
    value = value.replace(/^(read first|start with|you can start with|first, read)\s*/i, "").trim();
  }

  return value;
}

function upsertAssistantMessage(
  session: AgentSession,
  messageId: string,
  payload: {
    content: string;
    confidence?: AgentMessage["confidence"];
    evidence?: AgentMessage["evidence"];
    retrievedFiles?: AgentMessage["retrievedFiles"];
    retrievalMode?: AgentMessage["retrievalMode"];
    retrievalNote?: AgentMessage["retrievalNote"];
  },
): AgentSession {
  const index = session.recentMessages.findIndex((item) => item.id === messageId);
  if (index >= 0) {
    const updated = [...session.recentMessages];
    updated[index] = {
      ...updated[index],
      ...payload,
    };
    return {
      ...session,
      recentMessages: updated,
      updatedAt: Date.now(),
    };
  }

  const next: AgentMessage = {
    id: messageId,
    role: "assistant",
    content: payload.content,
    createdAt: Date.now(),
    confidence: payload.confidence,
    evidence: payload.evidence,
    retrievedFiles: payload.retrievedFiles,
    retrievalMode: payload.retrievalMode,
    retrievalNote: payload.retrievalNote,
  };
  const recentMessages = [...session.recentMessages, next].slice(-MAX_RENDER_MESSAGES);
  return {
    ...session,
    recentMessages,
    messageCount: Math.max(session.messageCount + 1, recentMessages.length),
    updatedAt: Date.now(),
  };
}

function AgentTab({ repo, language }: AgentTabProps) {
  const repoKey = useMemo(() => getRepoKey(repo), [repo]);
  const isZh = language === "zh";
  const [session, setSession] = useState<AgentSession>(() => createEmptyAgentSession(repoKey));
  const [sourceMapSummary, setSourceMapSummary] = useState("");
  const [readmeSummary, setReadmeSummary] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [streamingStatusText, setStreamingStatusText] = useState<string | null>(null);

  const quickPrompts = useMemo(
    () =>
      isZh
        ? [
          "这个项目最推荐先读哪三个文件？",
          "我刚入门，这个项目的主流程是怎样的？",
          "这个仓库里最容易看不懂的点是什么？",
        ]
        : [
          "What are the first three files I should read?",
          "Explain the main flow of this project for a beginner.",
          "What are the hardest parts to understand in this repo?",
        ],
    [isZh],
  );

  const sendRuntimeMessage = useCallback(
    <T,>(message: Record<string, unknown>, timeoutMs = 20000) =>
      new Promise<T>((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
          reject(new Error("Runtime messaging unavailable"));
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("REQUEST_TIMEOUT"));
        }, timeoutMs);
        chrome.runtime.sendMessage(message, (response: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve(response);
        });
      }),
    [],
  );

  const streamAgentChat = useCallback(
    (
      payload: Record<string, unknown>,
      onProgress: (progress: AgentProgressEvent) => void,
      idleTimeoutMs = AGENT_CHAT_REQUEST_TIMEOUT_MS,
    ) =>
      new Promise<AgentChatResponsePayload>((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.connect) {
          reject(new Error("Runtime messaging unavailable"));
          return;
        }

        const port = chrome.runtime.connect({ name: AGENT_CHAT_PORT_NAME });
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const clearTimer = () => {
          if (!timer) return;
          clearTimeout(timer);
          timer = null;
        };

        const resetTimer = () => {
          clearTimer();
          timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error("REQUEST_TIMEOUT"));
          }, idleTimeoutMs);
        };

        const handleMessage = (message: AgentChatStreamMessage) => {
          if (settled) return;
          resetTimer();
          if (message?.type === "progress" && message.progress) {
            onProgress(message.progress);
            return;
          }
          if (message?.type === "result") {
            settled = true;
            cleanup();
            if (!message.data) {
              reject(new Error("Invalid agent response"));
              return;
            }
            resolve(message.data);
            return;
          }
          if (message?.type === "error") {
            settled = true;
            cleanup();
            reject(new Error(message.error || "Agent chat failed"));
          }
        };

        const handleDisconnect = () => {
          if (settled) return;
          settled = true;
          const runtimeError = chrome.runtime.lastError;
          cleanup();
          reject(new Error(runtimeError?.message || "Agent chat disconnected"));
        };

        const cleanup = () => {
          clearTimer();
          port.onMessage.removeListener(handleMessage);
          port.onDisconnect.removeListener(handleDisconnect);
          try {
            port.disconnect();
          } catch {
            // Ignore disconnect races after the port is already closed.
          }
        };

        port.onMessage.addListener(handleMessage);
        port.onDisconnect.addListener(handleDisconnect);
        resetTimer();
        port.postMessage({
          action: "startAgentChat",
          payload,
        });
      }),
    [],
  );

  useEffect(() => {
    const loaded = loadAgentSession(repoKey);
    setSession(loaded);
    setError(null);
    setEditingMessageId(null);
    setEditingText("");
    setStreamingStatusText(null);
  }, [repoKey]);

  useEffect(() => {
    const sourceMapCache = parseCacheData<SourceMapOutput>(
      localStorage.getItem(StorageKeys.sourceMap(repo, language)),
    );
    setSourceMapSummary(buildSourceMapSummary(sourceMapCache, language));

    const cachedReadme = parseCacheData<string>(
      localStorage.getItem(StorageKeys.githubCache(repo.owner, repo.name, "readme")),
    );
    setReadmeSummary(buildReadmeSummary(cachedReadme));
  }, [language, repo]);

  const summarizeIfNeeded = useCallback(
    async (nextSession: AgentSession): Promise<AgentSession> => {
      if (!needsCompression(nextSession)) return nextSession;
      const { toCompress, keep } = buildCompressionChunk(nextSession);
      if (toCompress.length < 2) return nextSession;

      try {
        const response = await sendRuntimeMessage<AgentSummaryResponse>(
          {
            action: "summarizeAgentSession",
            repo,
            language,
            previousSummary: nextSession.summary,
            messages: toCompress,
          },
          SUMMARY_TIMEOUT_MS,
        );
        const summary = response?.summary ||
          createLocalSummary(toCompress, nextSession.summary, language);
        return applyCompressionResult(nextSession, keep, summary);
      } catch {
        const localSummary = createLocalSummary(
          toCompress,
          nextSession.summary,
          language,
        );
        return applyCompressionResult(nextSession, keep, localSummary);
      }
    },
    [language, repo, sendRuntimeMessage],
  );

  const latestUserMessageId = useMemo(() => {
    for (let index = session.recentMessages.length - 1; index >= 0; index--) {
      const message = session.recentMessages[index];
      if (message.role === "user") return message.id;
    }
    return null;
  }, [session.recentMessages]);

  const sendQuestion = useCallback(
    async (questionText: string, baseSession?: AgentSession) => {
      const question = questionText.trim();
      if (!question || sending) return;
      const activeSession = baseSession || session;

      const userMessage: AgentMessage = {
        id: buildId("user"),
        role: "user",
        content: question,
        createdAt: Date.now(),
      };

      setSending(true);
      setError(null);
      setEditingMessageId(null);
      setEditingText("");
      setStreamingStatusText(isZh ? "思考中..." : "Thinking...");

      const sessionWithUser = appendMessage(activeSession, userMessage);
      const assistantId = buildId("assistant");
      const streamingSession = upsertAssistantMessage(
        sessionWithUser,
        assistantId,
        {
          content: isZh ? "思考中..." : "Thinking...",
          confidence: "low",
        },
      );
      setSession(streamingSession);

      try {
        const data = await streamAgentChat(
          {
            repo,
            language,
            question,
            sourceMapSummary,
            readmeSummary,
            sessionSummary: sessionWithUser.summary,
            recentMessages: getContextMessages(sessionWithUser),
          },
          (progress) => {
            const progressText = buildAgentProgressText(progress, language);
            setStreamingStatusText(progressText);
            setSession((currentSession) =>
              upsertAssistantMessage(currentSession, assistantId, {
                content: progressText,
                confidence: "low",
              })
            );
          },
          AGENT_CHAT_REQUEST_TIMEOUT_MS,
        );

        const finalAnswer = formatAssistantAnswer(
          data.answer.trim() || (isZh ? "暂无回答。" : "No response."),
          data.suggestedNextSteps || [],
          language,
        );
        const sanitizedAnswer = sanitizeAssistantBody(finalAnswer, language);
        const finalContent = hasVisibleContent(sanitizedAnswer)
          ? sanitizedAnswer
          : (isZh ? "见相关文件。" : "See related files.");
        let nextSession = upsertAssistantMessage(
          sessionWithUser,
          assistantId,
          {
            content: finalContent,
            confidence: data.confidence,
            evidence: data.evidence,
            retrievedFiles: data.retrievedFiles,
            retrievalMode: data.retrievalMode,
            retrievalNote: data.retrievalNote,
          },
        );
        nextSession = await summarizeIfNeeded(nextSession);
        setSession(nextSession);
        persistAgentSession(nextSession);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const isTimeout = message.includes("REQUEST_TIMEOUT");
        const fallbackText = isTimeout
          ? (isZh ? "请求超时，请重试。" : "Request timed out. Please retry.")
          : (isZh
            ? `回答失败：${message}`
            : `Request failed: ${message}`);
        const nextSession = upsertAssistantMessage(
          sessionWithUser,
          assistantId,
          {
            content: fallbackText,
            confidence: "low",
          },
        );
        setSession(nextSession);
        persistAgentSession(nextSession);
        setError(message);
      } finally {
        setSending(false);
        setStreamingStatusText(null);
      }
    },
    [
      isZh,
      language,
      readmeSummary,
      repo,
      sending,
      session,
      sourceMapSummary,
      streamAgentChat,
      summarizeIfNeeded,
    ],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    setInput("");
    void sendQuestion(question);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    void sendQuestion(question);
  };

  const handleResetSession = () => {
    const empty = createEmptyAgentSession(repoKey);
    setSession(empty);
    setError(null);
    setEditingMessageId(null);
    setEditingText("");
    setStreamingStatusText(null);
    persistAgentSession(empty);
  };

  const handleStartEdit = (message: AgentMessage) => {
    setEditingMessageId(message.id);
    setEditingText(message.content);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleResendEditedMessage = () => {
    if (!editingMessageId || sending) return;
    const nextQuestion = editingText.trim();
    if (!nextQuestion) return;

    const targetIndex = session.recentMessages.findIndex(
      (message) => message.id === editingMessageId && message.role === "user",
    );
    if (targetIndex < 0) return;

    const baseMessages = session.recentMessages.slice(0, targetIndex);
    const truncatedSession: AgentSession = {
      ...session,
      recentMessages: baseMessages,
      messageCount: baseMessages.length,
      updatedAt: Date.now(),
    };

    setEditingMessageId(null);
    setEditingText("");
    setSession(truncatedSession);
    persistAgentSession(truncatedSession);
    void sendQuestion(nextQuestion, truncatedSession);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {isZh
            ? `仓库会话：${repo.owner}/${repo.name}`
            : `Session: ${repo.owner}/${repo.name}`}
        </div>
        <button
          onClick={handleResetSession}
          className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 transition"
        >
          {isZh ? "重置会话" : "Reset"}
        </button>
      </div>

      {session.summary?.summary && (
        <div className="text-xs border border-gray-200 rounded p-2 bg-gray-50 text-gray-600">
          <p className="font-medium mb-1">{isZh ? "会话摘要" : "Session Summary"}</p>
          <p className="whitespace-pre-line">{session.summary.summary}</p>
        </div>
      )}

      <div className="border border-gray-200 rounded h-[340px] overflow-y-auto p-3 space-y-3 bg-white">
        {session.recentMessages.length === 0 ? (
          <p className="text-sm text-gray-500">
            {isZh
              ? "开始提问吧，我会结合当前仓库信息回答。"
              : "Ask anything about this repo. I will answer with repo context."}
          </p>
        ) : (
          session.recentMessages.map((message) => {
            const isLatestUser =
              message.role === "user" && message.id === latestUserMessageId;
            const isEditing = editingMessageId === message.id;
            const isUser = message.role === "user";
            const analyzedFiles = isUser ? [] : getAnalyzedFiles(message);
            const relatedFiles = isUser || analyzedFiles.length > 0
              ? []
              : getFallbackRelatedFiles(message);
            const retrievalUiNote = isUser ? null : buildRetrievalUiNote(message, language);

            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded p-2 text-sm ${
                    isUser
                      ? "bg-blue-600 text-white"
                      : "bg-gray-50 text-gray-800 border border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {!isEditing && <p className="whitespace-pre-line flex-1">{message.content}</p>}
                    {isLatestUser && !isEditing && (
                      <button
                        onClick={() => handleStartEdit(message)}
                        disabled={sending}
                        className={`text-[11px] px-2 py-0.5 rounded disabled:opacity-50 ${
                          isUser
                            ? "bg-white/20 hover:bg-white/30 text-white"
                            : "bg-white/70 hover:bg-white text-blue-700"
                        }`}
                      >
                        {isZh ? "编辑" : "Edit"}
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <div className="mt-1 space-y-1">
                      <textarea
                        rows={2}
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        className="w-full border border-blue-200 rounded px-2 py-1 text-xs text-gray-800 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={handleCancelEdit}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                        >
                          {isZh ? "取消" : "Cancel"}
                        </button>
                        <button
                          onClick={handleResendEditedMessage}
                          disabled={sending || !editingText.trim()}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
                        >
                          {isZh ? "重新发送" : "Resend"}
                        </button>
                      </div>
                    </div>
                  )}
                  {retrievalUiNote && (
                    <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {retrievalUiNote}
                    </p>
                  )}
                  {(analyzedFiles.length > 0 || relatedFiles.length > 0) && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] text-gray-500">
                        {analyzedFiles.length > 0
                          ? (isZh ? "已分析文件" : "Analyzed files")
                          : (isZh ? "相关文件" : "Related files")}
                      </p>
                      {(analyzedFiles.length > 0 ? analyzedFiles : relatedFiles).map((item, index) => {
                        const filePath = typeof item === "string" ? item : item.filePath;
                        const branch = typeof item === "string" ? undefined : item.branch;
                        return (
                          <button
                            key={`${message.id}_path_${index}`}
                            className="inline-block mr-1 mb-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                            onClick={() => {
                              if (!filePath) return;
                              window.open(
                                buildGithubBlobUrl(repo, filePath, branch),
                                "_blank",
                              );
                            }}
                          >
                            {filePath}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {message.evidence && message.evidence.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {message.evidence
                        .filter((item) => item.reason !== "related_file")
                        .slice(0, 2)
                        .map((item, index) => (
                          <button
                            key={`${message.id}_${index}`}
                            className="block text-left text-xs text-blue-700 hover:underline"
                            onClick={() => {
                              if (!item.filePath) return;
                              window.open(
                                buildGithubBlobUrl(repo, item.filePath),
                                "_blank",
                              );
                            }}
                          >
                            {item.filePath || (isZh ? "证据片段" : "Evidence")} · {item.reason}
                          </button>
                        ))}
                    </div>
                  )}
                  {message.role === "assistant" && message.confidence && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {isZh ? "置信度" : "Confidence"}: {message.confidence}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <LoadingSpinner size="sm" />
            <span>{streamingStatusText || (isZh ? "思考中..." : "Thinking...")}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void sendQuestion(prompt)}
            disabled={sending}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
          rows={3}
          placeholder={isZh ? "输入你不理解的问题..." : "Ask what you do not understand..."}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {isZh
              ? "默认先使用 README + 源码地图 + 会话摘要；需要时会补充抓取 GitHub 源码"
              : "Starts with README, source map, and session summary; fetches GitHub code when needed"}
          </p>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {isZh ? "发送" : "Send"}
          </button>
        </div>
      </form>

      {error && (
        <div className="text-xs text-red-600 border border-red-200 bg-red-50 rounded p-2">
          {error}
        </div>
      )}
    </div>
  );
}

export default AgentTab;
