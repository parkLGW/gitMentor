import React, { useState, useEffect } from 'react'
import { getRepoInfo, getReadme } from '@/services/github'
import { analyzeReadme } from '@/services/analysis'
import { AIAnalysisService, ProjectAnalysis } from '@/services/ai-analysis'
import { useLLM } from '@/hooks/useLLM'

interface OverviewTabProps {
  repo: { owner: string; name: string }
  language: 'zh' | 'en'
}

function OverviewTab({ repo, language }: OverviewTabProps) {
  const [repoInfo, setRepoInfo] = useState<any>(null)
  const [overview, setOverview] = useState<any>(null)
  const [aiAnalysis, setAiAnalysis] = useState<ProjectAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const { isConfigured } = useLLM()

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch repo info
        const info = await getRepoInfo(repo.owner, repo.name)
        setRepoInfo(info)
        
        // Try to load AI analysis from cache first
        const cacheKey = `gitmentor_ai_analysis_${repo.owner}/${repo.name}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          setAiAnalysis(JSON.parse(cached))
        }
        
        // Fetch and analyze README
        try {
          const readme = await getReadme(repo.owner, repo.name)
          const analysis = analyzeReadme(readme)
          setOverview(analysis)
        } catch (readmeErr) {
          console.warn('Failed to fetch README, using basic info only', readmeErr)
        }
      } catch (err) {
        console.error('Failed to load overview data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [repo])

  const handleAIAnalysis = async () => {
    if (!isConfigured()) {
      setAiError(language === 'zh' ? '请先在设置中配置AI提供商' : 'Please configure AI provider in Settings')
      return
    }

    setAiLoading(true)
    setAiError(null)

    try {
      const readme = overview ? '' : await getReadme(repo.owner, repo.name)
      const projectInfo = `${repoInfo.name} (${repoInfo.language})`
      const analysis = await AIAnalysisService.analyzeProject(
        projectInfo,
        readme || (overview?.coreValue || ''),
        language
      )
      setAiAnalysis(analysis)

      // Cache the result
      const cacheKey = `gitmentor_ai_analysis_${repo.owner}/${repo.name}`
      localStorage.setItem(cacheKey, JSON.stringify(analysis))
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center text-gray-500 py-4">{language === 'zh' ? '加载中...' : 'Loading...'}</div>
  }

  if (error || !repoInfo) {
    return <div className="text-center text-red-500 py-4">{error || (language === 'zh' ? '无法加载数据' : 'Failed to load data')}</div>
  }

  const getDifficultyLabel = (difficulty: string) => {
    const labels: Record<string, Record<string, string>> = {
      beginner: { zh: '初级', en: 'Beginner' },
      intermediate: { zh: '中级', en: 'Intermediate' },
      advanced: { zh: '高级', en: 'Advanced' },
    }
    return labels[difficulty]?.[language] || difficulty
  }

  const getDifficultyColor = (difficulty: string) => {
    return difficulty === 'advanced' ? 'red' : difficulty === 'intermediate' ? 'yellow' : 'green'
  }

  const coreValue = overview?.coreValue || repoInfo.description
  const difficulty = overview?.difficulty || 'intermediate'
  const problems = overview?.problems || []
  const useCases = overview?.useCases || []

  const isArchived = repoInfo.archived
  const daysOld = Math.floor((Date.now() - new Date(repoInfo.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
  const isActive = daysOld < 90

  return (
    <div className="space-y-4">
      {/* AI Analysis Button */}
      {!aiAnalysis && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-purple-900">
              {language === 'zh' ? '✨ 用AI更深度分析此项目' : '✨ Get AI-Powered Insights'}
            </p>
            <button
              onClick={handleAIAnalysis}
              disabled={aiLoading || !isConfigured()}
              className="px-2 py-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded text-xs font-medium transition"
            >
              {aiLoading ? (language === 'zh' ? '分析中...' : 'Analyzing...') : 'AI'}
            </button>
          </div>
          {!isConfigured() && (
            <p className="text-xs text-purple-700 mt-1">
              {language === 'zh' ? '需要在设置中配置AI提供商' : 'Configure AI provider in Settings'}
            </p>
          )}
        </div>
      )}

      {/* AI Error */}
      {aiError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <p className="text-xs text-red-700">{aiError}</p>
        </div>
      )}

      {/* AI Analysis Results */}
      {aiAnalysis && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-purple-900">
              {language === 'zh' ? '✨ AI分析结果' : '✨ AI Analysis'}
            </p>
            <button
              onClick={() => setAiAnalysis(null)}
              className="text-xs text-purple-600 hover:text-purple-900 underline"
            >
              {language === 'zh' ? '重新分析' : 'Re-analyze'}
            </button>
          </div>
          <div className="text-xs text-purple-900 space-y-2">
            <p><strong>{language === 'zh' ? '核心价值：' : 'Core: '}</strong>{aiAnalysis.coreValue}</p>
            <p><strong>{language === 'zh' ? '难度：' : 'Difficulty: '}</strong>{aiAnalysis.difficulty}</p>
            <p><strong>{language === 'zh' ? '适合人群：' : 'For: '}</strong>{aiAnalysis.targetAudience}</p>
            {aiAnalysis.keyFeatures.length > 0 && (
              <p><strong>{language === 'zh' ? '关键特性：' : 'Features: '}</strong>{aiAnalysis.keyFeatures.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {/* Status Badge */}
      {isArchived && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
          <p className="text-xs text-red-700 font-semibold">
            {language === 'zh' ? '⚠️ 项目已存档' : '⚠️ Project Archived'}
          </p>
        </div>
      )}

      {/* Core Value */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-gray-600 font-semibold">
          {language === 'zh' ? '核心价值' : 'Core Value'}
        </p>
        <p className="text-sm text-gray-900 mt-1 line-clamp-2">{coreValue}</p>
      </div>

      {/* Difficulty & Activity */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">
            {language === 'zh' ? '学习难度' : 'Difficulty'}
          </p>
          <div className={`inline-block bg-${getDifficultyColor(difficulty)}-100 text-${getDifficultyColor(difficulty)}-900 px-3 py-1 rounded text-xs font-medium`}>
            {getDifficultyLabel(difficulty)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1">
            {language === 'zh' ? '更新状态' : 'Activity'}
          </p>
          <div className={`inline-block ${isActive ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-900'} px-3 py-1 rounded text-xs font-medium`}>
            {isActive ? (language === 'zh' ? '活跃' : 'Active') : (language === 'zh' ? `${daysOld}天前` : `${daysOld}d ago`)}
          </div>
        </div>
      </div>

      {/* Problems */}
      {problems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">
            {language === 'zh' ? '解决的问题' : 'Problems Solved'}
          </p>
          <div className="space-y-1">
            {problems.map((problem, i) => (
              <p key={i} className="text-xs text-gray-700">• {problem}</p>
            ))}
          </div>
        </div>
      )}

      {/* Use Cases */}
      {useCases.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">
            {language === 'zh' ? '适用场景' : 'Use Cases'}
          </p>
          <div className="space-y-1">
            {useCases.map((useCase, i) => (
              <p key={i} className="text-xs text-gray-700">• {useCase}</p>
            ))}
          </div>
        </div>
      )}

      {/* Project Health */}
      <div className="space-y-2 border-t border-gray-200 pt-3">
        <p className="text-xs font-semibold text-gray-600">
          {language === 'zh' ? '项目热度' : 'Popularity'}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-100 rounded p-2 text-center">
            <p className="text-xs text-gray-600">⭐ {language === 'zh' ? '星标' : 'Stars'}</p>
            <p className="font-bold text-gray-900">{repoInfo.stars > 1000 ? (repoInfo.stars / 1000).toFixed(1) + 'k' : repoInfo.stars}</p>
          </div>
          <div className="bg-gray-100 rounded p-2 text-center">
            <p className="text-xs text-gray-600">🔀 {language === 'zh' ? '分叉' : 'Forks'}</p>
            <p className="font-bold text-gray-900">{repoInfo.forks > 1000 ? (repoInfo.forks / 1000).toFixed(1) + 'k' : repoInfo.forks}</p>
          </div>
          <div className="bg-gray-100 rounded p-2 text-center">
            <p className="text-xs text-gray-600">📋 {language === 'zh' ? '问题' : 'Issues'}</p>
            <p className="font-bold text-gray-900">{repoInfo.openIssues}</p>
          </div>
        </div>
      </div>

      {/* Tech Info */}
      <div className="space-y-2 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-600">
            {language === 'zh' ? '主要语言' : 'Language'}
          </p>
          <div className="inline-block bg-blue-100 text-blue-900 px-2 py-1 rounded text-xs font-medium">
            {repoInfo.language}
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {language === 'zh' ? '最后更新：' : 'Last updated: '}
          {new Date(repoInfo.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}

export default OverviewTab
