import React, { useState, useEffect } from 'react'
import { getReadme, getRepoTree } from '@/services/github'
import { generateQuickStart } from '@/services/analysis'
import { AIAnalysisService, QuickStartGuide } from '@/services/ai-analysis'
import { useLLM } from '@/hooks/useLLM'

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

        // Try to load cached AI data
        const cacheKey = `gitmentor_quickstart_${repo.owner}/${repo.name}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          setAiData(JSON.parse(cached))
        }
      } catch (err) {
        console.error('Failed to load quick start data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [repo, language])

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

  if (loading) {
    return <div className="text-center text-gray-500 py-4">{language === 'zh' ? '加载中...' : 'Loading...'}</div>
  }

  if (!data) {
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
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-900">
              {language === 'zh' ? '✨ 用AI生成最优快速上手指南' : '✨ AI-Powered Quick Start'}
            </p>
            <button
              onClick={handleAIAnalysis}
              disabled={aiLoading || !isConfigured()}
              className="px-2 py-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded text-xs font-medium transition"
            >
              {aiLoading ? (language === 'zh' ? '生成中...' : 'Generating...') : 'AI'}
            </button>
          </div>
          {!isConfigured() && (
            <p className="text-xs text-purple-700 mt-1">
              {language === 'zh' ? '需要在设置中配置AI提供商' : 'Configure AI provider in Settings'}
            </p>
          )}
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
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-purple-900">
              {language === 'zh' ? '✨ AI生成的快速上手指南' : '✨ AI Quick Start Guide'}
            </p>
            <button
              onClick={() => setAiData(null)}
              className="text-xs text-purple-600 hover:text-purple-900 underline"
            >
              {language === 'zh' ? '重新生成' : 'Regenerate'}
            </button>
          </div>

          {aiData.steps && aiData.steps.length > 0 && (
            <div className="space-y-2 mb-3">
              {aiData.steps.map((step, i) => (
                <div key={i} className="border border-purple-200 rounded">
                  <button
                    onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                    className="w-full text-left p-2 hover:bg-purple-100 flex justify-between items-center"
                  >
                    <p className="text-xs font-medium text-purple-900">{step.title}</p>
                    <span className="text-xs">{expandedStep === i ? '−' : '+'}</span>
                  </button>
                  {expandedStep === i && (
                    <div className="px-2 pb-2 bg-purple-50 border-t border-purple-200">
                      <p className="text-xs text-gray-700 mb-1">{step.description}</p>
                      {step.commands && (
                        <div className="bg-gray-900 text-green-400 p-1 rounded text-xs font-mono">
                          {step.commands.map((cmd, j) => <div key={j}>{cmd}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
    </div>
  )
}

export default QuickStartTab
