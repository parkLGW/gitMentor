import React from 'react'

interface SourceMapTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function SourceMapTab({ repo, language }: SourceMapTabProps) {
  const content = {
    zh: {
      title: '源码学习地图',
      architecture: '项目架构',
      fileMap: '关键文件地图',
      readingOrder: '推荐阅读顺序',
      concepts: '关键概念',
      checkpoints: '学习检验点',
      coming: '功能开发中，敬请期待...',
    },
    en: {
      title: 'Source Code Learning Map',
      architecture: 'Project Architecture',
      fileMap: 'Key File Map',
      readingOrder: 'Recommended Reading Order',
      concepts: 'Key Concepts',
      checkpoints: 'Learning Checkpoints',
      coming: 'Feature under development, stay tuned...',
    },
  }

  const texts = content[language]

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center text-sm text-gray-600">
        {texts.coming}
      </div>
      <p className="text-xs text-gray-500 text-center">
        {language === 'zh'
          ? '本功能为您生成项目结构地图和推荐阅读路线，帮助您高效地学习源码。'
          : 'This feature generates a project structure map and recommended reading path to help you learn the source code efficiently.'}
      </p>
    </div>
  )
}

export default SourceMapTab
