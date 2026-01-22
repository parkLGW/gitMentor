import React, { useState, useEffect } from 'react'
import { getReadme } from '@/services/github'
import { generateQuickStart } from '@/services/analysis'

interface QuickStartTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function QuickStartTab({ repo, language }: QuickStartTabProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const readme = await getReadme(repo.owner, repo.name)
        const quickStart = generateQuickStart(readme, language)
        setData(quickStart)
      } catch (err) {
        console.error('Failed to load quick start data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [repo, language])

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
