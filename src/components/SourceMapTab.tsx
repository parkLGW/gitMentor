// Source Map Tab - Simplified UI with race condition prevention
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { LoadingSpinner } from './LoadingSpinner'
import { MermaidDiagram } from './MermaidDiagram'
import { ModuleList } from './ModuleList'
import { LearningPath } from './LearningPath'
import { LearningMission } from './LearningMission'
import { SourceMapOutput } from '@/prompts/types'
import { collectDeepContext } from '@/services/context-collector'
import {
  createSourceMapPrompt,
  parseSourceMapResponse,
  createSourceMapFallback,
  mergeSourceMapWithFallback,
  SOURCE_MAP_SCHEMA_VERSION,
} from '@/prompts'
import { llmManager } from '@/services/llm'
import { eventBus, EVENTS } from '@/utils/eventBus'
import { createLearningMission, normalizeConceptCard } from '@/services/learning-mission'
import { AnalysisEvidence, ConfidenceLevel, LearningMission as LearningMissionType } from '@/types/learning'
import { StorageKeys } from '@/constants/storage'
import { setJsonCacheWithEviction } from '@/utils/local-cache'

interface SourceMapTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
  defaultBranch?: string
}

type ViewMode = 'diagram' | 'modules' | 'path' | 'mission' | 'concepts'

interface ConceptAnswerState {
  status: 'idle' | 'loading' | 'done' | 'error' | 'timeout'
  answer?: string
  confidence?: ConfidenceLevel
  evidence?: AnalysisEvidence[]
  error?: string
  lastQuestion?: string
}

const CONCEPT_REQUEST_TIMEOUT_MS = 60000

function SourceMapTab({ repo, language, defaultBranch = 'main' }: SourceMapTabProps) {
  const [activeView, setActiveView] = useState<ViewMode>('diagram')
  const [sourceMap, setSourceMap] = useState<SourceMapOutput | null>(null)
  const [mission, setMission] = useState<LearningMissionType | null>(null)
  const [readmeSummary, setReadmeSummary] = useState('')
  const [conceptAnswers, setConceptAnswers] = useState<Record<string, ConceptAnswerState>>({})
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmReady, setLlmReady] = useState(false)

  const isZh = language === 'zh'
  const repoKey = `${repo.owner}/${repo.name}`
  const cacheKey = StorageKeys.sourceMap(repo, language)
  
  // 用于防止竞态条件的 ref
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef<number>(0)

  const sendRuntimeMessage = useCallback(<T,>(
    message: Record<string, unknown>,
    timeoutMs = 20000,
  ) => {
    return new Promise<T>((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        reject(new Error('Runtime messaging unavailable'))
        return
      }
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('REQUEST_TIMEOUT'))
      }, timeoutMs)
      chrome.runtime.sendMessage(message, (response: T) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const runtimeError = chrome.runtime.lastError
        if (runtimeError) {
          reject(new Error(runtimeError.message))
          return
        }
        resolve(response)
      })
    })
  }, [])

  // Wait for LLM config - 使用事件驱动而非轮询
  useEffect(() => {
    const checkLLM = () => {
      const ready = llmManager.isConfigured()
      setLlmReady(ready)
    }

    // Initial check
    checkLLM()

    // Subscribe to config change events
    const unsubscribe = eventBus.on(EVENTS.LLM_CONFIG_CHANGED, checkLLM)
    const unsubscribeClear = eventBus.on(EVENTS.LLM_CONFIG_CLEARED, () => {
      setLlmReady(false)
    })

    return () => {
      unsubscribe()
      unsubscribeClear()
    }
  }, [])

  // Cancel any ongoing requests when repo changes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [repo.owner, repo.name])

  // Run AI analysis with cancellation support
  const runAnalysis = useCallback(async (
    signal: AbortSignal,
    requestId: number,
    baseMap?: SourceMapOutput,
    preparedContext?: Awaited<ReturnType<typeof collectDeepContext>>,
  ) => {
    const provider = llmManager.getCurrentProvider()
    if (!provider) {
      console.log('[SourceMapTab] No LLM provider')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      console.log('[SourceMapTab] Starting AI analysis...')
      const context = preparedContext || await collectDeepContext(repo.owner, repo.name)
      
      if (signal.aborted) {
        console.log('[SourceMapTab] AI analysis cancelled')
        return
      }
      
      const prompt = createSourceMapPrompt(context, language)
      const response = await provider.complete(prompt, undefined, signal)
      
      if (signal.aborted) {
        console.log('[SourceMapTab] AI analysis cancelled after completion')
        return
      }
      
      console.log('[SourceMapTab] AI response received, length:', response.content?.length)
      console.log('[SourceMapTab] AI response preview:', response.content?.slice(0, 500))
      
      const parsed = parseSourceMapResponse(response.content, language)
      console.log('[SourceMapTab] Parsed result:', parsed ? {
        hasArchitectureType: !!parsed.architectureType,
        hasMermaidDiagram: !!parsed.mermaidDiagram,
        modulesCount: parsed.coreModules?.length,
        learningPathCount: parsed.learningPath?.length,
        conceptCount: parsed.keyConcepts?.length,
        quality: parsed.quality,
        firstModule: parsed.coreModules?.[0],
      } : 'null')

      // Check if this is still the current request
      if (requestId !== requestIdRef.current) {
        console.log('[SourceMapTab] Request ID mismatch, ignoring AI result')
        return
      }

      const fallback = baseMap || createSourceMapFallback(context, language)
      if (parsed) {
        const merged = mergeSourceMapWithFallback(parsed, fallback, language)
        setSourceMap(merged.map)
        if (merged.shouldCacheLongTerm) {
          setJsonCacheWithEviction(cacheKey, merged.map)
          console.log('[SourceMapTab] Saved complete source map to cache', {
            quality: merged.quality,
            score: merged.completenessScore,
            usedFallbackMerge: merged.usedFallbackMerge,
          })
        } else {
          console.log('[SourceMapTab] Partial source map, skip long-term cache', {
            quality: merged.quality,
            score: merged.completenessScore,
            usedFallbackMerge: merged.usedFallbackMerge,
          })
        }
      } else {
        console.log('[SourceMapTab] AI parse failed, keeping fallback')
        setSourceMap(fallback)
      }
    } catch (err) {
      if (signal.aborted) {
        console.log('[SourceMapTab] AI analysis aborted')
        return
      }
      
      console.error('[SourceMapTab] Analysis error:', err)
      // 保留 fallback，不设置错误（因为 fallback 仍然可用）
    } finally {
      setAnalyzing(false)
    }
  }, [repo.owner, repo.name, language, cacheKey])

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal
      const currentRequestId = ++requestIdRef.current

      setLoading(true)
      setError(null)

      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached) as { data?: SourceMapOutput; timestamp?: number }
            const isExpired = !timestamp || (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000)
            const schemaValid = data?.schemaVersion === SOURCE_MAP_SCHEMA_VERSION
            const cacheUsable =
              !isExpired &&
              schemaValid &&
              data?.quality === 'complete' &&
              !!data?.architectureType

            if (cacheUsable && data) {
              if (currentRequestId !== requestIdRef.current) return
              setSourceMap(data)
              setLoading(false)
              console.log('[SourceMapTab] Loaded cache', {
                quality: data.quality,
                score: data.completenessScore,
              })
              void collectDeepContext(repo.owner, repo.name).then((context) => {
                setReadmeSummary(context.readmeSummary || context.readme.slice(0, 1200))
              }).catch(() => undefined)
              console.log('[SourceMapTab] Skip auto refinement when cache hit; use manual refresh to re-run AI')
              return
            }

            console.log('[SourceMapTab] Cache invalid/expired/schema mismatch, removing')
            localStorage.removeItem(cacheKey)
          } catch {
            console.warn('[SourceMapTab] Invalid cache format')
            localStorage.removeItem(cacheKey)
          }
        }

        const context = await collectDeepContext(repo.owner, repo.name)
        setReadmeSummary(context.readmeSummary || context.readme.slice(0, 1200))
        if (signal.aborted || currentRequestId !== requestIdRef.current) return

        const fallback = createSourceMapFallback(context, language)
        setSourceMap(fallback)
        setLoading(false)

        if (llmReady) {
          void runAnalysis(signal, currentRequestId, fallback, context)
        }
      } catch (err) {
        if (signal.aborted) return
        console.error('[SourceMapTab] Load error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load')
        setLoading(false)
      }
    }

    void loadData()
  }, [repo.owner, repo.name, language, llmReady, cacheKey])

  // Regenerate with cancellation support
  const handleRegenerate = useCallback(async () => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    
    // Increment request ID
    const currentRequestId = ++requestIdRef.current
    
    setAnalyzing(true)
    setError(null)
    localStorage.removeItem(cacheKey)
    
    try {
      console.log('[SourceMapTab] Regenerating...')
      const context = await collectDeepContext(repo.owner, repo.name)
      setReadmeSummary(context.readmeSummary || context.readme.slice(0, 1200))
      
      if (signal.aborted) {
        console.log('[SourceMapTab] Regeneration cancelled')
        return
      }
      
      console.log('[SourceMapTab] Context collected:', {
        projectType: context.projectType,
        directoryTree: context.directoryTree?.slice(0, 200)
      })
      
      const fallback = createSourceMapFallback(context, language)
      console.log('[SourceMapTab] Fallback generated:', {
        hasChart: !!fallback.mermaidDiagram,
        chartLength: fallback.mermaidDiagram?.length,
        chartPreview: fallback.mermaidDiagram?.slice(0, 100),
        modulesCount: fallback.coreModules?.length
      })
      
      // Check if still current request
      if (currentRequestId !== requestIdRef.current) {
        console.log('[SourceMapTab] Request ID mismatch in regenerate')
        return
      }
      
      setSourceMap(fallback)
      
      // 如果 LLM 已配置，尝试 AI 分析
      if (llmManager.isConfigured()) {
        await runAnalysis(signal, currentRequestId, fallback, context)
      } else {
        console.log('[SourceMapTab] LLM not configured, using fallback only')
      }
    } catch (e) {
      if (signal.aborted) {
        console.log('[SourceMapTab] Regeneration aborted')
        return
      }
      
      console.error('[SourceMapTab] Regenerate failed:', e)
      setError(e instanceof Error ? e.message : 'Failed to regenerate')
    } finally {
      setAnalyzing(false)
    }
  }, [repo.owner, repo.name, language, cacheKey, runAnalysis])

  useEffect(() => {
    let cancelled = false

    const ensureMission = async () => {
      if (!sourceMap) {
        setMission(null)
        return
      }

      const fallbackMission = createLearningMission({
        repoKey,
        sourceMap,
        readmeSummary,
        language,
      })

      try {
        const response = await sendRuntimeMessage<{ mission?: LearningMissionType }>({
          action: 'getLearningMission',
          repo,
          sourceMap,
          readmeSummary,
          language,
        })

        const missionData = response?.mission || fallbackMission
        if (!cancelled) {
          setMission(missionData)
        }
      } catch {
        if (!cancelled) {
          setMission(fallbackMission)
        }
      }
    }

    void ensureMission()
    return () => {
      cancelled = true
    }
  }, [language, readmeSummary, repo, repoKey, sendRuntimeMessage, sourceMap])

  useEffect(() => {
    setConceptAnswers({})
  }, [language, sourceMap?.architectureSummary])

  const handleConceptQuickAsk = useCallback(async (conceptTerm: string, question: string) => {
    if (conceptAnswers[conceptTerm]?.status === 'loading') {
      return
    }

    setConceptAnswers((prev) => ({
      ...prev,
      [conceptTerm]: {
        ...prev[conceptTerm],
        status: 'loading',
        error: undefined,
        lastQuestion: question,
      },
    }))

    try {
      const response = await sendRuntimeMessage<{
        data?: { answer: string; confidence: ConfidenceLevel; evidence: AnalysisEvidence[] }
        error?: string
      }>({
        action: 'explainConceptLite',
        repo,
        concept: conceptTerm,
        question,
        language,
      }, CONCEPT_REQUEST_TIMEOUT_MS)

      if (response?.error) {
        throw new Error(response.error)
      }

      const data = response?.data
      setConceptAnswers((prev) => ({
        ...prev,
        [conceptTerm]: {
          status: 'done',
          answer: data?.answer || (isZh ? '暂无回答' : 'No answer available'),
          confidence: data?.confidence || 'low',
          evidence: data?.evidence || [],
          lastQuestion: question,
        },
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      const isTimeout = message.includes('REQUEST_TIMEOUT')
      const fallbackCard = sourceMap?.keyConcepts
        ?.map((item) => normalizeConceptCard(item, language))
        .find((item) => item.term === conceptTerm)
      const fallbackFiles = fallbackCard?.whereToFind?.slice(0, 3) || []
      const localFallbackAnswer = isZh
        ? [
            `AI 请求超时，先用本地建议继续学习「${conceptTerm}」。`,
            fallbackFiles.length > 0 ? `建议先看：${fallbackFiles.join('、')}。` : '建议先从 README.md 和入口文件开始。',
            fallbackCard?.whyItMatters || `先理解「${conceptTerm}」在项目里的职责，再回到模块实现细节。`,
          ].join('\n')
        : [
            `The AI request timed out, so here is a local fallback for "${conceptTerm}".`,
            fallbackFiles.length > 0 ? `Start with: ${fallbackFiles.join(', ')}.` : 'Start from README.md and the entry files.',
            fallbackCard?.whyItMatters || `Understand what "${conceptTerm}" is responsible for before diving into implementation details.`,
          ].join('\n')
      setConceptAnswers((prev) => ({
        ...prev,
        [conceptTerm]: {
          ...prev[conceptTerm],
          status: isTimeout ? 'done' : 'error',
          answer: isTimeout ? localFallbackAnswer : prev[conceptTerm]?.answer,
          confidence: isTimeout ? 'low' : prev[conceptTerm]?.confidence,
          evidence: isTimeout ? [] : prev[conceptTerm]?.evidence,
          error: isTimeout
            ? undefined
            : (err instanceof Error ? err.message : (isZh ? '提问失败' : 'Failed to ask')),
          lastQuestion: question,
        },
      }))
    }
  }, [conceptAnswers, isZh, language, repo, sendRuntimeMessage, sourceMap])

  // View tabs
  const viewButtons: { id: ViewMode; label: string }[] = [
    { id: 'diagram', label: isZh ? '架构' : 'Diagram' },
    { id: 'modules', label: isZh ? '模块' : 'Modules' },
    { id: 'path', label: isZh ? '路径' : 'Path' },
    { id: 'mission', label: isZh ? '任务' : 'Mission' },
    { id: 'concepts', label: isZh ? '概念' : 'Concepts' },
  ]

  const sourceStatus = useMemo(() => {
    if (!sourceMap) return null
    const score = typeof sourceMap.completenessScore === 'number'
      ? ` · ${sourceMap.completenessScore}%`
      : ''
    if (sourceMap.source === 'fallback' || sourceMap.quality === 'fallback') {
      return isZh ? `来源：Fallback（基础版）${score}` : `Source: Fallback (base)${score}`
    }
    if (sourceMap.source === 'ai-merged') {
      return isZh ? `来源：AI 部分合并${score}` : `Source: AI partial merge${score}`
    }
    if (sourceMap.quality === 'complete') {
      return isZh ? `来源：AI 完整输出${score}` : `Source: AI complete${score}`
    }
    return isZh ? `来源：AI 部分输出${score}` : `Source: AI partial${score}`
  }, [isZh, sourceMap])

  const displayLearningPath = useMemo(() => {
    if (!sourceMap) return []
    const normalizeFile = (path: string) => String(path || '').replace(/\\/g, '/').trim()
    const moduleFiles = Array.from(
      new Set(
        sourceMap.coreModules
          .flatMap((module) => module.keyFiles || [])
          .map(normalizeFile)
          .filter(Boolean),
      ),
    )
    const defaultFiles = moduleFiles.length > 0 ? moduleFiles : ['README.md', 'package.json']
    const templates = [
      {
        phase: 1,
        title: isZh ? '了解项目结构' : 'Understand Project Structure',
        goal: isZh ? '熟悉项目目录和主要文件。' : 'Get familiar with folders and key files.',
        estimatedMinutes: 15,
      },
      {
        phase: 2,
        title: isZh ? '阅读入口文件' : 'Read Entry Files',
        goal: isZh ? '理解项目启动和初始化流程。' : 'Understand startup and bootstrap flow.',
        estimatedMinutes: 30,
      },
      {
        phase: 3,
        title: isZh ? '深入核心逻辑' : 'Dive into Core Logic',
        goal: isZh ? '理解核心模块和数据流。' : 'Understand core modules and data flow.',
        estimatedMinutes: 60,
      },
    ]
    const byPhase = new Map<number, (typeof sourceMap.learningPath)[number]>()
    sourceMap.learningPath.forEach((phase, index) => {
      const phaseNo = typeof phase.phase === 'number' ? phase.phase : index + 1
      const files = Array.from(
        new Set([...(phase.files || []), ...defaultFiles]),
      ).slice(0, 5)
      byPhase.set(phaseNo, {
        ...phase,
        phase: phaseNo,
        files,
      })
    })

    const normalized = templates.map((template, index) => {
      const existing = byPhase.get(template.phase) || sourceMap.learningPath[index]
      if (existing) {
        const files = Array.from(
          new Set([...(existing.files || []), ...defaultFiles]),
        ).slice(0, 5)
        return {
          ...existing,
          phase: template.phase,
          title: existing.title || template.title,
          goal: existing.goal || template.goal,
          files,
          estimatedMinutes: existing.estimatedMinutes || template.estimatedMinutes,
        }
      }
      return {
        phase: template.phase,
        title: template.title,
        goal: template.goal,
        files: defaultFiles.slice(0, Math.min(3, defaultFiles.length)),
        estimatedMinutes: template.estimatedMinutes,
        prerequisites: [],
      }
    })

    return normalized.filter((phase) => (phase.files || []).length > 0)
  }, [isZh, sourceMap])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-500 mt-3">
          {isZh ? '加载中...' : 'Loading...'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {sourceMap?.architectureType && (
            <span className="text-xs text-gray-500">
              {sourceMap.architectureType}
            </span>
          )}
        </div>
        <button
          onClick={handleRegenerate}
          disabled={analyzing}
          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded transition flex items-center gap-1"
        >
          {analyzing ? (
            <>
              <LoadingSpinner size="sm" />
              {isZh ? '分析中' : 'Analyzing'}
            </>
          ) : (
            isZh ? '刷新' : 'Refresh'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Summary */}
      {sourceMap?.architectureSummary && (
        <div className="text-sm text-gray-600 bg-gray-50 rounded p-3">
          {sourceMap.architectureSummary}
        </div>
      )}

      {sourceStatus && (
        <div className="text-xs px-3 py-2 rounded border border-gray-200 bg-white text-gray-600 flex items-center justify-between">
          <span>{sourceStatus}</span>
          {analyzing && (
            <span className="text-blue-600">{isZh ? '后台补全中...' : 'Refining in background...'}</span>
          )}
        </div>
      )}

      {/* View Tabs */}
      <div className="flex border-b border-gray-200">
        {viewButtons.map(btn => (
          <button
            key={btn.id}
            onClick={() => setActiveView(btn.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              activeView === btn.id
                ? 'border-gray-800 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[300px]">
        {/* No data state */}
        {!sourceMap && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-gray-500 mb-4">
              {isZh ? '暂无数据' : 'No data available'}
            </p>
            <button
              onClick={handleRegenerate}
              disabled={analyzing}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {analyzing ? (isZh ? '生成中...' : 'Generating...') : (isZh ? '生成源码地图' : 'Generate Source Map')}
            </button>
          </div>
        )}

        {/* Diagram View */}
        {activeView === 'diagram' && sourceMap && (
          <div className="space-y-4">
            {sourceMap.mermaidDiagram ? (
              <div className="bg-white border border-gray-200 rounded p-4 overflow-x-auto">
                <MermaidDiagram 
                  chart={sourceMap.mermaidDiagram} 
                  onError={(err) => console.warn('[SourceMapTab] Mermaid error:', err)}
                />
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded p-8 text-center">
                <p className="text-sm text-gray-500">
                  {isZh ? '暂无架构图' : 'No diagram available'}
                </p>
                <button
                  onClick={handleRegenerate}
                  disabled={analyzing}
                  className="mt-3 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded"
                >
                  {analyzing ? (isZh ? '生成中...' : 'Generating...') : (isZh ? '生成' : 'Generate')}
                </button>
              </div>
            )}

            {/* Dependencies */}
            {sourceMap.dependencies && sourceMap.dependencies.length > 0 && (
              <div className="border border-gray-200 rounded p-3">
                <h4 className="text-xs font-medium text-gray-600 mb-2">
                  {isZh ? '依赖关系' : 'Dependencies'}
                </h4>
                <div className="space-y-1">
                  {sourceMap.dependencies.slice(0, 10).map((dep, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-700">{dep.from}</span>
                      <span className="text-gray-400">-&gt;</span>
                      <span className="text-gray-500">{dep.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modules View */}
        {activeView === 'modules' && sourceMap && (
          <ModuleList 
            modules={sourceMap.coreModules} 
            language={language}
            onFileClick={(path) => {
              window.open(`https://github.com/${repo.owner}/${repo.name}/blob/${defaultBranch}/${path}`, '_blank')
            }}
          />
        )}

        {/* Learning Path View */}
        {activeView === 'path' && sourceMap && (
          <LearningPath
            phases={displayLearningPath}
            language={language}
            onFileClick={(path) => {
              window.open(`https://github.com/${repo.owner}/${repo.name}/blob/${defaultBranch}/${path}`, '_blank')
            }}
          />
        )}

        {/* Mission View */}
        {activeView === 'mission' && sourceMap && mission && (
          <LearningMission
            mission={mission}
            language={language}
            repoKey={repoKey}
            onFileClick={(path) => {
              window.open(`https://github.com/${repo.owner}/${repo.name}/blob/${defaultBranch}/${path}`, '_blank')
            }}
          />
        )}
        {activeView === 'mission' && sourceMap && !mission && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">{isZh ? '任务生成中...' : 'Building mission...'}</p>
          </div>
        )}

        {/* Concepts View */}
        {activeView === 'concepts' && sourceMap && (
          <div className="space-y-2">
            {sourceMap.keyConcepts && sourceMap.keyConcepts.length > 0 ? (
              sourceMap.keyConcepts.map((concept, i) => {
                const card = normalizeConceptCard(concept, language)
                const answerState = conceptAnswers[card.term]
                const isAsking = answerState?.status === 'loading'
                return (
                <div key={i} className="border border-gray-200 rounded p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium text-gray-800 text-sm">{card.term}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      card.importance === 'essential'
                        ? 'bg-red-100 text-red-600'
                        : card.importance === 'important'
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {card.importance}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-700">
                      {isZh ? '通俗解释' : 'Beginner Explanation'}
                    </p>
                    <p className="text-sm text-gray-700">{card.beginnerExplanation}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-700">
                      {isZh ? '为什么重要' : 'Why It Matters'}
                    </p>
                    <p className="text-sm text-gray-700">{card.whyItMatters}</p>
                  </div>

                  {card.whereToFind && card.whereToFind.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {card.whereToFind.map((file, j) => (
                        <button
                          key={j}
                          onClick={() => window.open(`https://github.com/${repo.owner}/${repo.name}/blob/${defaultBranch}/${file}`, '_blank')}
                          className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
                        >
                          {file}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      disabled={isAsking}
                      onClick={() =>
                        handleConceptQuickAsk(
                          card.term,
                          isZh
                            ? `我应该先看哪个文件来理解「${card.term}」？`
                            : `Which file should I read first to understand "${card.term}"?`,
                        )
                      }
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isZh ? '先看哪里？' : 'Where to start?'}
                    </button>
                    <button
                      disabled={isAsking}
                      onClick={() =>
                        handleConceptQuickAsk(
                          card.term,
                          isZh
                            ? `「${card.term}」在这个项目里具体解决什么问题？`
                            : `What problem does "${card.term}" solve in this project?`,
                        )
                      }
                      className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isZh ? '解决什么？' : 'What problem?'}
                    </button>
                  </div>

                  {answerState?.status === 'loading' && (
                    <p className="text-xs text-gray-500">
                      {isZh
                        ? '思考中...（若较久无响应，可稍后重试）'
                        : 'Thinking... (if it takes too long, retry later)'}
                    </p>
                  )}
                  {(answerState?.status === 'error' || answerState?.status === 'timeout') && answerState?.error && (
                    <div className="flex items-center gap-2">
                    <p className="text-xs text-red-600">{answerState.error}</p>
                      {answerState.lastQuestion && (
                        <button
                          onClick={() => handleConceptQuickAsk(card.term, answerState.lastQuestion || '')}
                          className="text-[11px] px-2 py-0.5 bg-red-50 text-red-700 rounded hover:bg-red-100"
                        >
                          {isZh ? '重试' : 'Retry'}
                        </button>
                      )}
                    </div>
                  )}
                  {answerState?.answer && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-2 space-y-1">
                      <p className="text-xs text-gray-700 whitespace-pre-line">{answerState.answer}</p>
                      <p className="text-[11px] text-gray-500">
                        {isZh ? '置信度' : 'Confidence'}: {answerState.confidence || 'low'}
                      </p>
                      {answerState.evidence && answerState.evidence.length > 0 && (
                        <ul className="space-y-1">
                          {answerState.evidence.slice(0, 2).map((item, idx) => (
                            <li key={idx} className="text-[11px] text-gray-600 bg-white rounded px-2 py-1">
                              <p className="font-mono">{item.filePath || (isZh ? '未知文件' : 'unknown file')}</p>
                              <p>{item.reason}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )})
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">{isZh ? '暂无概念' : 'No concepts'}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tip */}
      <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        {isZh 
          ? '点击文件名在 GitHub 中打开'
          : 'Click file names to open on GitHub'
        }
      </div>
    </div>
  )
}

export default SourceMapTab
