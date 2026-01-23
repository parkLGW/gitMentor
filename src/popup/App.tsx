import { useState } from 'react'
import TabNav from '@/components/TabNav'
import OverviewTab from '@/components/OverviewTab'
import QuickStartTab from '@/components/QuickStartTab'
import SourceMapTab from '@/components/SourceMapTab'
import SettingsTab from '@/components/SettingsTab'
import { useRepo } from '@/hooks/useRepo'
import { useLanguage } from '@/hooks/useLanguage'

type TabType = 'overview' | 'quickstart' | 'sourcemap' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const { repo, loading, error } = useRepo()
  const { language, setLanguage } = useLanguage()

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-pulse text-gray-500">
          {language === 'zh' ? '加载中...' : 'Loading...'}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-500 text-sm">
          {language === 'zh' 
            ? '请在 GitHub 项目页打开此插件' 
            : 'Please open this extension on a GitHub project page'}
        </div>
      </div>
    )
  }

  if (!repo) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-500 text-sm">
          {language === 'zh' 
            ? '无法识别此项目' 
            : 'Unable to recognize this project'}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-gray-900">GitMentor</h1>
          <button
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded transition"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
        <p className="text-xs text-gray-600">
          {repo.owner}/{repo.name}
        </p>
      </div>

      {/* Tab Navigation */}
      <TabNav activeTab={activeTab} setActiveTab={setActiveTab} language={language} />

      {/* Tab Content */}
      <div className="max-h-[600px] overflow-y-auto">
        {activeTab === 'settings' && <SettingsTab language={language} />}
        {activeTab !== 'settings' && (
          <div className="px-4 py-4">
            {activeTab === 'overview' && <OverviewTab repo={repo} language={language} />}
            {activeTab === 'quickstart' && <QuickStartTab repo={repo} language={language} />}
            {activeTab === 'sourcemap' && <SourceMapTab repo={repo} language={language} />}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
