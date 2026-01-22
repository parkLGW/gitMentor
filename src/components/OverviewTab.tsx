import React, { useState, useEffect } from 'react'
import { getRepoInfo } from '@/services/github'

interface OverviewTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function OverviewTab({ repo, language }: OverviewTabProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const info = await getRepoInfo(repo.owner, repo.name)
        setData(info)
      } catch (err) {
        console.error('Failed to load overview data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [repo])

  if (loading) {
    return <div className="text-center text-gray-500 py-4">{language === 'zh' ? '加载中...' : 'Loading...'}</div>
  }

  if (!data) {
    return <div className="text-center text-gray-500 py-4">{language === 'zh' ? '无法加载数据' : 'Failed to load data'}</div>
  }

  return (
    <div className="space-y-4">
      {/* Core Value */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-gray-600 font-semibold">
          {language === 'zh' ? '核心价值' : 'Core Value'}
        </p>
        <p className="text-sm text-gray-900 mt-1">{data.description}</p>
      </div>

      {/* Project Health */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">
          {language === 'zh' ? '项目健康度' : 'Project Health'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-100 rounded p-2 text-center">
            <p className="text-xs text-gray-600">Stars</p>
            <p className="font-bold text-gray-900">{data.stars}</p>
          </div>
          <div className="bg-gray-100 rounded p-2 text-center">
            <p className="text-xs text-gray-600">Forks</p>
            <p className="font-bold text-gray-900">{data.forks}</p>
          </div>
          <div className="bg-gray-100 rounded p-2 text-center">
            <p className="text-xs text-gray-600">Issues</p>
            <p className="font-bold text-gray-900">{data.openIssues}</p>
          </div>
        </div>
      </div>

      {/* Language */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1">
          {language === 'zh' ? '主语言' : 'Language'}
        </p>
        <div className="inline-block bg-blue-100 text-blue-900 px-3 py-1 rounded text-xs font-medium">
          {data.language}
        </div>
      </div>

      {/* Updated */}
      <div>
        <p className="text-xs text-gray-500">
          {language === 'zh' ? '最后更新: ' : 'Last updated: '}
          {new Date(data.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}

export default OverviewTab
