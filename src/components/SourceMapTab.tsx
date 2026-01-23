import { useState } from 'react'
import { generateSourceMap } from '@/services/analysis'
import { AIAnalysisService, SourceCodeMap } from '@/services/ai-analysis'
import { useLLM } from '@/hooks/useLLM'
import { LoadingSpinner } from './LoadingSpinner'

interface SourceMapTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function SourceMapTab({ repo, language }: SourceMapTabProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0)
  const [aiData, setAiData] = useState<SourceCodeMap | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const { isConfigured } = useLLM()
  const sourceMap = generateSourceMap(language)

  const handleAIAnalysis = async () => {
    if (!isConfigured()) {
      setAiError(language === 'zh' ? '请先在设置中配置AI提供商' : 'Please configure AI provider in Settings')
      return
    }

    setAiLoading(true)
    setAiError(null)

    try {
      const projectInfo = `${repo.name} project`
      const guide = await AIAnalysisService.generateSourceMap(
        projectInfo,
        'placeholder',
        undefined,
        language
      )
      setAiData(guide)

      // Cache the result
      const cacheKey = `gitmentor_sourcemap_${repo.owner}/${repo.name}`
      localStorage.setItem(cacheKey, JSON.stringify(guide))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  const labels = {
    zh: {
      architecture: '整体架构',
      keyFiles: '关键文件地图',
      priority: '优先级',
      readingOrder: '推荐阅读顺序',
      concepts: '关键概念',
      phase: '阶段',
    },
    en: {
      architecture: 'Architecture Overview',
      keyFiles: 'Key File Map',
      priority: 'Priority',
      readingOrder: 'Recommended Reading Order',
      concepts: 'Key Concepts',
      phase: 'Phase',
    },
  }

  const texts = labels[language]

  const getPriorityLabel = (priority: number) => {
    const icons = ['⭐⭐⭐ Must-read', '⭐⭐ Important', '⭐ Optional']
    const zhIcons = ['⭐⭐⭐ 必读', '⭐⭐ 重要', '⭐ 可选']
    return language === 'zh' ? zhIcons[priority - 1] : icons[priority - 1]
  }

  const getPriorityColor = (priority: number) => {
    return priority === 1 ? 'red' : priority === 2 ? 'amber' : 'blue'
  }

  return (
    <div className="space-y-4">
      {/* AI Analysis Button */}
      {!aiData && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-900">
                {language === 'zh' ? '✨ AI生成学习路线' : '✨ AI Learning Path'}
              </p>
              {!isConfigured() && (
                <p className="text-xs text-purple-700 mt-1">
                  {language === 'zh' ? '需要在设置中配置AI提供商' : 'Configure AI provider in Settings'}
                </p>
              )}
            </div>
            <button
              onClick={handleAIAnalysis}
              disabled={aiLoading || !isConfigured()}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded text-xs font-medium transition flex items-center gap-1 whitespace-nowrap"
            >
              {aiLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  {language === 'zh' ? '生成中' : 'Generating'}
                </>
              ) : (
                <>✨ AI</>
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
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-900">
              {language === 'zh' ? '✨ 学习路线' : '✨ Learning Path'}
            </p>
            <button
              onClick={() => setAiData(null)}
              className="text-xs text-purple-600 hover:text-purple-900 underline transition"
            >
              {language === 'zh' ? '重新生成' : 'Regenerate'}
            </button>
          </div>

          {/* Architecture */}
          <div>
            <p className="text-xs font-semibold text-purple-800 mb-1">
              {language === 'zh' ? '架构概览' : 'Architecture'}
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">{aiData.architecture}</p>
          </div>

          {/* Key Concepts */}
          {aiData.keyConcepts && aiData.keyConcepts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-800 mb-1">
                {language === 'zh' ? '关键概念' : 'Key Concepts'}
              </p>
              <div className="space-y-1">
                {aiData.keyConcepts.slice(0, 3).map((concept, i) => (
                  <div key={i} className="bg-white rounded p-1.5 border border-purple-200">
                    <p className="text-xs font-medium text-purple-900">{concept.term}</p>
                    <p className="text-xs text-gray-700">{concept.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files Map */}
          {aiData.files && aiData.files.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-purple-800 mb-1">
                {language === 'zh' ? '文件优先级' : 'File Priority'}
              </p>
              <div className="space-y-1">
                {aiData.files.slice(0, 3).map((file, i) => (
                  <div
                    key={i}
                    className={`border-l-2 ${
                      file.priority === 'critical'
                        ? 'border-red-500 bg-red-50'
                        : file.priority === 'important'
                          ? 'border-yellow-500 bg-yellow-50'
                          : 'border-blue-500 bg-blue-50'
                    } rounded p-1.5`}
                  >
                    <p className="text-xs font-medium text-gray-900">{file.path}</p>
                    <p className="text-xs text-gray-600">{file.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Architecture */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">🏗️ {texts.architecture}</p>
        <p className="text-xs text-gray-700">{sourceMap.architecture}</p>
      </div>

      {/* Key Files */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">📁 {texts.keyFiles}</p>
        <div className="space-y-2">
          {sourceMap.keyFiles.map((file, i) => (
            <div
              key={i}
              className={`border-l-4 border-${getPriorityColor(file.priority)}-500 rounded p-2 bg-gray-50`}
            >
              <p className="text-xs font-medium text-gray-900">{file.path}</p>
              <p className="text-xs text-gray-600 mt-1">{file.description}</p>
              <p className={`text-xs mt-1 text-${getPriorityColor(file.priority)}-700`}>
                {getPriorityLabel(file.priority)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Reading Order */}
      <div className="border-t border-gray-200 pt-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">📚 {texts.readingOrder}</p>
        <div className="space-y-2">
          {sourceMap.readingOrder.map((phase, i) => (
            <div key={i} className="border border-blue-200 rounded">
              <button
                onClick={() => setExpandedPhase(expandedPhase === i ? null : i)}
                className="w-full text-left flex items-center justify-between hover:bg-blue-50 p-2 rounded transition"
              >
                <p className="text-xs font-medium text-blue-900">{phase}</p>
                <span className="text-xs text-blue-700">
                  {expandedPhase === i ? '−' : '+'}
                </span>
              </button>
              {expandedPhase === i && (
                <div className="px-2 pb-2 bg-blue-50">
                  <p className="text-xs text-gray-700">
                    {language === 'zh'
                      ? '在这个阶段，你应该理解项目的核心概念和整体架构。'
                      : 'In this phase, you should understand the core concepts and overall architecture.'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Key Concepts */}
      <div className="border-t border-gray-200 pt-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">💡 {texts.concepts}</p>
        <div className="space-y-1">
          {sourceMap.keyConcepts.map((concept, i) => (
            <div key={i} className="bg-yellow-50 rounded p-2">
              <p className="text-xs font-medium text-gray-900">{concept.term}</p>
              <p className="text-xs text-gray-700 mt-1">{concept.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tip */}
      <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
        <p className="text-xs text-green-900">
          {language === 'zh'
            ? '💡 小贴士：按推荐顺序阅读，建立整体认知后再深入细节。'
            : '💡 Tip: Follow the recommended order and establish overall understanding before diving into details.'}
        </p>
      </div>
    </div>
  )
}

export default SourceMapTab
