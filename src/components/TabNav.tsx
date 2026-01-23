

interface TabNavProps {
  activeTab: 'overview' | 'quickstart' | 'sourcemap' | 'settings'
  setActiveTab: (tab: 'overview' | 'quickstart' | 'sourcemap' | 'settings') => void
  language: 'zh' | 'en'
}

function TabNav({ activeTab, setActiveTab, language }: TabNavProps) {
  const tabs = [
    { id: 'overview', label: language === 'zh' ? '📋 概览' : '📋 Overview', icon: '📋' },
    { id: 'quickstart', label: language === 'zh' ? '🚀 快速上手' : '🚀 Quick Start', icon: '🚀' },
    { id: 'sourcemap', label: language === 'zh' ? '🗺️ 源码地图' : '🗺️ Source Map', icon: '🗺️' },
    { id: 'settings', label: language === 'zh' ? '⚙️ 设置' : '⚙️ Settings', icon: '⚙️' },
  ]

  return (
    <div className="flex border-b border-gray-200 bg-gray-50">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as 'overview' | 'quickstart' | 'sourcemap')}
          className={`flex-1 px-4 py-3 text-sm font-medium text-center transition ${
            activeTab === tab.id
              ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {tab.icon} {tab.label.split(' ')[1]}
        </button>
      ))}
    </div>
  )
}

export default TabNav
