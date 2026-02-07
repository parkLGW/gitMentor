// Source Map Tab - Simplified UI with race condition prevention
import { useState, useEffect, useRef, useCallback } from 'react'
import { LoadingSpinner } from './LoadingSpinner'
import { MermaidDiagram } from './MermaidDiagram'
import { ModuleList } from './ModuleList'
import { LearningPath } from './LearningPath'
import { SourceMapOutput } from '@/prompts/types'
import { collectDeepContext } from '@/services/context-collector'
import { createSourceMapPrompt, parseSourceMapResponse, createSourceMapFallback } from '@/prompts'
import { llmManager } from '@/services/llm'
import { eventBus, EVENTS } from '@/utils/eventBus'

interface SourceMapTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
  defaultBranch?: string
}

type ViewMode = 'diagram' | 'modules' | 'path' | 'concepts'

function SourceMapTab({ repo, language, defaultBranch = 'main' }: SourceMapTabProps) {
  const [activeView, setActiveView] = useState<ViewMode>('diagram')
  const [sourceMap, setSourceMap] = useState<SourceMapOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmReady, setLlmReady] = useState(false)

  const isZh = language === 'zh'
  const cacheKey = `gitmentor_sourcemap_v3_${repo.owner}/${repo.name}_${language}`
  
  // 用于防止竞态条件的 ref
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef<number>(0)

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

  // Load data
  useEffect(() => {
    const loadData = async () => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal
      
      // Increment request ID
      const currentRequestId = ++requestIdRef.current
      
      setLoading(true)
      setError(null)

      try {
        // Try cache first (7 days expiration)
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            const isExpired = Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000 // 7 days
            
            // 验证缓存有效：有 timestamp 且未过期，且有基本数据
            if (!isExpired && data && data.architectureType) {
              // Check if this is still the current request
              if (currentRequestId !== requestIdRef.current) {
                console.log('[SourceMapTab] Request cancelled, ignoring cached result')
                return
              }
              
              setSourceMap(data)
              setLoading(false)
              console.log('[SourceMapTab] Loaded from cache (valid for', Math.round((7 * 24 * 60 * 60 * 1000 - (Date.now() - timestamp)) / 1000 / 60 / 60), 'hours)')
              return
            } else {
              console.log('[SourceMapTab] Cache expired or invalid, removing')
              localStorage.removeItem(cacheKey)
            }
          } catch (e) {
            console.warn('[SourceMapTab] Invalid cache format')
            localStorage.removeItem(cacheKey)
          }
        }

        // Generate fallback first (always has mermaidDiagram)
        const context = await collectDeepContext(repo.owner, repo.name)
        
        // Check if request was cancelled
        if (signal.aborted) {
          console.log('[SourceMapTab] Request cancelled after context collection')
          return
        }
        
        const fallback = createSourceMapFallback(context, language)
        console.log('[SourceMapTab] Generated fallback, mermaidDiagram:', !!fallback.mermaidDiagram)
        
        // Check again before updating state
        if (currentRequestId !== requestIdRef.current) {
          console.log('[SourceMapTab] Request cancelled before state update')
          return
        }
        
        setSourceMap(fallback)
        setLoading(false)

        // Try AI if ready
        if (llmReady) {
          await runAnalysis(signal, currentRequestId)
        }
      } catch (err) {
        if (signal.aborted) {
          console.log('[SourceMapTab] Request aborted')
          return
        }
        
        console.error('[SourceMapTab] Load error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load')
        setLoading(false)
      }
    }

    loadData()
  }, [repo.owner, repo.name, language, llmReady, cacheKey])

  // Run AI analysis with cancellation support
  const runAnalysis = useCallback(async (signal: AbortSignal, requestId: number) => {
    const provider = llmManager.getCurrentProvider()
    if (!provider) {
      console.log('[SourceMapTab] No LLM provider')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      console.log('[SourceMapTab] Starting AI analysis...')
      const context = await collectDeepContext(repo.owner, repo.name)
      
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
      
      const parsed = parseSourceMapResponse(response.content)

      // Check if this is still the current request
      if (requestId !== requestIdRef.current) {
        console.log('[SourceMapTab] Request ID mismatch, ignoring AI result')
        return
      }

      if (parsed && parsed.mermaidDiagram) {
        setSourceMap(parsed)
        localStorage.setItem(cacheKey, JSON.stringify({ data: parsed, timestamp: Date.now() }))
        console.log('[SourceMapTab] AI analysis complete, saved to cache')
      } else if (parsed) {
        // AI 返回了数据但没有架构图，保留 fallback 的架构图
        console.log('[SourceMapTab] AI response missing mermaidDiagram, keeping fallback diagram')
        setSourceMap(prev => ({
          ...parsed,
          mermaidDiagram: prev?.mermaidDiagram || parsed.mermaidDiagram || ''
        }))
      } else {
        console.log('[SourceMapTab] AI parse failed, keeping fallback')
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
        console.log('[SourceMapTab] LLM configured, running AI analysis...')
        const provider = llmManager.getCurrentProvider()
        if (provider) {
          try {
            const prompt = createSourceMapPrompt(context, language)
            const response = await provider.complete(prompt, undefined, signal)
            
            if (signal.aborted) {
              console.log('[SourceMapTab] AI analysis cancelled during regeneration')
              return
            }
            
            const parsed = parseSourceMapResponse(response.content)
            
            if (currentRequestId !== requestIdRef.current) {
              console.log('[SourceMapTab] Request ID mismatch after AI analysis')
              return
            }
            
            if (parsed && parsed.mermaidDiagram) {
              console.log('[SourceMapTab] AI analysis successful')
              setSourceMap(parsed)
              localStorage.setItem(cacheKey, JSON.stringify({ data: parsed, timestamp: Date.now() }))
            } else {
              console.log('[SourceMapTab] AI response invalid, using fallback')
            }
          } catch (aiErr) {
            console.error('[SourceMapTab] AI analysis failed:', aiErr)
            // 继续使用 fallback
          }
        }
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
  }, [repo.owner, repo.name, language, cacheKey])

  // View tabs
  const viewButtons: { id: ViewMode; label: string }[] = [
    { id: 'diagram', label: isZh ? '架构' : 'Diagram' },
    { id: 'modules', label: isZh ? '模块' : 'Modules' },
    { id: 'path', label: isZh ? '路径' : 'Path' },
    { id: 'concepts', label: isZh ? '概念' : 'Concepts' },
  ]

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
            phases={sourceMap.learningPath} 
            language={language}
            repoKey={`${repo.owner}/${repo.name}`}
            onFileClick={(path) => {
              window.open(`https://github.com/${repo.owner}/${repo.name}/blob/${defaultBranch}/${path}`, '_blank')
            }}
          />
        )}

        {/* Concepts View */}
        {activeView === 'concepts' && sourceMap && (
          <div className="space-y-2">
            {sourceMap.keyConcepts && sourceMap.keyConcepts.length > 0 ? (
              sourceMap.keyConcepts.map((concept, i) => (
                <div key={i} className="border border-gray-200 rounded p-3">
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium text-gray-800 text-sm">{concept.term}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      concept.importance === 'essential'
                        ? 'bg-red-100 text-red-600'
                        : concept.importance === 'important'
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {concept.importance}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{concept.definition}</p>
                  {concept.relatedFiles && concept.relatedFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {concept.relatedFiles.map((file, j) => (
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
                </div>
              ))
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
