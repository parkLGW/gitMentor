// Learning Path Component - read-only roadmap view
import { useState } from 'react'
import { LearningPhase } from '@/prompts/types'

interface LearningPathProps {
  phases: LearningPhase[]
  language: 'zh' | 'en'
  onFileClick?: (path: string) => void
}

export function LearningPath({ phases, language, onFileClick }: LearningPathProps) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(phases[0]?.phase || null)
  const isZh = language === 'zh'
  const totalMinutes = phases.reduce((sum, phase) => sum + phase.estimatedMinutes, 0)

  if (phases.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">{isZh ? '暂无学习路径' : 'No learning path'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 flex items-center justify-between">
        <span>
          {isZh ? '推荐阅读顺序（只读）' : 'Recommended reading order (read-only)'}
        </span>
        <span>
          {phases.length} {isZh ? '阶段' : 'phases'} · {totalMinutes} {isZh ? '分钟' : 'min'}
        </span>
      </div>

      <div className="space-y-2">
        {phases.map((phase) => {
          const isExpanded = expandedPhase === phase.phase
          return (
            <div key={phase.phase} className="border border-gray-200 rounded overflow-hidden">
              <button
                className="w-full p-3 text-left hover:bg-gray-50 transition"
                onClick={() => setExpandedPhase(isExpanded ? null : phase.phase)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium bg-gray-800 text-white">
                    {phase.phase}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800 text-sm">{phase.title}</h4>
                    <p className="text-xs text-gray-500">{phase.goal}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>{phase.files.length} {isZh ? '文件' : 'files'}</div>
                    <div>{phase.estimatedMinutes}min</div>
                  </div>
                  <span className="text-gray-400 text-xs">{isExpanded ? '-' : '+'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-100">
                  <div className="mt-2 space-y-1">
                    {phase.files.map((file) => (
                      <button
                        key={file}
                        onClick={() => onFileClick?.(file)}
                        className="block text-left text-sm text-gray-600 hover:text-gray-900 transition"
                      >
                        {file}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LearningPath
