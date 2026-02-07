// Learning Path Component - with per-project progress tracking
import { useState, useEffect } from 'react'
import { LearningPhase } from '@/prompts/types'

interface LearningPathProps {
  phases: LearningPhase[]
  language: 'zh' | 'en'
  repoKey: string // 用于区分不同项目的进度
  onFileClick?: (path: string) => void
}

interface PhaseProgress {
  [phaseNumber: number]: {
    completed: boolean
    filesRead: Set<string>
  }
}

const PROGRESS_STORAGE_PREFIX = 'gitmentor_learning_progress_'

export function LearningPath({ phases, language, repoKey, onFileClick }: LearningPathProps) {
  const [progress, setProgress] = useState<PhaseProgress>({})
  const [expandedPhase, setExpandedPhase] = useState<number | null>(1)
  const isZh = language === 'zh'
  
  const storageKey = `${PROGRESS_STORAGE_PREFIX}${repoKey}`

  // Load progress
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        const restored: PhaseProgress = {}
        Object.entries(parsed).forEach(([key, value]: [string, any]) => {
          restored[parseInt(key)] = {
            completed: value.completed,
            filesRead: new Set(value.filesRead || [])
          }
        })
        setProgress(restored)
      } else {
        // Reset progress when no saved data for this repo
        setProgress({})
      }
    } catch (error) {
      console.warn('[LearningPath] Failed to load progress:', error)
      setProgress({})
    }
  }, [storageKey])

  // Save progress
  const saveProgress = (newProgress: PhaseProgress) => {
    try {
      const toSave: Record<number, { completed: boolean; filesRead: string[] }> = {}
      Object.entries(newProgress).forEach(([key, value]) => {
        toSave[parseInt(key)] = {
          completed: value.completed,
          filesRead: Array.from(value.filesRead)
        }
      })
      localStorage.setItem(storageKey, JSON.stringify(toSave))
    } catch (error) {
      console.warn('[LearningPath] Failed to save progress:', error)
    }
  }

  const markFileAsRead = (phaseNum: number, filePath: string) => {
    setProgress(prev => {
      const phaseProgress = prev[phaseNum] || { completed: false, filesRead: new Set() }
      const newFilesRead = new Set(phaseProgress.filesRead)
      
      if (newFilesRead.has(filePath)) {
        newFilesRead.delete(filePath)
      } else {
        newFilesRead.add(filePath)
      }

      const phase = phases.find(p => p.phase === phaseNum)
      const allFilesRead = phase ? phase.files.every(f => newFilesRead.has(f)) : false

      const newProgress = {
        ...prev,
        [phaseNum]: {
          completed: allFilesRead,
          filesRead: newFilesRead
        }
      }

      saveProgress(newProgress)
      return newProgress
    })
  }

  // Calculate progress
  const totalFiles = phases.reduce((sum, p) => sum + p.files.length, 0)
  const completedFiles = Object.values(progress).reduce(
    (sum, p) => sum + p.filesRead.size, 
    0
  )
  const overallProgress = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0
  const totalMinutes = phases.reduce((sum, p) => sum + p.estimatedMinutes, 0)

  if (phases.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">{isZh ? '暂无学习路径' : 'No learning path'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-gray-50 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">
            {isZh ? '进度' : 'Progress'}
          </span>
          <span className="text-sm font-medium">{overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-gray-800 rounded-full h-1.5 transition-all"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>{completedFiles}/{totalFiles} {isZh ? '文件' : 'files'}</span>
          <span>{totalMinutes} {isZh ? '分钟' : 'min'}</span>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-2">
        {phases.map((phase, index) => {
          const phaseProgress = progress[phase.phase] || { completed: false, filesRead: new Set() }
          const isExpanded = expandedPhase === phase.phase
          const isLocked = index > 0 && !progress[phases[index - 1].phase]?.completed
          const filesReadCount = phaseProgress.filesRead.size

          return (
            <div
              key={phase.phase}
              className={`border rounded overflow-hidden ${
                phaseProgress.completed
                  ? 'border-green-200 bg-green-50'
                  : isLocked
                    ? 'border-gray-200 bg-gray-50 opacity-50'
                    : 'border-gray-200'
              }`}
            >
              <div
                className={`p-3 ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                onClick={() => !isLocked && setExpandedPhase(isExpanded ? null : phase.phase)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    phaseProgress.completed
                      ? 'bg-green-500 text-white'
                      : isLocked
                        ? 'bg-gray-300 text-gray-500'
                        : 'bg-gray-800 text-white'
                  }`}>
                    {phaseProgress.completed ? '✓' : phase.phase}
                  </div>

                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800 text-sm">{phase.title}</h4>
                    <p className="text-xs text-gray-500">{phase.goal}</p>
                  </div>

                  <div className="text-right text-xs text-gray-500">
                    <div>{filesReadCount}/{phase.files.length}</div>
                    <div>{phase.estimatedMinutes}min</div>
                  </div>

                  <span className="text-gray-400 text-xs">{isExpanded ? '-' : '+'}</span>
                </div>
              </div>

              {isExpanded && !isLocked && (
                <div className="px-3 pb-3 border-t border-gray-100">
                  <div className="mt-2 space-y-1">
                    {phase.files.map(file => {
                      const isRead = phaseProgress.filesRead.has(file)
                      return (
                        <div key={file} className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              markFileAsRead(phase.phase, file)
                            }}
                            className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                              isRead
                                ? 'bg-green-500 border-green-500 text-white'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            {isRead && '✓'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onFileClick?.(file)
                            }}
                            className={`text-sm hover:text-gray-900 transition ${
                              isRead ? 'text-gray-400 line-through' : 'text-gray-600'
                            }`}
                          >
                            {file}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reset */}
      <button
        onClick={() => {
          if (confirm(isZh ? '重置进度？' : 'Reset progress?')) {
            setProgress({})
            localStorage.removeItem(storageKey)
          }
        }}
        className="text-xs text-gray-400 hover:text-red-500 transition"
      >
        {isZh ? '重置进度' : 'Reset'}
      </button>
    </div>
  )
}

export default LearningPath
