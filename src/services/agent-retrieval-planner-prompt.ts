import type { AgentChatRequestPayload, SessionSummary } from "../types/agent.js"

function buildSessionSummaryText(summary: SessionSummary | null): string {
  if (!summary) return "None"

  return [
    String(summary.summary || "").slice(0, 500),
    `Key concepts: ${(summary.keyConcepts || []).slice(0, 6).join(", ")}`,
    `Unresolved: ${(summary.unresolvedQuestions || []).slice(0, 4).join(", ")}`,
    `Evidence files: ${(summary.evidenceFiles || []).slice(0, 6).join(", ")}`,
  ].join("\n")
}

function buildHistoryText(payload: AgentChatRequestPayload): string {
  return payload.recentMessages
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${String(message.content || "").slice(0, 220)}`)
    .join("\n")
}

export function buildAgentRetrievalPlannerPrompt(
  payload: AgentChatRequestPayload,
  lang: "zh" | "en",
): string {
  const historyText = buildHistoryText(payload)
  const summaryText = buildSessionSummaryText(payload.sessionSummary || null)

  if (lang === "zh") {
    return `你要先判断是否真的需要读取 GitHub 源码文件才能回答问题。

仓库：${payload.repo.owner}/${payload.repo.name}

README 摘要：
${String(payload.readmeSummary || "暂无").slice(0, 900)}

源码地图摘要：
${String(payload.sourceMapSummary || "暂无").slice(0, 900)}

历史会话摘要：
${summaryText}

最近对话：
${historyText || "暂无"}

用户问题：
${payload.question}

仅返回 JSON：
{
  "needsCodeContext": true,
  "targetFiles": ["src/path/file.ts"],
  "reason": "为什么需要或不需要源码",
  "confidence": "low|medium|high"
}

规则：
1) 如果问题是在问仓库内部的配置、实现、调用链、集成方式、鉴权、报错原因、文件定位、请求构造、环境变量、模型/API 接入是否正确，优先把 needsCodeContext 设为 true。
2) 如果用户是在让你检查、确认、定位、分析、排查某个仓库内问题，通常需要源码；即使 README 或源码地图提到了相关概念，也不代表信息已经足够。
3) 只有当你能仅凭 README、源码地图、会话摘要稳定回答时，才把 needsCodeContext 设为 false。
4) targetFiles 只写最相关的仓库相对路径，最多 5 个；如果不能完全确定，也要尽量给出最可能相关的文件，而不是因为不确定就直接返回空数组。
5) 不要输出 markdown 代码块。`
  }

  return `Decide whether GitHub source files are actually needed to answer the user's question.

Repository: ${payload.repo.owner}/${payload.repo.name}

README summary:
${String(payload.readmeSummary || "N/A").slice(0, 900)}

Source map summary:
${String(payload.sourceMapSummary || "N/A").slice(0, 900)}

Session summary:
${summaryText}

Recent turns:
${historyText || "N/A"}

User question:
${payload.question}

Return JSON only:
{
  "needsCodeContext": true,
  "targetFiles": ["src/path/file.ts"],
  "reason": "why code is or is not needed",
  "confidence": "low|medium|high"
}

Rules:
1) If the question is about repository-internal configuration, implementation details, call chains, integration points, auth, error diagnosis, or file location, request construction, environment variables, or whether a model/API wiring is correct, prefer needsCodeContext=true.
2) If the user is asking you to inspect, verify, locate, analyze, or debug something inside the repository, code context is usually required; even if the README or source map mentions the topic, that does not mean the summaries are sufficient.
3) Set needsCodeContext to false only when the README, source map, and session summary are enough for a reliable answer without reading concrete files.
4) targetFiles must be repo-relative paths, max 5; if you are not fully sure, still provide the most likely relevant files instead of returning an empty array too early.
5) Do not output markdown code fences.`
}
