// Service Worker for GitMentor
declare const chrome: any
import type { AnalysisEvidence, ConfidenceLevel, DeepFileAnalysisResult, LearningMission } from '@/types/learning'
import type { SourceMapOutput } from '@/prompts/types'
import { createLearningMission } from '@/services/learning-mission'
import { normalizeOpenAICompatibleBaseUrl, resolveProviderBaseUrl } from '@/services/llm-provider-config'
import { fetchRetrievedGithubFiles, flattenTreeFilePaths, parseRetrievalPlan, rankCandidateFiles } from '@/services/agent-code-context'
import { answerAgentQuestion, buildFastPathAgentAnswer, buildLocalFallbackAnswer } from '@/services/agent-chat-runtime'
import {
  buildAgentFinalAnswerPromptCompact,
  buildAgentFinalAnswerPromptLite,
  buildAgentIntentPrompt,
  buildAgentSufficiencyPrompt,
  normalizeAgentIntent,
  normalizeAgentSufficiencyDecision,
} from '@/services/agent-loop-prompts'
import { buildAgentRetrievalPlannerPrompt } from '@/services/agent-retrieval-planner-prompt'
import { executeAgentToolCalls, extractRepoPathHintsFromText } from '@/services/agent-tool-runtime'
import { resolveClaudeCompatibleMessagesUrl } from '@/services/claude-compatible-utils'
import { shouldFallbackCustomStreaming } from '@/services/custom-openai-utils'
import { withKeepAlive } from '@/services/extension-keepalive'
import { getDefaultBranch, getFullDirectoryTree, getGithubWebDirectoryPaths, getRawFileContent } from '@/services/github'
import { migrateLegacyLLMConfig } from '@/services/llm-config-migration'
import {
  readClaudeMessageStream,
  readOllamaJsonStream,
  readOpenAICompatibleStream,
} from '@/services/llm-stream'
import { parseLooseJson } from '@/services/llm-json'
import { normalizeDeepFileAnalysisResult } from '@/services/deep-file-analysis-normalizer'
import {
  AGENT_CODE_FETCH_TIMEOUT_MS,
  AGENT_FINAL_ANSWER_RETRY_TIMEOUT_MS,
  AGENT_FINAL_ANSWER_TIMEOUT_MS,
  AGENT_REPO_PATH_DISCOVERY_TIMEOUT_MS,
  AGENT_TOPIC_PATH_DISCOVERY_TIMEOUT_MS,
  AGENT_LLM_RETRY_TIMEOUT_MS,
  AGENT_LLM_TIMEOUT_MS,
  AGENT_PLANNER_TIMEOUT_MS,
  AGENT_SUMMARY_TIMEOUT_MS,
} from '@/services/agent-timeouts'
import { parseLooseAgentJson, unwrapNestedAgentJson } from '@/services/agent-response-parser'
import { buildOllamaChatBody } from '@/services/llm-request'
import type {
  AgentMessage,
  AgentChatRequestPayload,
  AgentChatResponsePayload,
  AgentProgressEvent,
  AgentRetrievalPlan,
  AgentIntent,
  AgentObservation,
  AgentCodeIndex,
  RetrievedFileContext,
  SessionSummary,
} from '@/types/agent'
import type { LLMConfig as StoredLLMConfig } from '@/types/llm'

const LLM_CONFIG_KEY = 'gitmentor_llm_config'

// Language type
type Language = 'zh' | 'en'
type StreamMode = 'openai-compatible' | 'claude' | 'ollama' | null

// Translations for analysis results
const translations = {
  zh: {
    fileSummary: '文件摘要',
    type: '类型',
    lines: '行数',
    imports: '导入',
    functions: '函数',
    classes: '类',
    interfacesTypes: '接口/类型',
    todosFound: '发现 $count 个 TODO/FIXME 注释',
    keyFunctions: '关键函数',
    classesLabel: '类',
    aiDeepAnalysis: 'AI 深度分析',
    usesLLM: '使用您配置的 LLM 进行详细分析',
    llmNotConfigured: 'LLM 未配置',
    configureApiKey: '要使用 AI 深度分析，请先配置您的 API 密钥',
    clickExtensionIcon: '点击 GitMentor 扩展图标',
    goToSettings: '进入设置标签页',
    enterApiKey: '输入您的 API 密钥 (OpenAI、Anthropic、DeepSeek 等)',
    saveAndRetry: '保存并重试',
    aiAnalysis: 'AI 分析',
    keyComponents: '关键组件',
    dependencies: '依赖',
    complexity: '复杂度',
    suggestions: '建议',
    askQuestion: '提问',
    askButton: '提问',
    fileType: '文件',
  },
  en: {
    fileSummary: 'File Summary',
    type: 'Type',
    lines: 'Lines',
    imports: 'Imports',
    functions: 'Functions',
    classes: 'Classes',
    interfacesTypes: 'Interfaces/Types',
    todosFound: 'Found $count TODO/FIXME comments',
    keyFunctions: 'Key Functions',
    classesLabel: 'Classes',
    aiDeepAnalysis: 'AI Deep Analysis',
    usesLLM: 'Uses your configured LLM for detailed analysis',
    llmNotConfigured: 'LLM Not Configured',
    configureApiKey: 'To use AI deep analysis, please configure your API key',
    clickExtensionIcon: 'Click the GitMentor extension icon',
    goToSettings: 'Go to Settings tab',
    enterApiKey: 'Enter your API key (OpenAI, Anthropic, DeepSeek, etc.)',
    saveAndRetry: 'Save and try again',
    aiAnalysis: 'AI Analysis',
    keyComponents: 'Key Components',
    dependencies: 'Dependencies',
    complexity: 'Complexity',
    suggestions: 'Suggestions',
    askQuestion: 'Ask a Question',
    askButton: 'Ask',
    fileType: 'file',
  },
}

function getAnalysisText(lang: Language, key: keyof typeof translations.en, vars?: Record<string, string | number>): string {
  let text = translations[lang][key]
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`$${k}`, String(v))
    })
  }
  return text
}

const DEFAULT_LLM_TIMEOUT_MS = 30000
const CONCEPT_LLM_TIMEOUT_MS = 55000
const AGENT_CODE_CONTEXT_FILES_LIMIT = 8
const AGENT_CODE_CONTEXT_CHARS_PER_FILE = 2200
const AGENT_CODE_CONTEXT_CHARS_PER_FILE_LITE = 1000
const AGENT_DISCOVERY_TREE_DEPTH = 3
const AGENT_REPO_PATH_HINTS_LIMIT = 250
const AGENT_CHAT_PORT_NAME = 'gitmentor-agent-chat'

// Get LLM config from storage
async function getLLMConfig(): Promise<StoredLLMConfig | null> {
  return new Promise((resolve) => {
    // 使用与 popup 相同的键名
    chrome.storage.local.get([LLM_CONFIG_KEY], (result: any) => {
      resolve(result[LLM_CONFIG_KEY] || null)
    })
  })
}

// Safe JSON parse - handles markdown code blocks
function safeParseJSON(text: string): any {
  return parseLooseJson(text)
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  const value = String(raw || '').toLowerCase()
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'low'
}

function normalizeEvidence(input: unknown): AnalysisEvidence[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const value = item as Record<string, unknown>
      const snippet = String(value?.snippet || '').slice(0, 260)
      const reason = String(value?.reason || '').slice(0, 220)
      if (!snippet || !reason) return null
      return {
        filePath: value?.filePath ? String(value.filePath) : undefined,
        lineStart: typeof value?.lineStart === 'number' ? value.lineStart : undefined,
        snippet,
        reason,
      } satisfies AnalysisEvidence
    })
    .filter(Boolean) as AnalysisEvidence[]
}

function normalizeStringList(input: unknown, limit: number): string[] {
  if (!Array.isArray(input)) return []
  const deduped = Array.from(
    new Set(
      input
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
  return deduped.slice(0, limit)
}

function buildHeuristicSummary(
  messages: AgentMessage[],
  previousSummary: SessionSummary | null,
  lang: Language,
): SessionSummary {
  const userMessages = messages
    .filter((item) => item.role === 'user')
    .map((item) => item.content.trim())
    .filter(Boolean)
  const assistantMessages = messages
    .filter((item) => item.role === 'assistant')
    .map((item) => item.content.trim())
    .filter(Boolean)
  const evidenceFiles = normalizeStringList(
    messages.flatMap((item) => (item.evidence || []).map((evidence) => evidence.filePath || '')),
    8,
  )
  const unresolved = userMessages
    .slice(-4)
    .filter((question) => !assistantMessages.some((answer) => answer.includes(question.slice(0, 10))))
    .slice(0, 6)

  const brief = lang === 'zh'
    ? `已讨论 ${userMessages.length} 个问题，最近关注：${userMessages.slice(-3).join('；') || '暂无'}。`
    : `Discussed ${userMessages.length} questions. Recent focus: ${userMessages.slice(-3).join('; ') || 'N/A'}.`

  return {
    summary: `${previousSummary?.summary || ''}\n${brief}`.trim().slice(0, 1200),
    keyConcepts: previousSummary?.keyConcepts?.slice(0, 8) || [],
    unresolvedQuestions: unresolved,
    evidenceFiles,
    updatedAt: Date.now(),
  }
}

function parseAgentChatPayload(rawPayload: Partial<AgentChatRequestPayload>): AgentChatRequestPayload {
  return {
    repo: {
      owner: String(rawPayload.repo?.owner || ''),
      name: String(rawPayload.repo?.name || ''),
    },
    language: rawPayload.language === 'zh' ? 'zh' : 'en',
    question: String(rawPayload.question || ''),
    sourceMapSummary: String(rawPayload.sourceMapSummary || ''),
    readmeSummary: String(rawPayload.readmeSummary || ''),
    sessionSummary: (rawPayload.sessionSummary || null) as SessionSummary | null,
    recentMessages: Array.isArray(rawPayload.recentMessages)
      ? rawPayload.recentMessages as AgentMessage[]
      : [],
  }
}

function buildAgentSessionSummaryText(summary: SessionSummary | null): string {
  if (!summary) return ''
  return [
    String(summary.summary || '').slice(0, 500),
    `Key concepts: ${(summary.keyConcepts || []).slice(0, 6).join(', ')}`,
    `Unresolved: ${(summary.unresolvedQuestions || []).slice(0, 4).join(', ')}`,
    `Evidence files: ${(summary.evidenceFiles || []).slice(0, 6).join(', ')}`,
  ].join('\n')
}

async function discoverAgentFiles(
  payload: AgentChatRequestPayload,
  plan: AgentRetrievalPlan,
): Promise<string[]> {
  const preferredPaths = plan.targetFiles.slice(0, AGENT_CODE_CONTEXT_FILES_LIMIT)
  const tree = await getFullDirectoryTree(
    payload.repo.owner,
    payload.repo.name,
    AGENT_DISCOVERY_TREE_DEPTH,
  ).catch(() => [])
  const repoPaths = flattenTreeFilePaths(tree)

  if (repoPaths.length === 0) {
    return preferredPaths
  }

  const ranked = rankCandidateFiles({
    question: `${payload.question}\n${plan.reason || ''}`,
    sourceMapSummary: payload.sourceMapSummary,
    readmeSummary: payload.readmeSummary,
    sessionSummary: buildAgentSessionSummaryText(payload.sessionSummary || null),
    repoPaths,
    preferredPaths,
  })

  return Array.from(new Set([
    ...preferredPaths,
    ...ranked,
  ])).slice(0, AGENT_CODE_CONTEXT_FILES_LIMIT)
}

function buildAgentChatPrompt(payload: AgentChatRequestPayload, lang: Language): string {
  const historyText = payload.recentMessages
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${String(message.content || '').slice(0, 240)}`)
    .join('\n')

  const summaryText = payload.sessionSummary
    ? [
      String(payload.sessionSummary.summary || '').slice(0, 500),
      `Key concepts: ${(payload.sessionSummary.keyConcepts || []).slice(0, 6).join(', ')}`,
      `Unresolved: ${(payload.sessionSummary.unresolvedQuestions || []).slice(0, 4).join(', ')}`,
      `Evidence files: ${(payload.sessionSummary.evidenceFiles || []).slice(0, 6).join(', ')}`,
    ].join('\n')
    : 'None'

  if (lang === 'zh') {
    return `你是 GitHub 开源学习助手。面向初学者，用简洁中文回答。

仓库：${payload.repo.owner}/${payload.repo.name}

README 摘要：
${String(payload.readmeSummary || '暂无').slice(0, 900)}

源码地图摘要：
${String(payload.sourceMapSummary || '暂无').slice(0, 900)}

历史会话摘要：
${summaryText}

最近对话：
${historyText || '暂无'}

用户问题：
${payload.question}

请仅返回 JSON：
{
  "answer": "2-6 句可执行建议，不要固定以“先看”开头",
  "confidence": "low|medium|high",
  "evidence": [
    {"filePath": "path/to/file", "lineStart": 1, "snippet": "短片段", "reason": "为什么相关"}
  ],
  "suggestedNextSteps": ["下一步 1", "下一步 2"]
}

规则：
1) 不确定时明确说不确定，并给保守建议。
2) 尽量给 evidence；没有证据时 confidence 至少降为 low。
3) 不要输出 markdown 代码块。`
  }

  return `You are a beginner-friendly GitHub learning assistant. Answer concisely.

Repository: ${payload.repo.owner}/${payload.repo.name}

README summary:
${String(payload.readmeSummary || 'N/A').slice(0, 900)}

Source map summary:
${String(payload.sourceMapSummary || 'N/A').slice(0, 900)}

Session summary:
${summaryText}

Recent turns:
${historyText || 'N/A'}

User question:
${payload.question}

Return JSON only:
{
  "answer": "2-6 actionable sentences, avoid starting with \"read first\"",
  "confidence": "low|medium|high",
  "evidence": [
    {"filePath": "path/to/file", "lineStart": 1, "snippet": "short snippet", "reason": "why relevant"}
  ],
  "suggestedNextSteps": ["next step 1", "next step 2"]
}

Rules:
1) If uncertain, say so and give a conservative suggestion.
2) Prefer evidence; if no evidence, confidence should be low.
3) Do not output markdown code fences.`
}

function buildAgentChatPromptLite(payload: AgentChatRequestPayload, lang: Language): string {
  if (lang === 'zh') {
    return `你是 GitHub 学习助手。请用中文简洁回答。

仓库：${payload.repo.owner}/${payload.repo.name}
问题：${String(payload.question || '').slice(0, 280)}

仅返回 JSON：
{
  "answer": "2-4 句直接回答",
  "confidence": "low|medium|high",
  "evidence": [],
  "suggestedNextSteps": ["下一步 1"]
}`
  }
  return `You are a GitHub learning assistant. Answer briefly.

Repository: ${payload.repo.owner}/${payload.repo.name}
Question: ${String(payload.question || '').slice(0, 280)}

Return JSON only:
{
  "answer": "2-4 direct sentences",
  "confidence": "low|medium|high",
  "evidence": [],
  "suggestedNextSteps": ["next step 1"]
}`
}

function normalizeAgentResponse(
  raw: unknown,
  lang: Language,
): AgentChatResponsePayload {
  const value = unwrapNestedAgentJson(raw) || ((raw || {}) as Record<string, unknown>)
  const fallbackAnswer = lang === 'zh'
    ? '我暂时无法给出完整答案。建议先从 README 与源码地图中的核心模块开始。'
    : 'I cannot provide a complete answer right now. Start from README and the core modules in the source map.'
  const answer = String(value.answer || '').trim().slice(0, 1800) || fallbackAnswer
  const evidence = normalizeEvidence(value.evidence)
  let confidence = normalizeConfidence(value.confidence)
  if (evidence.length === 0) confidence = 'low'
  const suggestedNextSteps = normalizeStringList(value.suggestedNextSteps, 4)
  return {
    answer,
    confidence,
    evidence,
    suggestedNextSteps,
    source: 'ai',
  }
}

function buildAgentCodePrompt(
  payload: AgentChatRequestPayload,
  plan: AgentRetrievalPlan,
  retrievedFiles: RetrievedFileContext[],
  lang: Language,
  options?: { maxFiles?: number; maxCharsPerFile?: number },
): string {
  const fetchedFiles = retrievedFiles
    .filter((file) => file.status === 'fetched' && file.snippet)
    .slice(0, options?.maxFiles ?? AGENT_CODE_CONTEXT_FILES_LIMIT)

  const codeContext = fetchedFiles
    .map((file) => String(file.snippet || '').slice(0, options?.maxCharsPerFile ?? AGENT_CODE_CONTEXT_CHARS_PER_FILE))
    .join('\n\n')

  const failedFiles = retrievedFiles
    .filter((file) => file.status !== 'fetched')
    .map((file) => `${file.filePath}${file.reason ? ` (${file.reason})` : ''}`)
    .join(', ')

  const historyText = payload.recentMessages
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${String(message.content || '').slice(0, 220)}`)
    .join('\n')

  const summaryText = payload.sessionSummary
    ? [
      String(payload.sessionSummary.summary || '').slice(0, 500),
      `Key concepts: ${(payload.sessionSummary.keyConcepts || []).slice(0, 6).join(', ')}`,
      `Unresolved: ${(payload.sessionSummary.unresolvedQuestions || []).slice(0, 4).join(', ')}`,
    ].join('\n')
    : 'None'

  if (lang === 'zh') {
    return `你是 GitHub 开源学习助手。面向初学者，用简洁中文回答，并优先依据给定源码片段。

仓库：${payload.repo.owner}/${payload.repo.name}

检索原因：${plan.reason || '需要补充源码上下文'}
目标文件：${plan.targetFiles.join(', ') || '暂无'}

历史会话摘要：
${summaryText}

最近对话：
${historyText || '暂无'}

用户问题：
${payload.question}

README 摘要：
${String(payload.readmeSummary || '暂无').slice(0, 700)}

源码地图摘要：
${String(payload.sourceMapSummary || '暂无').slice(0, 700)}

已获取源码上下文：
${codeContext || '暂无'}

未成功获取的文件：
${failedFiles || '无'}

请仅返回 JSON：
{
  "answer": "2-6 句可执行建议，不要固定以“先看”开头",
  "confidence": "low|medium|high",
  "evidence": [
    {"filePath": "path/to/file", "lineStart": 1, "snippet": "短片段", "reason": "为什么相关"}
  ],
  "suggestedNextSteps": ["下一步 1", "下一步 2"]
}

规则：
1) 优先使用已获取源码上下文回答；如果仍不确定，要明确说明。
2) evidence 优先引用已获取文件。
3) 不要输出 markdown 代码块。`
  }

  return `You are a beginner-friendly GitHub learning assistant. Answer concisely and ground your answer in the provided code context.

Repository: ${payload.repo.owner}/${payload.repo.name}

Retrieval reason: ${plan.reason || 'Need additional code context'}
Target files: ${plan.targetFiles.join(', ') || 'N/A'}

Session summary:
${summaryText}

Recent turns:
${historyText || 'N/A'}

User question:
${payload.question}

README summary:
${String(payload.readmeSummary || 'N/A').slice(0, 700)}

Source map summary:
${String(payload.sourceMapSummary || 'N/A').slice(0, 700)}

Retrieved code context:
${codeContext || 'N/A'}

Files that could not be retrieved:
${failedFiles || 'None'}

Return JSON only:
{
  "answer": "2-6 actionable sentences, avoid starting with \"read first\"",
  "confidence": "low|medium|high",
  "evidence": [
    {"filePath": "path/to/file", "lineStart": 1, "snippet": "short snippet", "reason": "why relevant"}
  ],
  "suggestedNextSteps": ["next step 1", "next step 2"]
}

Rules:
1) Use the retrieved code context as your primary grounding.
2) Prefer evidence from fetched files.
3) Do not output markdown code fences.`
}

async function runAgentPromptWithFallback(params: {
  config: StoredLLMConfig
  lang: Language
  prompt: string
  litePrompt: string
  retryReason: string
  label: string
  maxTokens?: number
  retryMaxTokens?: number
  timeoutMs?: number
  retryTimeoutMs?: number
  stream?: boolean
}): Promise<AgentChatResponsePayload> {
  try {
    const response = await callLLM(params.config, params.prompt, {
      timeoutMs: params.timeoutMs ?? AGENT_LLM_TIMEOUT_MS,
      maxTokens: params.maxTokens ?? 360,
      label: params.label,
      stream: params.stream,
    })
    const parsed = unwrapNestedAgentJson(safeParseJSON(response)) || parseLooseAgentJson(response)
    return normalizeAgentResponse(parsed || { answer: response }, params.lang)
  } catch (firstError) {
    const firstMessage = firstError instanceof Error ? firstError.message : 'Agent chat failed'
    if (firstMessage !== 'REQUEST_TIMEOUT') {
      throw firstError
    }
  }

  if (params.litePrompt === params.prompt) {
    throw new Error('REQUEST_TIMEOUT')
  }

  const retryResponse = await callLLM(params.config, params.litePrompt, {
    timeoutMs: params.retryTimeoutMs ?? AGENT_LLM_RETRY_TIMEOUT_MS,
    maxTokens: params.retryMaxTokens ?? 220,
    label: `${params.label}:retry`,
    stream: params.stream,
  })
  const retryParsed = unwrapNestedAgentJson(safeParseJSON(retryResponse)) || parseLooseAgentJson(retryResponse)
  const retryData = normalizeAgentResponse(retryParsed || { answer: retryResponse }, params.lang)
  return {
    ...retryData,
    downgraded: true,
    reason: params.retryReason,
  }
}

async function planAgentRetrieval(
  config: StoredLLMConfig,
  payload: AgentChatRequestPayload,
  lang: Language,
): Promise<AgentRetrievalPlan> {
  try {
    const prompt = buildAgentRetrievalPlannerPrompt(payload, lang)
    const response = await callLLM(config, prompt, {
      timeoutMs: AGENT_PLANNER_TIMEOUT_MS,
      maxTokens: 220,
    })
    return parseRetrievalPlan(safeParseJSON(response) || {})
  } catch (error) {
    console.warn('[GitMentor SW] Agent retrieval planner fallback:', error)
    return parseRetrievalPlan({
      needsCodeContext: false,
      targetFiles: [],
      reason: 'planner_fallback_summary_only',
      confidence: 'low',
    })
  }
}

async function fetchAgentRetrievedFiles(
  payload: AgentChatRequestPayload,
  targetFiles: string[],
  onProgress?: (
    progress: Pick<AgentProgressEvent, 'completed' | 'total'>
  ) => Promise<void> | void,
): Promise<RetrievedFileContext[]> {
  return await fetchRetrievedGithubFiles(
    {
      owner: payload.repo.owner,
      repo: payload.repo.name,
      targetFiles,
      timeoutMs: AGENT_CODE_FETCH_TIMEOUT_MS,
      maxFiles: AGENT_CODE_CONTEXT_FILES_LIMIT,
      maxCharsPerFile: AGENT_CODE_CONTEXT_CHARS_PER_FILE,
      skipDefaultBranchLookup: true,
    },
    {
      getDefaultBranch,
      getRawFileContent,
    },
    onProgress,
  )
}

async function answerAgentWithSummary(
  config: StoredLLMConfig,
  payload: AgentChatRequestPayload,
  lang: Language,
): Promise<AgentChatResponsePayload> {
  return await runAgentPromptWithFallback({
    config,
    lang,
    prompt: buildAgentChatPrompt(payload, lang),
    litePrompt: buildAgentChatPromptLite(payload, lang),
    retryReason: 'timeout_retried_with_compact_prompt',
    label: 'agent-summary-answer',
  })
}

async function answerAgentWithCode(
  config: StoredLLMConfig,
  payload: AgentChatRequestPayload,
  plan: AgentRetrievalPlan,
  retrievedFiles: RetrievedFileContext[],
  lang: Language,
): Promise<AgentChatResponsePayload> {
  return await runAgentPromptWithFallback({
    config,
    lang,
    prompt: buildAgentCodePrompt(payload, plan, retrievedFiles, lang, {
      maxFiles: AGENT_CODE_CONTEXT_FILES_LIMIT,
      maxCharsPerFile: AGENT_CODE_CONTEXT_CHARS_PER_FILE,
    }),
    litePrompt: buildAgentCodePrompt(payload, plan, retrievedFiles, lang, {
      maxFiles: 2,
      maxCharsPerFile: AGENT_CODE_CONTEXT_CHARS_PER_FILE_LITE,
    }),
    retryReason: 'timeout_retried_with_compact_code_prompt',
    label: 'agent-code-answer',
  })
}

async function judgeAgentIntent(
  config: StoredLLMConfig,
  payload: AgentChatRequestPayload,
  lang: Language,
) {
  try {
    const response = await callLLM(config, buildAgentIntentPrompt(payload, lang), {
      timeoutMs: AGENT_PLANNER_TIMEOUT_MS,
      maxTokens: 260,
      label: 'agent-intent',
    })
    const intent = normalizeAgentIntent(safeParseJSON(response) || {})
    console.info('[GitMentor SW] Agent intent decision', {
      category: intent.category,
      confidence: intent.confidence,
      toolCalls: intent.toolCalls.map((call) => ({
        tool: call.tool,
        args: call.args,
      })),
    })
    return intent
  } catch (error) {
    console.warn('[GitMentor SW] Agent intent fallback:', error)
    const intent = normalizeAgentIntent({
      category: 'general',
      reason: 'intent_fallback_use_summaries_and_path_search',
      confidence: 'low',
      toolCalls: [
        { tool: 'readSummaries', args: {} },
        { tool: 'searchRepoPaths', args: { query: payload.question, maxFiles: AGENT_CODE_CONTEXT_FILES_LIMIT } },
      ],
    })
    console.info('[GitMentor SW] Agent intent decision', {
      category: intent.category,
      confidence: intent.confidence,
      toolCalls: intent.toolCalls.map((call) => ({
        tool: call.tool,
        args: call.args,
      })),
      fallback: true,
    })
    return intent
  }
}

async function judgeAgentSufficiency(
  config: StoredLLMConfig,
  payload: AgentChatRequestPayload,
  intent: AgentIntent,
  observations: AgentObservation[],
  lang: Language,
) {
  try {
    const response = await callLLM(
      config,
      buildAgentSufficiencyPrompt(payload, intent, observations, lang),
      {
        timeoutMs: AGENT_PLANNER_TIMEOUT_MS,
        maxTokens: 220,
        label: 'agent-sufficiency',
      },
    )
    const decision = normalizeAgentSufficiencyDecision(safeParseJSON(response) || {})
    console.info('[GitMentor SW] Agent sufficiency decision', {
      enough: decision.enough,
      confidence: decision.confidence,
      nextToolCalls: decision.nextToolCalls.map((call) => ({
        tool: call.tool,
        args: call.args,
      })),
    })
    return decision
  } catch (error) {
    console.warn('[GitMentor SW] Agent sufficiency fallback:', error)
    const candidateFiles = latestCandidateFiles(observations).slice(0, AGENT_CODE_CONTEXT_FILES_LIMIT)
    const fetchedFiles = observations
      .flatMap((observation) => observation.retrievedFiles || [])
      .filter((file) => file.status === 'fetched')
    if (fetchedFiles.length === 0 && candidateFiles.length > 0) {
      const decision = normalizeAgentSufficiencyDecision({
        enough: false,
        reason: 'sufficiency_fallback_read_candidate_files',
        confidence: 'low',
        nextToolCalls: [{ tool: 'readGithubFiles', args: { paths: candidateFiles } }],
      })
      console.info('[GitMentor SW] Agent sufficiency decision', {
        enough: decision.enough,
        confidence: decision.confidence,
        nextToolCalls: decision.nextToolCalls.map((call) => ({
          tool: call.tool,
          args: call.args,
        })),
        fallback: true,
      })
      return decision
    }
    const decision = normalizeAgentSufficiencyDecision({
      enough: observations.length > 0 || fetchedFiles.length > 0,
      reason: 'sufficiency_fallback',
      confidence: 'low',
      nextToolCalls: [],
    })
    console.info('[GitMentor SW] Agent sufficiency decision', {
      enough: decision.enough,
      confidence: decision.confidence,
      nextToolCalls: decision.nextToolCalls.map((call) => ({
        tool: call.tool,
        args: call.args,
      })),
      fallback: true,
    })
    return decision
  }
}

function latestCodeIndex(observations: AgentObservation[]): AgentCodeIndex | undefined {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const codeIndex = observations[index].codeIndex
    if (codeIndex) return codeIndex
  }
  return undefined
}

function latestCandidateFiles(observations: AgentObservation[]): string[] {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const candidateFiles = observations[index].candidateFiles
    if (candidateFiles?.length) return candidateFiles
  }
  return []
}

async function withAgentTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  fallbackValue: T,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(timeoutMessage)
          resolve(fallbackValue)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function collectAgentRepoPathHints(payload: AgentChatRequestPayload): string[] {
  return extractRepoPathHintsFromText(
    payload.sourceMapSummary,
    payload.readmeSummary,
    buildAgentSessionSummaryText(payload.sessionSummary || null),
    payload.question,
    ...payload.recentMessages.map((message) => message.content),
    ...payload.recentMessages.flatMap((message) => (message.retrievedFiles || []).map((file) => file.filePath)),
    ...payload.recentMessages.flatMap((message) => (message.evidence || []).map((item) => item.filePath || '')),
  ).slice(0, AGENT_REPO_PATH_HINTS_LIMIT)
}

function normalizeTopicProbeTerm(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
}

function collectAgentTopicTerms(...texts: string[]): string[] {
  const joined = texts.join('\n').toLowerCase()
  const terms = new Set<string>()

  for (const token of joined.replace(/[^a-z0-9/_-]+/g, ' ').split(/\s+/)) {
    const normalized = normalizeTopicProbeTerm(token)
    if (normalized.length >= 3 && normalized.length <= 32) {
      terms.add(normalized)
    }
  }

  const aliases: Array<[RegExp, string[]]> = [
    [/记忆|记住|内存/u, ['memory', 'memories']],
    [/会话|上下文/u, ['session', 'context']],
    [/历史|记录/u, ['history']],
    [/存储|保存|持久化/u, ['store', 'storage', 'persist']],
    [/配置|设置/u, ['config', 'settings']],
    [/认证|鉴权|登录/u, ['auth', 'login']],
    [/插件/u, ['plugin', 'plugins']],
    [/工具/u, ['tool', 'tools']],
  ]
  for (const [pattern, values] of aliases) {
    if (pattern.test(joined)) {
      values.forEach((value) => terms.add(value))
    }
  }

  return Array.from(terms).slice(0, 8)
}

function buildTopicDirectoryProbes(payload: AgentChatRequestPayload, queries: string[]): string[] {
  const repoSlug = normalizeTopicProbeTerm(payload.repo.name)
  const terms = collectAgentTopicTerms(payload.question, ...queries)
  const dirs = new Set<string>()

  for (const term of terms) {
    const topicDirs = [
      `src/${repoSlug}/${term}`,
      `src/${term}`,
      `${repoSlug}/${term}`,
      `lib/${term}`,
      `app/${term}`,
      `packages/${term}`,
      term,
    ]
    topicDirs.forEach((dir) => dirs.add(dir))
  }

  return Array.from(dirs).slice(0, 12)
}

async function listAgentTopicPaths(
  payload: AgentChatRequestPayload,
  queries: string[],
): Promise<string[]> {
  const probes = buildTopicDirectoryProbes(payload, queries)
  if (probes.length === 0) return []

  const results = await Promise.all(
    probes.map((path) => getGithubWebDirectoryPaths(payload.repo.owner, payload.repo.name, path)),
  )
  return Array.from(new Set(results.flat())).slice(0, AGENT_REPO_PATH_HINTS_LIMIT)
}

async function listAgentRepoPaths(
  payload: AgentChatRequestPayload,
  depth = AGENT_DISCOVERY_TREE_DEPTH,
): Promise<string[]> {
  const tree = await getFullDirectoryTree(
    payload.repo.owner,
    payload.repo.name,
    depth,
  ).catch(() => [])
  return flattenTreeFilePaths(tree)
}

async function answerAgentWithObservations(
  config: StoredLLMConfig,
  payload: AgentChatRequestPayload,
  intent: AgentIntent,
  observations: AgentObservation[],
  lang: Language,
): Promise<AgentChatResponsePayload> {
  const prompt = buildAgentFinalAnswerPromptCompact(payload, intent, observations, lang)
  const litePrompt = buildAgentFinalAnswerPromptLite(payload, intent, observations, lang)
  return await runAgentPromptWithFallback({
    config,
    lang,
    prompt,
    litePrompt,
    retryReason: 'timeout_retried_with_observation_prompt',
    label: 'agent-final-answer',
    maxTokens: 700,
    retryMaxTokens: 360,
    timeoutMs: AGENT_FINAL_ANSWER_TIMEOUT_MS,
    retryTimeoutMs: AGENT_FINAL_ANSWER_RETRY_TIMEOUT_MS,
    stream: true,
  })
}

async function runAgentChatRequest(
  payload: AgentChatRequestPayload,
  lang: Language,
  onProgress?: (progress: AgentProgressEvent) => Promise<void> | void,
): Promise<AgentChatResponsePayload> {
  const fastPathAnswer = buildFastPathAgentAnswer(payload)
  if (fastPathAnswer) {
    return fastPathAnswer
  }

  const config = await getLLMConfig()
  if (!config) {
    throw new Error('LLM not configured')
  }

  return await withKeepAlive(
    async () => {
      let repoPathsCache: string[] | null = null
      const repoPathHints = collectAgentRepoPathHints(payload)
      const getRepoPaths = async (depth?: number) => {
        if (!repoPathsCache || depth) {
          const discovery = listAgentRepoPaths(payload, depth).catch((error) => {
            console.warn('[GitMentor SW] Agent repo path discovery fallback:', error)
            return [] as string[]
          })
          const discoveredPaths = await withAgentTimeout(
            discovery,
            AGENT_REPO_PATH_DISCOVERY_TIMEOUT_MS,
            [] as string[],
            '[GitMentor SW] Agent repo path discovery timed out; falling back to summary path hints.',
          )
          repoPathsCache = discoveredPaths.length > 0 ? discoveredPaths : repoPathHints
        }
        return repoPathsCache.length > 0 ? repoPathsCache : repoPathHints
      }

      return await answerAgentQuestion(payload, {
        planRetriever: async (runtimePayload) => await planAgentRetrieval(config, runtimePayload, lang),
        discoverFiles: async (runtimePayload, plan) => await discoverAgentFiles(runtimePayload, plan),
        fetchFiles: async (runtimePayload, targetFiles, onFileProgress) =>
          await fetchAgentRetrievedFiles(runtimePayload, targetFiles, onFileProgress),
        answerWithSummary: async (runtimePayload) => await answerAgentWithSummary(config, runtimePayload, lang),
        answerWithCode: async ({ payload: runtimePayload, plan, retrievedFiles }) =>
          await answerAgentWithCode(config, runtimePayload, plan, retrievedFiles, lang),
        judgeIntent: async (runtimePayload) => await judgeAgentIntent(config, runtimePayload, lang),
        executeToolCalls: async (runtimePayload, calls, context) => {
          const runtimeRepoPathHints = collectAgentRepoPathHints(runtimePayload)
          const needsRepoPaths = calls.some((call) =>
            call.tool === 'listRepoTree' ||
            call.tool === 'searchRepoPaths' ||
            call.tool === 'expandImports',
          )
          const requiresLiveRepoTree = calls.some((call) =>
            call.tool === 'listRepoTree' ||
            call.tool === 'searchRepoPaths' ||
            call.tool === 'expandImports',
          )
          const searchQueries = calls
            .filter((call) => call.tool === 'searchRepoPaths')
            .map((call) => String(call.args?.query || runtimePayload.question))
          const repoPathsPromise = needsRepoPaths
            ? requiresLiveRepoTree || runtimeRepoPathHints.length === 0
              ? getRepoPaths()
              : Promise.resolve(runtimeRepoPathHints)
            : Promise.resolve([] as string[])
          const topicPathsPromise = searchQueries.length > 0
            ? withAgentTimeout(
                listAgentTopicPaths(runtimePayload, searchQueries),
                AGENT_TOPIC_PATH_DISCOVERY_TIMEOUT_MS,
                [] as string[],
                '[GitMentor SW] Agent topic path discovery timed out; continuing with tree paths.',
              )
            : Promise.resolve([] as string[])
          const [treeRepoPaths, topicRepoPaths] = await Promise.all([repoPathsPromise, topicPathsPromise])
          const repoPaths = Array.from(new Set([...treeRepoPaths, ...topicRepoPaths]))
          const preferredFiles = latestCandidateFiles(context.observations)
          const expandedCalls = calls.map((call) => {
            if (call.tool === 'readGithubFiles' && (!call.args?.paths || call.args.paths.length === 0)) {
              return {
                ...call,
                args: {
                  ...(call.args || {}),
                  paths: preferredFiles,
                },
              }
            }
            return call
          })
          return await executeAgentToolCalls(
            {
              payload: runtimePayload,
              calls: expandedCalls,
              repoPaths,
              retrievedFiles: context.retrievedFiles,
              budget: {
                maxFiles: 8,
                maxCharsPerFile: AGENT_CODE_CONTEXT_CHARS_PER_FILE,
              },
              codeIndex: latestCodeIndex(context.observations),
            },
            {
              fetchFiles: async (toolPayload, targetFiles, onFileProgress) =>
                await fetchAgentRetrievedFiles(toolPayload, targetFiles, onFileProgress),
              listRepoTree: async (_toolPayload, depth) => await getRepoPaths(depth),
              onProgress,
            },
          )
        },
        judgeSufficiency: async ({ payload: runtimePayload, intent, observations }) =>
          await judgeAgentSufficiency(config, runtimePayload, intent, observations, lang),
        answerWithObservations: async ({ payload: runtimePayload, intent, observations }) =>
          await answerAgentWithObservations(config, runtimePayload, intent, observations, lang),
        onProgress,
      })
    },
    pingServiceWorkerKeepAlive,
    SERVICE_WORKER_KEEPALIVE_INTERVAL_MS,
  )
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.message.includes('aborted')
}

const SERVICE_WORKER_KEEPALIVE_KEY = '__gitmentor_service_worker_keepalive__'
const SERVICE_WORKER_KEEPALIVE_INTERVAL_MS = 20_000

async function pingServiceWorkerKeepAlive(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [SERVICE_WORKER_KEEPALIVE_KEY]: Date.now() }, () => resolve())
  })
}

function postAgentChatPortMessage(port: any, message: Record<string, unknown>): void {
  try {
    port.postMessage(message)
  } catch (error) {
    console.warn('[GitMentor SW] Failed to post agent chat port message:', error)
  }
}

chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name !== AGENT_CHAT_PORT_NAME) return

  port.onMessage.addListener((message: any) => {
    if (message?.action !== 'startAgentChat') return

    const payload = parseAgentChatPayload((message.payload || {}) as Partial<AgentChatRequestPayload>)
    const lang: Language = payload.language === 'zh' ? 'zh' : 'en'

    ;(async () => {
      try {
        const data = await runAgentChatRequest(
          payload,
          lang,
          async (progress) => {
            postAgentChatPortMessage(port, {
              type: 'progress',
              progress,
            })
          },
        )
        postAgentChatPortMessage(port, {
          type: 'result',
          data,
        })
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Agent chat failed'
        if (messageText === 'REQUEST_TIMEOUT') {
          postAgentChatPortMessage(port, {
            type: 'result',
            data: {
              ...buildLocalFallbackAnswer(payload, []),
              retrievalMode: 'summary-only',
              retrievedFiles: [],
            },
          })
          return
        }
        postAgentChatPortMessage(port, {
          type: 'error',
          error: messageText,
        })
      }
    })()
  })
})

function resolveStreamMode(config: StoredLLMConfig): StreamMode {
  const normalized = migrateLegacyLLMConfig(config)

  if (normalized.protocol === 'claude') {
    return 'claude'
  }

  if (normalized.protocol === 'openai') {
    return 'openai-compatible'
  }

  if (normalized.protocol === 'local') {
    return normalized.localMode === 'ollama' || normalized.preset === 'ollama'
      ? 'ollama'
      : 'openai-compatible'
  }

  return null
}

function parseLLMResponseText(config: StoredLLMConfig, data: any): string {
  const normalized = migrateLegacyLLMConfig(config)

  if (normalized.protocol === 'claude') {
    return data.content?.[0]?.text || ''
  }
  if (normalized.protocol === 'local' && (normalized.localMode === 'ollama' || normalized.preset === 'ollama')) {
    return data.message?.content || data.response || ''
  }
  return data.choices?.[0]?.message?.content || ''
}

async function readStreamingLLMResponse(
  config: StoredLLMConfig,
  response: Response,
): Promise<string> {
  const streamMode = resolveStreamMode(config)
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  const expectsStream =
    streamMode === 'ollama'
      ? !contentType.includes('application/json')
      : contentType.includes('text/event-stream')

  if (!expectsStream) {
    const data = await response.json()
    return parseLLMResponseText(config, data)
  }

  if (streamMode === 'claude') {
    return await readClaudeMessageStream(response)
  }
  if (streamMode === 'ollama') {
    return await readOllamaJsonStream(response)
  }
  return await readOpenAICompatibleStream(response)
}

// Call LLM API
async function callLLM(
  config: StoredLLMConfig,
  prompt: string,
  options?: { timeoutMs?: number; maxTokens?: number; stream?: boolean; label?: string },
): Promise<string> {
  let apiUrl: string
  let headers: Record<string, string>
  let body: any
  const normalized = migrateLegacyLLMConfig(config)
  const llmLabel = options?.label || 'llm'
  const streamMode = options?.stream ? resolveStreamMode(config) : null
  const requestedMaxTokens =
    typeof options?.maxTokens === 'number' && options.maxTokens > 0
      ? Math.floor(options.maxTokens)
      : undefined

  switch (normalized.protocol) {
    case 'openai': {
      switch (normalized.preset) {
        case 'openai-official':
          apiUrl = 'https://api.openai.com/v1/chat/completions'
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${normalized.apiKey}`,
          }
          body = {
            model: normalized.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
          }
          break
        case 'custom-openai': {
          const baseUrl = normalizeOpenAICompatibleBaseUrl(normalized.baseUrl || '')
          if (!baseUrl) {
            throw new Error('Custom provider base URL is required')
          }
          apiUrl = `${baseUrl}/chat/completions`
          headers = { 'Content-Type': 'application/json' }
          if (normalized.apiKey) {
            headers.Authorization = `Bearer ${normalized.apiKey}`
          }
          body = {
            model: normalized.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
          }
          break
        }
        case 'deepseek':
          apiUrl = 'https://api.deepseek.com/v1/chat/completions'
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${normalized.apiKey}`,
          }
          body = {
            model: normalized.model || 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
          }
          break
        case 'siliconflow':
          apiUrl = 'https://api.siliconflow.cn/v1/chat/completions'
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${normalized.apiKey}`,
          }
          body = {
            model: normalized.model || 'Qwen/Qwen2.5-72B-Instruct',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
          }
          break
        case 'zhipu':
          apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${normalized.apiKey}`,
          }
          body = {
            model: normalized.model || 'glm-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
          }
          break
        default:
          throw new Error(`Unsupported OpenAI-compatible preset: ${normalized.preset}`)
      }
      break
    }
    case 'claude': {
      if (normalized.preset === 'custom-claude') {
        apiUrl = resolveClaudeCompatibleMessagesUrl(normalized.baseUrl)
        if (!apiUrl) {
          throw new Error('Claude-compatible base URL is required')
        }
      } else {
        apiUrl = 'https://api.anthropic.com/v1/messages'
      }

      headers = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (normalized.apiKey) {
        headers['x-api-key'] = normalized.apiKey
      }
      body = {
        model: normalized.model || 'claude-3-haiku-20240307',
        max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 700,
        messages: [{ role: 'user', content: prompt }],
      }
      break
    }
    case 'local': {
      const isOllama = normalized.localMode === 'ollama' || normalized.preset === 'ollama'

      if (isOllama) {
        apiUrl = `${resolveProviderBaseUrl('ollama', normalized.baseUrl) || 'http://localhost:11434'}/api/chat`
        headers = {
          'Content-Type': 'application/json',
        }
        body = buildOllamaChatBody({
          model: normalized.model || 'llama2',
          prompt,
          maxTokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
        })
        break
      }

      if (normalized.preset === 'custom-local') {
        const baseUrl = normalizeOpenAICompatibleBaseUrl(normalized.baseUrl || '')
        if (!baseUrl) {
          throw new Error('Local OpenAI-compatible base URL is required')
        }
        apiUrl = `${baseUrl}/chat/completions`
      } else {
        apiUrl = `${resolveProviderBaseUrl('lmstudio', normalized.baseUrl) || 'http://localhost:1234'}/v1/chat/completions`
      }

      headers = {
        'Content-Type': 'application/json',
      }
      if (normalized.apiKey) {
        headers.Authorization = `Bearer ${normalized.apiKey}`
      }
      body = {
        model: normalized.model || 'local-model',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: requestedMaxTokens ?? normalized.maxTokens ?? 420,
      }
      break
    }
    default:
      throw new Error(`Unknown protocol: ${normalized.protocol}`)
  }

  const controller = new AbortController()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    console.info(`[GitMentor SW] LLM request start: ${llmLabel}`, {
      protocol: normalized.protocol,
      preset: normalized.preset,
      model: normalized.model || 'default',
      timeoutMs,
      promptChars: prompt.length,
      stream: Boolean(streamMode),
    })
    const startedAt = Date.now()
    return await withKeepAlive(
      async () => {
        const runRequest = async (stream: boolean): Promise<Response> =>
          await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...body,
              ...(streamMode && stream ? { stream: true } : {}),
            }),
            signal: controller.signal,
          })

        const useStreaming = Boolean(streamMode)
        let response = await runRequest(useStreaming)

        if (
          !response.ok &&
          useStreaming &&
          normalized.preset === 'custom-openai' &&
          shouldFallbackCustomStreaming(response.status)
        ) {
          response = await runRequest(false)
        }

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`API error ${response.status}: ${errorText}`)
        }

        if (!useStreaming) {
          const data = await response.json()
          const text = parseLLMResponseText(config, data)
          console.info(`[GitMentor SW] LLM request done: ${llmLabel}`, {
            elapsedMs: Date.now() - startedAt,
            responseChars: text.length,
          })
          return text
        }

        const text = await readStreamingLLMResponse(config, response)
        console.info(`[GitMentor SW] LLM stream done: ${llmLabel}`, {
          elapsedMs: Date.now() - startedAt,
          responseChars: text.length,
        })
        return text
      },
      pingServiceWorkerKeepAlive,
      SERVICE_WORKER_KEEPALIVE_INTERVAL_MS,
    )
  } catch (error) {
    if (isAbortError(error)) {
      console.warn(`[GitMentor SW] LLM request timeout: ${llmLabel}`, {
        timeoutMs,
        promptChars: prompt.length,
      })
      throw new Error('REQUEST_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// Quick file analysis (pattern-based, no LLM)
function quickAnalyzeFile(fileName: string, fileContent: string, lang: Language = 'en'): string {
  const lines = fileContent.split('\n')
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  // Detect patterns
  const patterns = {
    imports: lines.filter(l => l.match(/^import\s|^from\s|^require\(/)).length,
    exports: lines.filter(l => l.match(/^export\s/)).length,
    functions: lines.filter(l => l.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(/)).length,
    classes: lines.filter(l => l.match(/^class\s+\w+/)).length,
    interfaces: lines.filter(l => l.match(/^interface\s+\w+|^type\s+\w+/)).length,
    comments: lines.filter(l => l.match(/^\s*\/\/|^\s*\/\*|^\s*\*/)).length,
    todos: lines.filter(l => l.match(/TODO|FIXME|HACK|XXX/i)).length,
  }
  
  // Extract key elements
  const functionNames = lines
    .map(l => l.match(/function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/))
    .filter(Boolean)
    .map(m => m![1] || m![2])
    .slice(0, 10)
  
  const classNames = lines
    .map(l => l.match(/^class\s+(\w+)/))
    .filter(Boolean)
    .map(m => m![1])
  
  // Build HTML response
  let html = `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'fileSummary')}</h3>
      <div style="font-size: 12px; color: #666; line-height: 1.6;">
        <div><strong>${getAnalysisText(lang, 'type')}:</strong> ${ext.toUpperCase()} ${getAnalysisText(lang, 'fileType')}</div>
        <div><strong>${getAnalysisText(lang, 'lines')}:</strong> ${lines.length}</div>
        <div><strong>${getAnalysisText(lang, 'imports')}:</strong> ${patterns.imports}</div>
        <div><strong>${getAnalysisText(lang, 'functions')}:</strong> ${patterns.functions}</div>
        ${patterns.classes > 0 ? `<div><strong>${getAnalysisText(lang, 'classes')}:</strong> ${patterns.classes}</div>` : ''}
        ${patterns.interfaces > 0 ? `<div><strong>${getAnalysisText(lang, 'interfacesTypes')}:</strong> ${patterns.interfaces}</div>` : ''}
      </div>
    </div>
  `
  
  if (functionNames.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'keyFunctions')}</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${functionNames.map(name => `<span style="background: #f0f2f5; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: monospace;">${name}</span>`).join('')}
        </div>
      </div>
    `
  }
  
  if (classNames.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'classesLabel')}</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${classNames.map(name => `<span style="background: #e8f4fd; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: monospace;">${name}</span>`).join('')}
        </div>
      </div>
    `
  }
  
  if (patterns.todos > 0) {
    html += `
      <div style="margin-bottom: 16px; padding: 8px; background: #fff8e6; border-radius: 4px;">
        <span style="font-size: 12px; color: #856404;">${getAnalysisText(lang, 'todosFound', { count: patterns.todos })}</span>
      </div>
    `
  }
  
  // Add deep analysis button
  html += `
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e1e4e8;">
      <button id="gitmentor-deep-analysis-btn" style="
        width: 100%;
        padding: 10px 16px;
        background: #24292e;
        color: white;
        border: 1px solid rgba(27, 31, 35, 0.15);
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      ">
        ${getAnalysisText(lang, 'aiDeepAnalysis')}
      </button>
      <p style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">
        ${getAnalysisText(lang, 'usesLLM')}
      </p>
    </div>
  `
  
  return html
}

// Deep file analysis with LLM
async function deepAnalyzeFile(
  config: StoredLLMConfig,
  fileName: string,
  fileContent: string,
  lang: Language = 'en',
): Promise<DeepFileAnalysisResult> {
  const languageInstruction = lang === 'zh' 
    ? '请用中文回答字段值，但 JSON 字段名必须严格保持英文，例如 summary、components、dependencies、evidence、suggestions、confidence。'
    : 'Please answer field values in English. Keep JSON field names exactly as requested.'
  
  const prompt = `Analyze this source code file as a learning assistant. Explain what a reader should understand first.

File: ${fileName}

\`\`\`
${fileContent.slice(0, 15000)}
\`\`\`

${languageInstruction}

Please provide analysis in the following JSON format:
{
  "role": "One direct sentence: this file's responsibility in the project",
  "summary": "A concise explanation of what the file does",
  "workflow": [
    {"step": 1, "title": "Short step title", "description": "What happens in this step", "lineNumber": 10, "functionName": "relatedFunction"}
  ],
  "components": [
    {"name": "ComponentName", "type": "function|class|interface|constant|module", "description": "What this symbol is responsible for"}
  ],
  "designNotes": ["Why this implementation is designed this way"],
  "dependencies": ["List of key imports/dependencies"],
  "evidence": [
    {"filePath": "${fileName}", "lineStart": 10, "snippet": "exact function, assignment, return, or class line that supports the explanation", "reason": "why this supports the explanation"}
  ],
  "suggestions": ["Useful follow-up reading or question"],
  "confidence": "low|medium|high"
}

Evidence rules:
- Prefer function definitions, key assignments, return statements, or class definitions.
- Do not use import lines as evidence unless the file has no better implementation line.

Important: Return ONLY the JSON object, no markdown code blocks or extra text.`

  const response = await callLLM(config, prompt)
  const analysis = safeParseJSON(response)
  
  if (!analysis) {
    throw new Error('Failed to parse AI response')
  }

  return normalizeDeepFileAnalysisResult(analysis, {
    fileName,
    fileContent,
    language: lang,
  })
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
  console.log('[GitMentor SW] Received message:', message.action)
  
  const lang: Language = message.language === 'zh' || message?.payload?.language === 'zh' ? 'zh' : 'en'
  
  if (message.action === 'analyzeFile') {
    // Quick analysis (no LLM)
    try {
      const html = quickAnalyzeFile(message.fileName, message.fileContent, lang)
      sendResponse({ html })
    } catch (error) {
      console.error('[GitMentor SW] Quick analysis error:', error)
      sendResponse({ error: error instanceof Error ? error.message : 'Analysis failed' })
    }
    return true
  }
  
  if (message.action === 'analyzeFileDeep') {
    // Deep analysis with LLM
    (async () => {
      try {
        const config = await getLLMConfig()
        if (!config) {
          sendResponse({
            error:
              'LLM not configured. Please configure your API key in GitMentor settings.',
          })
          return
        }

        const data = await deepAnalyzeFile(
          config,
          message.fileName,
          message.fileContent,
          lang,
        )
        sendResponse({ data })
      } catch (error) {
        console.error('[GitMentor SW] Deep analysis error:', error)
        sendResponse({ 
          error: `AI Analysis Failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
        })
      }
    })()
    return true // Keep channel open for async response
  }
  
  if (message.action === 'askQuestion') {
    // Handle Q&A
    (async () => {
      try {
        const config = await getLLMConfig()
        if (!config) {
          sendResponse({ error: 'LLM not configured' })
          return
        }
        
        const prompt = `Based on this source code file, answer the following question.

File: ${message.fileName}

\`\`\`
${message.fileContent.slice(0, 10000)}
\`\`\`

Question: ${message.question}

Please provide a clear, concise answer. If the question cannot be answered from the code, say so.`

        const response = await callLLM(config, prompt)
        sendResponse({ answer: response })
      } catch (error) {
        console.error('[GitMentor SW] Q&A error:', error)
        sendResponse({ error: error instanceof Error ? error.message : 'Failed to get answer' })
      }
    })()
    return true
  }

  if (message.action === 'getLearningMission') {
    try {
      const sourceMap = message.sourceMap as SourceMapOutput
      const readmeSummary = String(message.readmeSummary || '')
      const repoOwner = String(message?.repo?.owner || '')
      const repoName = String(message?.repo?.name || '')
      const mission: LearningMission = createLearningMission({
        repoKey: `${repoOwner}/${repoName}`,
        sourceMap,
        readmeSummary,
        language: lang,
      })
      sendResponse({ mission })
    } catch (error) {
      sendResponse({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to build learning mission',
      })
    }
    return true
  }

  if (message.action === 'explainConceptLite') {
    ;(async () => {
      try {
        const config = await getLLMConfig()
        if (!config) {
          sendResponse({ error: 'LLM not configured' })
          return
        }

        const concept = String(message.concept || '')
        const question = String(message.question || '')
        const prompt = `You are helping a beginner understand one concept in a GitHub project.

Concept: ${concept}
Question: ${question}

Return only JSON:
{
  "answer": "short practical answer for beginner in 2-4 sentences",
  "confidence": "low|medium|high",
  "evidence": [
    {"filePath": "path/to/file", "lineStart": 10, "snippet": "short snippet", "reason": "why this supports the answer"}
  ]
}`
        const response = await callLLM(config, prompt, { timeoutMs: CONCEPT_LLM_TIMEOUT_MS })
        const parsed = safeParseJSON(response)
        const fallbackAnswer = lang === 'zh'
          ? `我暂时无法完整回答「${concept}」，建议先从 README 和入口文件开始查看。`
          : `I cannot fully answer "${concept}" right now. Start from README and the entry files first.`
        const answerText = String(parsed?.answer || response || '').trim()
        const data = {
          answer: (answerText || fallbackAnswer).slice(0, 1200),
          confidence: normalizeConfidence(parsed?.confidence),
          evidence: normalizeEvidence(parsed?.evidence),
        }
        if (data.evidence.length === 0) {
          data.confidence = 'low'
        }
        sendResponse({ data })
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Failed to explain concept'
        sendResponse({
          error: messageText === 'REQUEST_TIMEOUT' ? 'REQUEST_TIMEOUT' : messageText,
        })
      }
    })()
    return true
  }

  if (message.action === 'chatWithAgent') {
    ;(async () => {
      let payload: AgentChatRequestPayload = parseAgentChatPayload({})
      try {
        payload = parseAgentChatPayload((message.payload || {}) as Partial<AgentChatRequestPayload>)
        const data = await runAgentChatRequest(payload, lang)
        sendResponse({ data })
        return
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Agent chat failed'
        if (messageText === 'REQUEST_TIMEOUT') {
          sendResponse({
            data: {
              ...buildLocalFallbackAnswer(payload, []),
              retrievalMode: 'summary-only',
              retrievedFiles: [],
            },
          })
          return
        }
        sendResponse({
          error: messageText,
        })
      }
    })()
    return true
  }

  if (message.action === 'summarizeAgentSession') {
    ;(async () => {
      const messages = Array.isArray(message.messages) ? message.messages as AgentMessage[] : []
      const previousSummary = (message.previousSummary || null) as SessionSummary | null

      try {
        const config = await getLLMConfig()
        if (!config) {
          sendResponse({ summary: buildHeuristicSummary(messages, previousSummary, lang) })
          return
        }

        const history = messages
          .slice(-16)
          .map((item) => `${item.role}: ${item.content}`)
          .join('\n')
        const summaryPrompt = lang === 'zh'
          ? `请把下面会话压缩为 JSON 摘要，便于后续追问。

历史摘要：
${previousSummary?.summary || '暂无'}

对话：
${history || '暂无'}

仅输出 JSON：
{
  "summary": "120字以内摘要",
  "keyConcepts": ["概念1", "概念2"],
  "unresolvedQuestions": ["未解决问题1"],
  "evidenceFiles": ["path/to/file.ts"]
}`
          : `Compress the conversation into a JSON summary for future follow-up.

Previous summary:
${previousSummary?.summary || 'N/A'}

Conversation:
${history || 'N/A'}

Return JSON only:
{
  "summary": "summary within 80 words",
  "keyConcepts": ["concept1", "concept2"],
  "unresolvedQuestions": ["open question 1"],
  "evidenceFiles": ["path/to/file.ts"]
}`

        const response = await callLLM(config, summaryPrompt, { timeoutMs: AGENT_SUMMARY_TIMEOUT_MS })
        const parsed = safeParseJSON(response)
        if (!parsed) {
          sendResponse({ summary: buildHeuristicSummary(messages, previousSummary, lang) })
          return
        }

        const summary: SessionSummary = {
          summary: String(parsed.summary || previousSummary?.summary || '').trim().slice(0, 1200),
          keyConcepts: normalizeStringList(parsed.keyConcepts, 8),
          unresolvedQuestions: normalizeStringList(parsed.unresolvedQuestions, 6),
          evidenceFiles: normalizeStringList(parsed.evidenceFiles, 8),
          updatedAt: Date.now(),
        }
        if (!summary.summary) {
          sendResponse({ summary: buildHeuristicSummary(messages, previousSummary, lang) })
          return
        }
        sendResponse({ summary })
      } catch {
        sendResponse({ summary: buildHeuristicSummary(messages, previousSummary, lang) })
      }
    })()
    return true
  }
  
  return false
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GitMentor SW] Extension installed')
})
