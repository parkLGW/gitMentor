import { useState, useEffect } from 'react'
import { getReadme } from '@/services/github'
import { generateQuickStart } from '@/services/analysis'
import { AIAnalysisService, QuickStartGuide } from '@/services/ai-analysis'
import { useLLM } from '@/hooks/useLLM'
import { LoadingSpinner } from './LoadingSpinner'

interface QuickStartTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function QuickStartTab({ repo, language }: QuickStartTabProps) {
  const [data, setData] = useState<any>(null)
  const [aiData, setAiData] = useState<QuickStartGuide | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const { isConfigured } = useLLM()

  useEffect(() => {
    const loadData = async () => {
      try {
        const readme = await getReadme(repo.owner, repo.name)
        const quickStart = generateQuickStart(readme, language)
        setData(quickStart)

        // Try to load cached AI data first
        const cacheKey = `gitmentor_quickstart_${repo.owner}/${repo.name}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          try {
            setAiData(JSON.parse(cached))
            setLoading(false)
            return // Use cached AI analysis
          } catch (e) {
            console.warn('Failed to parse cached analysis')
          }
        }

        // Auto-trigger AI analysis if provider is configured
        if (isConfigured()) {
          try {
            console.log('[GitMentor] Auto-running Quick Start AI analysis...')
            setAiLoading(true)
            const projectInfo = `${repo.name} project`
            const guide = await AIAnalysisService.generateQuickStart(
              projectInfo,
              readme,
              undefined,
              language
            )
            setAiData(guide)

            // Cache the result
            localStorage.setItem(cacheKey, JSON.stringify(guide))
          } catch (aiErr) {
            console.warn('[GitMentor] Quick Start AI analysis failed:', aiErr)
            setAiError(aiErr instanceof Error ? aiErr.message : 'AI analysis failed')
          } finally {
            setAiLoading(false)
          }
        }
      } catch (err) {
        console.error('Failed to load quick start data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [repo, language, isConfigured])

  const handleAIAnalysis = async () => {
    if (!isConfigured()) {
      setAiError(language === 'zh' ? '请先在设置中配置AI提供商' : 'Please configure AI provider in Settings')
      return
    }

    setAiLoading(true)
    setAiError(null)

    try {
      const readme = await getReadme(repo.owner, repo.name)
      const projectInfo = `${repo.name} project`
      const guide = await AIAnalysisService.generateQuickStart(
        projectInfo,
        readme,
        undefined,
        language
      )
      setAiData(guide)

      // Cache the result
      const cacheKey = `gitmentor_quickstart_${repo.owner}/${repo.name}`
      localStorage.setItem(cacheKey, JSON.stringify(guide))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading || aiLoading) {
    return <div className="text-center text-gray-500 py-4 space-y-2">
      <div>{language === 'zh' ? '生成快速上手指南中...' : 'Generating Quick Start Guide...'}</div>
      <div className="text-xs text-gray-400">{language === 'zh' ? '这可能需要几秒钟' : 'This may take a few seconds'}</div>
    </div>
  }

  if (!data && !aiData) {
    return <div className="text-center text-gray-500 py-4">{language === 'zh' ? '无法加载数据' : 'Failed to load data'}</div>
  }

  const labels = {
    zh: {
      prerequisites: '前置知识',
      installation: '安装步骤',
      example: '第一个示例',
      commonIssues: '常见坑位',
      step: '步骤',
    },
    en: {
      prerequisites: 'Prerequisites',
      installation: 'Installation Steps',
      example: 'First Example',
      commonIssues: 'Common Issues',
      step: 'Step',
    },
  }

  const texts = labels[language]

  return (
    <div className="space-y-4">
      {/* AI Analysis Button */}
      {!aiData && (
        <div className="bg-white border border-gray-300 rounded-lg p-3 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-900">
                {language === 'zh' ? '快速上手指南' : 'Quick Start'}
              </p>
              {!isConfigured() && (
                <p className="text-xs text-gray-600 mt-1">
                  {language === 'zh' ? '设置中配置 AI 提供商' : 'Configure AI provider in Settings'}
                </p>
              )}
            </div>
            <button
              onClick={handleAIAnalysis}
              disabled={aiLoading || !isConfigured()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded text-xs font-medium transition flex items-center gap-1 whitespace-nowrap"
            >
              {aiLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  {language === 'zh' ? '生成中' : 'Generating'}
                </>
              ) : (
                language === 'zh' ? '生成' : 'Generate'
              )}
            </button>
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
      {aiData && (
        <div className="bg-white border border-gray-300 rounded-lg p-3 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <p className="text-xs font-semibold text-gray-900">
              {language === 'zh' ? '快速上手' : 'Getting Started'}
            </p>
            <button
              onClick={() => setAiData(null)}
              className="text-xs text-blue-600 hover:text-blue-800 underline transition"
            >
              {language === 'zh' ? '重新生成' : 'Regenerate'}
            </button>
          </div>

          {/* Prerequisites */}
          {aiData.prerequisites && aiData.prerequisites.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-900 mb-1">
                {language === 'zh' ? '前置条件' : 'Prerequisites'}
              </p>
              <ul className="text-xs text-gray-700 space-y-0.5 ml-4">
                {aiData.prerequisites.map((pre, i) => (
                  <li key={i} className="list-disc">
                    {pre}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps */}
          {aiData.steps && aiData.steps.length > 0 && (
            <div className="border-t border-gray-200 pt-2">
              <p className="text-xs font-semibold text-gray-900 mb-2">
                {language === 'zh' ? '安装' : 'Installation'}
              </p>
              <div className="space-y-2">
                {aiData.steps.map((step, i) => (
                  <div key={i} className="border border-gray-300 rounded overflow-hidden bg-white">
                    <button
                      onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                      className="w-full text-left p-2 hover:bg-gray-50 flex justify-between items-center transition"
                    >
                      <div>
                        <p className="text-xs font-medium text-gray-900">{i + 1}. {step.title}</p>
                      </div>
                      <span className="text-gray-600">{expandedStep === i ? '−' : '+'}</span>
                    </button>
                    {expandedStep === i && (
                      <div className="px-3 pb-2 bg-gray-50 border-t border-gray-200 space-y-2">
                        <p className="text-xs text-gray-700">{step.description}</p>
                        {step.commands && step.commands.length > 0 && (
                          <div className="bg-gray-900 text-green-400 p-2 rounded text-xs font-mono space-y-1 overflow-x-auto">
                            {step.commands.map((cmd, j) => (
                              <div key={j} className="select-all">
                                $ {cmd}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* First Example */}
          {aiData.firstExample && (
            <div className="border-t border-gray-200 pt-2">
              <p className="text-xs font-semibold text-gray-900 mb-1">
                {language === 'zh' ? '示例' : 'Example'}
              </p>
              <div className="bg-white border border-gray-300 rounded p-2 space-y-2">
                <p className="text-xs font-medium text-gray-900">{aiData.firstExample.title}</p>
                <div className="bg-gray-900 text-green-400 p-2 rounded text-xs font-mono overflow-x-auto">
                  {aiData.firstExample.code}
                </div>
                <p className="text-xs text-gray-700">{aiData.firstExample.explanation}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Only show fallback content if no AI data */}
      {!aiData && (
        <>
          {/* Prerequisites */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">✓ {texts.prerequisites}</p>
            <div className="space-y-1">
              {data.prerequisites.map((prereq: string, i: number) => (
                <p key={i} className="text-xs text-gray-700 bg-gray-50 rounded px-2 py-1">
                  • {prereq}
                </p>
              ))}
            </div>
          </div>

          {/* Installation Steps */}
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">📦 {texts.installation}</p>
            <div className="space-y-2">
              {data.installSteps.map((step: string, i: number) => (
                <div key={i} className="bg-gray-900 rounded p-2">
                  <p className="text-xs text-gray-400 mb-1">
                    {texts.step} {i + 1}:
                  </p>
                  <code className="text-xs text-green-400 whitespace-pre-wrap break-words">
                    {step}
                  </code>
                </div>
              ))}
            </div>
          </div>

          {/* Basic Example */}
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">💡 {texts.example}</p>
            <div className="bg-gray-900 rounded p-2">
              <code className="text-xs text-green-400 whitespace-pre-wrap break-words">
                {data.basicExample}
              </code>
            </div>
          </div>

          {/* Common Issues */}
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">⚠️ {texts.commonIssues}</p>
            <div className="space-y-2">
              {data.commonIssues.map((issue: any, i: number) => (
                <div key={i} className="border border-orange-200 rounded p-2">
                  <button
                    onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                    className="w-full text-left flex items-center justify-between hover:bg-orange-50 p-1 rounded transition"
                  >
                    <p className="text-xs font-medium text-orange-900">
                      {issue.error}
                    </p>
                    <span className="text-xs text-orange-700">
                      {expandedIssue === i ? '−' : '+'}
                    </span>
                  </button>
                  {expandedIssue === i && (
                    <p className="text-xs text-gray-700 mt-2 bg-orange-50 p-1 rounded">
                      ✓ {issue.solution}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tip */}
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <p className="text-xs text-blue-900">
              {language === 'zh'
                ? '💡 提示：详细文档请查看项目官方文档'
                : '💡 Tip: Check project documentation for more details'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default QuickStartTab
