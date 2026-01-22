import React from 'react'

interface QuickStartTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function QuickStartTab({ repo, language }: QuickStartTabProps) {
  const content = {
    zh: {
      title: '快速上手指南',
      prerequisites: '前置知识',
      installation: '安装步骤',
      example: '第一个示例',
      commonIssues: '常见坑位',
      nextSteps: '下一步',
      coming: '功能开发中，敬请期待...',
    },
    en: {
      title: 'Quick Start Guide',
      prerequisites: 'Prerequisites',
      installation: 'Installation',
      example: 'First Example',
      commonIssues: 'Common Issues',
      nextSteps: 'Next Steps',
      coming: 'Feature under development, stay tuned...',
    },
  }

  const texts = content[language]

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center text-sm text-gray-600">
        {texts.coming}
      </div>
      <p className="text-xs text-gray-500 text-center">
        {language === 'zh' 
          ? '本功能基于项目文档实时分析，为您生成最短从 0 到 1 的路径。'
          : 'This feature analyzes project documentation in real-time to generate the shortest path from 0 to 1.'}
      </p>
    </div>
  )
}

export default QuickStartTab
