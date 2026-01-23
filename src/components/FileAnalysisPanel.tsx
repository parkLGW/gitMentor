import { useState } from 'react'
import { FileAnalysis } from '@/services/ai-analysis'
import { LoadingSpinner } from './LoadingSpinner'

interface FileAnalysisPanelProps {
  analysis: FileAnalysis | null
  loading: boolean
  error: string | null
  fileName: string
  language: 'zh' | 'en'
}

export function FileAnalysisPanel({
  analysis,
  loading,
  error,
  fileName,
  language,
}: FileAnalysisPanelProps) {
  const [expandedFunction, setExpandedFunction] = useState<number | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoadingSpinner size="sm" />
        <span className="ml-2 text-xs text-gray-600">
          {language === 'zh' ? '分析中...' : 'Analyzing...'}
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-3">
        <p className="text-xs text-red-700">{error}</p>
      </div>
    )
  }

  if (!analysis) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* File Overview */}
      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <p className="text-xs font-mono text-blue-600 mb-1">{fileName}</p>
        <p className="text-sm text-blue-900">{analysis.fileOverview}</p>
      </div>

      {/* Difficulty & Key Takeaway */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-purple-50 border border-purple-200 rounded p-2">
          <p className="text-xs font-bold text-purple-900 mb-1">
            {language === 'zh' ? '难度' : 'Difficulty'}
          </p>
          <p className="text-xs text-purple-800">
            {analysis.difficulty === 'beginner'
              ? language === 'zh'
                ? '初级'
                : 'Beginner'
              : analysis.difficulty === 'intermediate'
                ? language === 'zh'
                  ? '中级'
                  : 'Intermediate'
                : language === 'zh'
                  ? '高级'
                  : 'Advanced'}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded p-2">
          <p className="text-xs font-bold text-green-900 mb-1">
            {language === 'zh' ? '要点' : 'Takeaway'}
          </p>
          <p className="text-xs text-green-800 line-clamp-2">{analysis.keyTakeaway}</p>
        </div>
      </div>

      {/* Functions/Classes */}
      {analysis.functions && analysis.functions.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <p className="text-xs font-bold text-gray-900 mb-2">
            {language === 'zh' ? '函数和类' : 'Functions & Classes'}
          </p>
          <div className="space-y-1">
            {analysis.functions.map((func, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFunction(expandedFunction === i ? null : i)}
                  className="w-full text-left p-2 hover:bg-gray-50 flex justify-between items-center transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                          func.type === 'class'
                            ? 'bg-blue-100 text-blue-900'
                            : func.type === 'export'
                              ? 'bg-green-100 text-green-900'
                              : func.type === 'constant'
                                ? 'bg-yellow-100 text-yellow-900'
                                : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        {func.type === 'class'
                          ? 'C'
                          : func.type === 'export'
                            ? 'E'
                            : func.type === 'constant'
                              ? 'K'
                              : 'F'}
                      </span>
                      <code className="text-xs font-mono text-gray-900 truncate">
                        {func.name}
                      </code>
                      <span
                        className={`text-xs px-1 rounded ${
                          func.complexity === 'simple'
                            ? 'bg-green-100 text-green-900'
                            : func.complexity === 'moderate'
                              ? 'bg-yellow-100 text-yellow-900'
                              : 'bg-red-100 text-red-900'
                        }`}
                      >
                        {func.complexity}
                      </span>
                    </div>
                  </div>
                  <span className="text-gray-600 ml-1">
                    {expandedFunction === i ? '−' : '+'}
                  </span>
                </button>
                {expandedFunction === i && (
                  <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 space-y-1">
                    <p className="text-xs text-gray-700">{func.description}</p>
                    {func.parameters && func.parameters.length > 0 && (
                      <p className="text-xs text-gray-600">
                        <span className="font-bold">Params:</span>{' '}
                        {func.parameters.join(', ')}
                      </p>
                    )}
                    {func.returns && (
                      <p className="text-xs text-gray-600">
                        <span className="font-bold">Returns:</span> {func.returns}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies */}
      {analysis.dependencies && analysis.dependencies.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <p className="text-xs font-bold text-gray-900 mb-1">
            {language === 'zh' ? '依赖' : 'Dependencies'}
          </p>
          <div className="space-y-0.5">
            {analysis.dependencies.map((dep, i) => (
              <p key={i} className="text-xs font-mono text-gray-700">
                • {dep}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Exports */}
      {analysis.exports && analysis.exports.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <p className="text-xs font-bold text-gray-900 mb-1">
            {language === 'zh' ? '导出' : 'Exports'}
          </p>
          <div className="flex flex-wrap gap-1">
            {analysis.exports.map((exp, i) => (
              <span
                key={i}
                className="bg-blue-100 text-blue-900 text-xs px-2 py-0.5 rounded font-mono"
              >
                {exp}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
