// Module List Component - Simplified
import { useState } from 'react'
import { CoreModule } from '@/prompts/types'

interface ModuleListProps {
  modules: CoreModule[]
  language: 'zh' | 'en'
  onFileClick?: (path: string) => void
}

export function ModuleList({ modules, language, onFileClick }: ModuleListProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const isZh = language === 'zh'

  const toggleModule = (moduleName: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(moduleName)) {
        next.delete(moduleName)
      } else {
        next.add(moduleName)
      }
      return next
    })
  }

  // Sort by importance
  const sortedModules = [...modules].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.importance] - order[b.importance]
  })

  if (modules.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">{isZh ? '暂无模块信息' : 'No module information'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortedModules.map((module) => {
        const isExpanded = expandedModules.has(module.name)
        
        return (
          <div
            key={module.path}
            className={`border rounded overflow-hidden ${
              module.importance === 'high' 
                ? 'border-l-2 border-l-red-500' 
                : module.importance === 'medium'
                  ? 'border-l-2 border-l-yellow-500'
                  : 'border-gray-200'
            }`}
          >
            <div
              className="p-3 cursor-pointer hover:bg-gray-50 transition"
              onClick={() => toggleModule(module.name)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{module.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      module.importance === 'high'
                        ? 'bg-red-100 text-red-600'
                        : module.importance === 'medium'
                          ? 'bg-yellow-100 text-yellow-600'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {module.importance === 'high' 
                        ? (isZh ? '核心' : 'core')
                        : module.importance === 'medium'
                          ? (isZh ? '重要' : 'important')
                          : (isZh ? '辅助' : 'helper')
                      }
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{module.path}</p>
                </div>
                <span className="text-gray-400 text-xs">{isExpanded ? '-' : '+'}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{module.responsibility}</p>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-gray-100">
                {module.description && (
                  <p className="text-sm text-gray-600 mt-2">{module.description}</p>
                )}
                
                {module.keyFiles && module.keyFiles.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">
                      {isZh ? '关键文件' : 'Key files'}:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {module.keyFiles.map(file => {
                        // 构建完整路径：如果 file 已经是完整路径就直接用，否则拼接 module.path
                        const fullPath = file.includes('/') 
                          ? file 
                          : `${module.path.replace(/\/$/, '')}/${file}`
                        
                        return (
                          <button
                            key={file}
                            onClick={(e) => {
                              e.stopPropagation()
                              onFileClick?.(fullPath)
                            }}
                            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition"
                          >
                            {file}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ModuleList
