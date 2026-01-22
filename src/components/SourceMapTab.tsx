import React, { useState } from 'react'
import { generateSourceMap } from '@/services/analysis'

interface SourceMapTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function SourceMapTab({ repo, language }: SourceMapTabProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0)
  const sourceMap = generateSourceMap(language)

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
