import { useState, useEffect } from 'react'
import { getRepoInfo, getReadme } from '@/services/github'
import { analyzeReadme } from '@/services/analysis'
import { AIAnalysisService, ProjectAnalysis } from '@/services/ai-analysis'
import { useLLMReady } from '@/hooks/useLLMReady'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from './LoadingSpinner'
import { StorageKeys } from '@/constants/storage'
import { getJsonCache, setJsonCacheWithEviction } from '@/utils/local-cache'

interface OverviewTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function OverviewTab({ repo, language }: OverviewTabProps) {
  const [repoInfo, setRepoInfo] = useState<any>(null)
  const [overview, setOverview] = useState<any>(null)
  const [aiAnalysis, setAiAnalysis] = useState<ProjectAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const llmReady = useLLMReady()

  useEffect(() => {
    let cancelled = false

    // AI runs after the base view is shown, never blocking the main loading state
    const runAiAnalysis = async (projectInfo: string, readme: string, cacheKey: string) => {
      setAiLoading(true)
      setAiError(null)
      try {
        const analysis = await AIAnalysisService.analyzeProject(projectInfo, readme, language)
        if (cancelled) return
        setAiAnalysis(analysis)
        setJsonCacheWithEviction(cacheKey, analysis)
      } catch (aiErr) {
        console.warn('[GitMentor] AI analysis failed, using basic analysis:', aiErr)
        if (!cancelled) setAiError(aiErr instanceof Error ? aiErr.message : 'AI analysis failed')
      } finally {
        if (!cancelled) setAiLoading(false)
      }
    }

    const loadData = async () => {
      try {
        // Fetch repo info
        const info = await getRepoInfo(repo.owner, repo.name)
        if (cancelled) return
        setRepoInfo(info)

        // Try to load AI analysis from cache first (7 days expiration)
        const cacheKey = StorageKeys.overviewAnalysis(repo)
        const cachedAnalysis = getJsonCache<ProjectAnalysis>(cacheKey, 7 * 24 * 60 * 60 * 1000)
        if (cachedAnalysis) {
          setAiAnalysis(cachedAnalysis)
          return // Use cached AI analysis
        }

        // Fetch README
        let readme = ''
        try {
          readme = await getReadme(repo.owner, repo.name)
          if (cancelled) return
          setOverview(analyzeReadme(readme))
        } catch (readmeErr) {
          console.warn('Failed to fetch README, using basic info only', readmeErr)
        }

        // Auto-trigger AI analysis if provider is configured
        if (llmReady) {
          void runAiAnalysis(`${info.name} (${info.language})`, readme, cacheKey)
        }
      } catch (err) {
        console.error('Failed to load overview data:', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()

    return () => {
      cancelled = true
    }
  }, [repo, language, llmReady])

  const handleAIAnalysis = async () => {
    if (!llmReady) {
      setAiError(language === 'zh' ? '请先在设置中配置AI提供商' : 'Please configure AI provider in Settings')
      return
    }

    setAiLoading(true)
    setAiError(null)

    try {
      const readme = overview ? '' : await getReadme(repo.owner, repo.name)
      const projectInfo = `${repoInfo.name} (${repoInfo.language})`
      const analysis = await AIAnalysisService.analyzeProject(
        projectInfo,
        readme || (overview?.coreValue || ''),
        language
      )
      setAiAnalysis(analysis)

      // Cache the result with timestamp
      const cacheKey = StorageKeys.overviewAnalysis(repo)
      setJsonCacheWithEviction(cacheKey, analysis)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center text-gray-500 py-4">{language === 'zh' ? '加载中...' : 'Loading...'}</div>
  }

  if (error || !repoInfo) {
    return <div className="text-center text-red-500 py-4">{error || (language === 'zh' ? '无法加载数据' : 'Failed to load data')}</div>
  }

  const getDifficultyLabel = (difficulty: string) => {
    const labels: Record<string, Record<string, string>> = {
      beginner: { zh: '初级', en: 'Beginner' },
      intermediate: { zh: '中级', en: 'Intermediate' },
      advanced: { zh: '高级', en: 'Advanced' },
    }
    return labels[difficulty]?.[language] || difficulty
  }

  const getDifficultyColorClasses = (difficulty: string): string => {
    if (difficulty === 'advanced') {
      return 'bg-red-100 text-red-900'
    } else if (difficulty === 'intermediate') {
      return 'bg-yellow-100 text-yellow-900'
    } else {
      return 'bg-green-100 text-green-900'
    }
  }

  const coreValue = overview?.coreValue || repoInfo.description
  const difficulty = overview?.difficulty || 'intermediate'
  const problems = overview?.problems || []
  const useCases = overview?.useCases || []

  const isArchived = repoInfo.archived
  const daysOld = Math.floor((Date.now() - new Date(repoInfo.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
  const isActive = daysOld < 90

  return (
    <div className="space-y-4">
      {/* AI Analysis Button */}
      {!aiAnalysis && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-900">
                {language === 'zh' ? 'AI 项目分析' : 'AI Analysis'}
              </p>
              {!llmReady && (
                <p className="text-xs text-gray-600 mt-1">
                  {language === 'zh' ? '设置中配置 AI 提供商' : 'Configure AI provider in Settings'}
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleAIAnalysis}
              disabled={aiLoading || !llmReady}
              className="flex items-center gap-1 whitespace-nowrap"
            >
              {aiLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  {language === 'zh' ? '分析中' : 'Analyzing'}
                </>
              ) : (
                language === 'zh' ? '生成分析' : 'Generate'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <p className="text-xs text-red-700">{aiError}</p>
        </div>
      )}

      {/* AI Analysis Results */}
      {aiAnalysis && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <p className="text-xs font-semibold text-gray-900">
              {language === 'zh' ? '项目分析' : 'Analysis'}
            </p>
            <button
              onClick={() => setAiAnalysis(null)}
              className="text-xs text-blue-600 hover:text-blue-800 underline transition"
            >
              {language === 'zh' ? '重新分析' : 'Reanalyze'}
            </button>
          </div>

          {/* Core Value */}
          <div className="space-y-1.5">
            <p className="text-sm font-bold text-gray-900">{language === 'zh' ? '核心价值' : 'Core Value'}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{aiAnalysis.coreValue}</p>
          </div>

          {/* Difficulty & Audience */}
          <div className="grid grid-cols-2 gap-3 border-t border-gray-200 pt-3">
            <div>
              <p className="text-xs font-bold text-gray-900 mb-1.5">{language === 'zh' ? '难度' : 'Difficulty'}</p>
              <p className="text-sm text-gray-700">
                {aiAnalysis.difficulty === 'beginner'
                  ? language === 'zh'
                    ? '初级'
                    : 'Beginner'
                  : aiAnalysis.difficulty === 'intermediate'
                    ? language === 'zh'
                      ? '中级'
                      : 'Intermediate'
                    : language === 'zh'
                      ? '高级'
                      : 'Advanced'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 mb-1.5">{language === 'zh' ? '面向群体' : 'For'}</p>
              <p className="text-sm text-gray-700">{aiAnalysis.targetAudience}</p>
            </div>
          </div>

          {/* Problems */}
          {aiAnalysis.problems.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-bold text-gray-900 mb-2">{language === 'zh' ? '解决的问题' : 'Problems'}</p>
              <ul className="text-sm text-gray-700 space-y-1 ml-4">
                {aiAnalysis.problems.map((p: string, i: number) => (
                  <li key={i} className="list-disc">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Use Cases */}
          {aiAnalysis.useCases.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-bold text-gray-900 mb-2">{language === 'zh' ? '应用场景' : 'Use Cases'}</p>
              <ul className="text-sm text-gray-700 space-y-1 ml-4">
                {aiAnalysis.useCases.map((u: string, i: number) => (
                  <li key={i} className="list-disc">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Features */}
          {aiAnalysis.keyFeatures.length > 0 && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-xs font-bold text-gray-900 mb-2">{language === 'zh' ? '主要功能' : 'Features'}</p>
              <div className="flex flex-wrap gap-2">
                {aiAnalysis.keyFeatures.map((f, i) => (
                  <span key={i} className="bg-blue-100 text-blue-900 text-xs px-2.5 py-1 rounded font-medium">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Badge */}
      {isArchived && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
          <p className="text-xs text-red-700 font-semibold">
            {language === 'zh' ? '⚠️ 项目已存档' : '⚠️ Project Archived'}
          </p>
        </div>
      )}

      {/* Only show fallback content if no AI analysis */}
      {!aiAnalysis && (
        <>
          {/* Core Value */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-gray-600 font-semibold">
              {language === 'zh' ? '核心价值' : 'Core Value'}
            </p>
            <p className="text-sm text-gray-900 mt-1 line-clamp-2">{coreValue}</p>
          </div>

          {/* Difficulty & Activity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">
                {language === 'zh' ? '学习难度' : 'Difficulty'}
              </p>
              <div className={`inline-block ${getDifficultyColorClasses(difficulty)} px-3 py-1 rounded text-xs font-medium`}>
                {getDifficultyLabel(difficulty)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">
                {language === 'zh' ? '更新状态' : 'Activity'}
              </p>
              <div className={`inline-block ${isActive ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-900'} px-3 py-1 rounded text-xs font-medium`}>
                {isActive ? (language === 'zh' ? '活跃' : 'Active') : (language === 'zh' ? `${daysOld}天前` : `${daysOld}d ago`)}
              </div>
            </div>
          </div>

          {/* Problems */}
          {problems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {language === 'zh' ? '解决的问题' : 'Problems Solved'}
              </p>
              <div className="space-y-1">
                {problems.map((problem: string, i: number) => (
                  <p key={i} className="text-xs text-gray-700">• {problem}</p>
                ))}
              </div>
            </div>
          )}

          {/* Use Cases */}
          {useCases.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {language === 'zh' ? '适用场景' : 'Use Cases'}
              </p>
              <div className="space-y-1">
                {useCases.map((useCase: string, i: number) => (
                  <p key={i} className="text-xs text-gray-700">• {useCase}</p>
                ))}
              </div>
            </div>
          )}

          {/* Project Health */}
          <div className="space-y-2 border-t border-gray-200 pt-3">
            <p className="text-xs font-semibold text-gray-600">
              {language === 'zh' ? '项目热度' : 'Popularity'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-600 flex items-center justify-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
                  </svg>
                  {language === 'zh' ? '星标' : 'Stars'}
                </p>
                <p className="font-bold text-gray-900">{repoInfo.stars > 1000 ? (repoInfo.stars / 1000).toFixed(1) + 'k' : repoInfo.stars}</p>
              </div>
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-600 flex items-center justify-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
                  </svg>
                  {language === 'zh' ? '分叉' : 'Forks'}
                </p>
                <p className="font-bold text-gray-900">{repoInfo.forks > 1000 ? (repoInfo.forks / 1000).toFixed(1) + 'k' : repoInfo.forks}</p>
              </div>
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-600 flex items-center justify-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
                  </svg>
                  {language === 'zh' ? '问题' : 'Issues'}
                </p>
                <p className="font-bold text-gray-900">{repoInfo.openIssues}</p>
              </div>
            </div>
          </div>

          {/* Tech Info */}
          <div className="space-y-2 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600">
                {language === 'zh' ? '主要语言' : 'Language'}
              </p>
              <div className="inline-block bg-blue-100 text-blue-900 px-2 py-1 rounded text-xs font-medium">
                {repoInfo.language}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {language === 'zh' ? '最后更新：' : 'Last updated: '}
              {new Date(repoInfo.updatedAt).toLocaleDateString()}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default OverviewTab
