interface TabNavProps {
  activeTab: 'overview' | 'quickstart' | 'sourcemap' | 'settings'
  setActiveTab: (tab: 'overview' | 'quickstart' | 'sourcemap' | 'settings') => void
  language: 'zh' | 'en'
}

function TabNav({ activeTab, setActiveTab, language }: TabNavProps) {
  const tabs = [
    { id: 'overview', label: language === 'zh' ? '概览' : 'Overview' },
    { id: 'quickstart', label: language === 'zh' ? '快速上手' : 'Quick Start' },
    { id: 'sourcemap', label: language === 'zh' ? '源码地图' : 'Source Map' },
    { id: 'settings', label: language === 'zh' ? '设置' : 'Settings' },
  ]

  return (
    <div className="flex border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as 'overview' | 'quickstart' | 'sourcemap' | 'settings')}
          className={`flex-1 px-3 py-2 text-sm font-medium text-center transition ${
            activeTab === tab.id
              ? 'border-b-2 border-gray-800 text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default TabNav
