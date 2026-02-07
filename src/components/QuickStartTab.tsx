// Quick Start Tab - AI 生成的快速入门指南
import { useState, useEffect } from 'react'
import { LoadingSpinner } from './LoadingSpinner'
import { collectQuickContext } from '@/services/context-collector'
import { getRepoInfo } from '@/services/github'
import { AIAnalysisService, QuickStartGuide } from '@/services/ai-analysis'
import { llmManager } from '@/services/llm'
import { eventBus, EVENTS } from '@/utils/eventBus'

interface QuickStartTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

// 代码块组件 - 带复制功能
function CodeBlock({ 
  code, 
  isZh = false 
}: { 
  code: string
  language?: string
  isZh?: boolean 
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-gray-100 px-3 py-3 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
        title={isZh ? '复制代码' : 'Copy code'}
      >
        {copied ? (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {isZh ? '已复制' : 'Copied'}
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {isZh ? '复制' : 'Copy'}
          </>
        )}
      </button>
    </div>
  )
}

// 缓存 key
function getCacheKey(owner: string, name: string, lang: string): string {
  return `gitmentor_quickstart_${owner}/${name}_${lang}`
}

function QuickStartTab({ repo, language }: QuickStartTabProps) {
  const [guide, setGuide] = useState<QuickStartGuide | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)

  const isZh = language === 'zh'

  // 检查 LLM 配置 - 使用事件驱动而非轮询
  useEffect(() => {
    const checkConfig = () => {
      const configured = llmManager.isConfigured()
      setIsConfigured(configured)
    }

    // Initial check
    checkConfig()

    // Subscribe to config change events
    const unsubscribe = eventBus.on(EVENTS.LLM_CONFIG_CHANGED, checkConfig)
    const unsubscribeClear = eventBus.on(EVENTS.LLM_CONFIG_CLEARED, () => {
      setIsConfigured(false)
    })

    return () => {
      unsubscribe()
      unsubscribeClear()
    }
  }, [])

  const loadData = async (clearCache = false) => {
    const cacheKey = getCacheKey(repo.owner, repo.name, language)
    
    // 检查缓存
    if (!clearCache) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          // 24小时缓存
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            setGuide(data)
            setError(null)
            return true
          }
        }
      } catch (e) {
        console.warn('[QuickStartTab] Cache read error:', e)
      }
    }

    // 检查 LLM 配置
    if (!llmManager.isConfigured()) {
      setError(isZh ? '请先配置 AI 服务' : 'Please configure AI service first')
      return false
    }

    try {
      // 并行收集项目上下文和仓库信息
      const [context, repoInfo] = await Promise.all([
        collectQuickContext(repo.owner, repo.name),
        getRepoInfo(repo.owner, repo.name)
      ])
      
      const projectInfo = `Repository: ${repo.owner}/${repo.name}
Stars: ${repoInfo.stars || 'N/A'}
Language: ${repoInfo.language || 'N/A'}
Description: ${repoInfo.description || 'N/A'}`

      // 调用 AI 生成快速入门指南
      const result = await AIAnalysisService.generateQuickStart(
        projectInfo,
        context.readme || '',
        context.packageJson ? JSON.stringify(context.packageJson, null, 2) : undefined,
        language
      )

      setGuide(result)
      setError(null)

      // 保存缓存
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          data: result,
          timestamp: Date.now()
        }))
      } catch (e) {
        console.warn('[QuickStartTab] Cache write error:', e)
      }

      return true
    } catch (err) {
      console.error('[QuickStartTab] AI analysis error:', err)
      setError(err instanceof Error ? err.message : 'AI analysis failed')
      return false
    }
  }

  useEffect(() => {
    if (isConfigured) {
      setLoading(true)
      loadData().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [repo.owner, repo.name, isConfigured, language])

  const handleRefresh = async () => {
    setRefreshing(true)
    // 清除缓存
    const cacheKey = getCacheKey(repo.owner, repo.name, language)
    localStorage.removeItem(cacheKey)
    await loadData(true)
    setRefreshing(false)
  }

  // 未配置 AI
  if (!isConfigured) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 mb-4">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium text-gray-600">
            {isZh ? '需要配置 AI 服务' : 'AI Service Required'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {isZh ? '请在设置中配置 API Key' : 'Please configure API Key in Settings'}
          </p>
        </div>
      </div>
    )
  }

  // 加载中
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-500 mt-3">
          {isZh ? 'AI 正在分析项目...' : 'AI is analyzing the project...'}
        </p>
      </div>
    )
  }

  // 错误
  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {refreshing ? (isZh ? '重试中...' : 'Retrying...') : (isZh ? '重试' : 'Retry')}
        </button>
      </div>
    )
  }

  if (!guide) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">{isZh ? '无数据' : 'No data'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-200">
        <span className="text-xs text-gray-500">
          {isZh ? 'AI 生成' : 'AI Generated'}
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded transition flex items-center gap-1"
        >
          {refreshing ? (
            <>
              <LoadingSpinner size="sm" />
              {isZh ? '刷新中' : 'Refreshing'}
            </>
          ) : (
            isZh ? '刷新' : 'Refresh'
          )}
        </button>
      </div>

      {/* Prerequisites */}
      {guide.prerequisites && guide.prerequisites.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {isZh ? '前置条件' : 'Prerequisites'}
          </h3>
          <ul className="space-y-1">
            {guide.prerequisites.map((item, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Steps */}
      {guide.steps && guide.steps.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            {isZh ? '安装步骤' : 'Installation Steps'}
          </h3>
          <div className="space-y-4">
            {guide.steps.map((step, i) => (
              <div key={i} className="relative pl-7">
                <div className="absolute left-0 top-0 w-5 h-5 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-800">{step.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                  {step.commands && step.commands.length > 0 && (
                    <div className="mt-2">
                      <CodeBlock 
                        code={step.commands.join('\n')} 
                        isZh={isZh}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* First Example */}
      {guide.firstExample && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {isZh ? '第一个示例' : 'First Example'}
          </h3>
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">{guide.firstExample.title}</h4>
            <CodeBlock 
              code={guide.firstExample.code} 
              language="javascript"
              isZh={isZh}
            />
            <p className="text-xs text-gray-600 pt-1">{guide.firstExample.explanation}</p>
          </div>
        </section>
      )}

      {/* Common Mistakes */}
      {guide.commonMistakes && guide.commonMistakes.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {isZh ? '常见问题' : 'Common Issues'}
          </h3>
          <div className="space-y-2">
            {guide.commonMistakes.map((mistake, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800 font-medium">{mistake.issue}</p>
                <p className="text-sm text-amber-700 mt-1">{mistake.solution}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next Steps */}
      {guide.nextSteps && (
        <section className="pt-2 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {isZh ? '下一步' : 'Next Steps'}
          </h3>
          <p className="text-sm text-gray-600">{guide.nextSteps}</p>
        </section>
      )}

      {/* Link to README */}
      <div className="pt-2 border-t border-gray-100">
        <a
          href={`https://github.com/${repo.owner}/${repo.name}#readme`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {isZh ? '查看完整 README →' : 'View full README →'}
        </a>
      </div>
    </div>
  )
}

export default QuickStartTab
