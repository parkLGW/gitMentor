import { useEffect, useMemo, useState } from 'react'
import { llmManager } from '@/services/llm'
import { LLMProviderType, LLMConfig } from '@/types/llm'
import { STORAGE_KEYS } from '@/constants/storage'
import { usageTracker, UsageStats } from '@/services/usage-tracker'
import {
  getProviderSettings,
  getVisibleProviderSettings,
  resolveProviderBaseUrl,
  shouldRequireApiKey,
  shouldShowApiKeyInput,
} from '@/services/llm-provider-config'

interface SettingsTabProps {
  language: 'zh' | 'en'
}

function SettingsTab({ language }: SettingsTabProps) {
  const providerOptions = useMemo(() => getVisibleProviderSettings(), [])
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderType>('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [saved, setSaved] = useState(false)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [savedConfig, setSavedConfig] = useState<LLMConfig | null>(null)

  const labels = {
    zh: {
      provider: 'AI 模型提供商',
      apiKey: 'API 密钥',
      apiKeyOptional: 'API 密钥（可选）',
      model: '模型',
      baseUrl: '基础 URL',
      testConnection: '测试连接',
      save: '保存配置',
      clear: '清空当前提供商配置',
      testing: '测试中...',
      connected: '✓ 连接成功',
      failed: '✗ 连接失败',
      saved: '✓ 已保存',
      info: '支持官方模型、本地模型，以及任意 OpenAI 兼容接口。配置只保存在浏览器本地。',
      providerDetails: '当前提供商',
      customHelp: '自定义接口适用于自建网关、反向代理和聚合服务，只要兼容 OpenAI /v1/chat/completions 即可。',
      enterApiKey: '请输入 API 密钥',
      enterBaseUrl: '请输入基础 URL',
      clearConfirm: '确定要清空当前提供商配置吗？',
      clearSuccess: '当前提供商配置已清空',
      clearFailed: '清空失败',
      saveFailed: '保存失败',
      saveVerifyFailed: '配置保存验证失败，请重试',
      getApiKeys: '官方入口',
      noApiKeyNeeded: '当前提供商不需要 API 密钥。',
      optionalApiKeyHint: '可留空，适用于不要求鉴权的自建接口。',
      localStorageHint: '配置会保存到浏览器本地存储。',
      cacheHint: '提示: 缓存已开启，同一项目 7 天内不会重复调用 API',
      usageTitle: 'API 用量统计（近 7 天）',
      apiCalls: '调用次数',
      totalTokens: '总 Token 数',
      estimatedCost: '预估费用',
      baseUrlAutoHint: '基础 URL 会按当前提供商自动补齐路径格式。',
    },
    en: {
      provider: 'AI Model Provider',
      apiKey: 'API Key',
      apiKeyOptional: 'API Key (Optional)',
      model: 'Model',
      baseUrl: 'Base URL',
      testConnection: 'Test Connection',
      save: 'Save Configuration',
      clear: 'Clear Current Provider',
      testing: 'Testing...',
      connected: '✓ Connected',
      failed: '✗ Failed',
      saved: '✓ Saved',
      info: 'Supports official APIs, local models, and any OpenAI-compatible endpoint. Configuration stays in browser local storage only.',
      providerDetails: 'Current Provider',
      customHelp: 'Use this for self-hosted gateways, reverse proxies, and aggregator APIs as long as they expose OpenAI-compatible /v1/chat/completions endpoints.',
      enterApiKey: 'Please enter an API key',
      enterBaseUrl: 'Please enter a base URL',
      clearConfirm: 'Clear configuration for the current provider?',
      clearSuccess: 'Current provider configuration cleared',
      clearFailed: 'Clear failed',
      saveFailed: 'Save failed',
      saveVerifyFailed: 'Config save verification failed, please try again',
      getApiKeys: 'Official Links',
      noApiKeyNeeded: 'This provider does not require an API key.',
      optionalApiKeyHint: 'You can leave this blank for self-hosted endpoints without auth.',
      localStorageHint: 'Configuration is stored in browser local storage.',
      cacheHint: 'Tip: Cache enabled, same project will not call the API again within 7 days',
      usageTitle: 'API Usage Stats (Last 7 Days)',
      apiCalls: 'API Calls',
      totalTokens: 'Total Tokens',
      estimatedCost: 'Est. Cost',
      baseUrlAutoHint: 'The base URL is normalized automatically for the selected provider.',
    },
  }

  const t = labels[language]
  const selectedProviderSettings = getProviderSettings(selectedProvider)

  const applyConfigToForm = (provider: LLMProviderType, config?: Partial<LLMConfig> | null) => {
    const settings = getProviderSettings(provider)
    setModel(config?.model || settings.defaultModel)
    setBaseUrl(config?.baseUrl || settings.defaultBaseUrl)
    setApiKey(config?.apiKey || '')
  }

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await new Promise<Record<string, LLMConfig>>((resolve) => {
          chrome.storage.local.get(STORAGE_KEYS.llmConfig, (data: Record<string, LLMConfig>) => {
            resolve(data)
          })
        })

        const config = result[STORAGE_KEYS.llmConfig]
        if (config) {
          console.log('[GitMentor] Loaded saved LLM config:', config.provider)
          setSavedConfig(config)
          setSelectedProvider(config.provider || 'openai')
          applyConfigToForm(config.provider, config)
          return
        }

        applyConfigToForm('openai')
      } catch (error) {
        console.warn('Failed to load saved LLM config:', error)
      }
    }

    loadConfig()
  }, [])

  useEffect(() => {
    usageTracker.getStats(7).then(setUsageStats)
  }, [])

  useEffect(() => {
    const loadProviderConfig = async () => {
      const providerConfig = await llmManager.getSavedConfig(selectedProvider)

      if (providerConfig) {
        console.log('[SettingsTab] Found saved config for:', selectedProvider)
        applyConfigToForm(selectedProvider, providerConfig)
      } else if (savedConfig?.provider === selectedProvider) {
        applyConfigToForm(selectedProvider, savedConfig)
      } else {
        applyConfigToForm(selectedProvider)
      }
    }

    loadProviderConfig()
    setSaved(false)
    setTestResult(null)
  }, [selectedProvider, savedConfig])

  const buildConfig = (): LLMConfig => {
    const trimmedApiKey = apiKey.trim()
    const trimmedModel = model.trim()
    const trimmedBaseUrl = baseUrl.trim()

    if (shouldRequireApiKey(selectedProvider) && !trimmedApiKey) {
      throw new Error(t.enterApiKey)
    }

    if (selectedProviderSettings.supportsBaseUrl && !trimmedBaseUrl) {
      throw new Error(t.enterBaseUrl)
    }

    return {
      provider: selectedProvider,
      apiKey: trimmedApiKey,
      model: trimmedModel || undefined,
      baseUrl: selectedProviderSettings.supportsBaseUrl
        ? resolveProviderBaseUrl(selectedProvider, trimmedBaseUrl) || undefined
        : undefined,
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const config = buildConfig()
      const success = await llmManager.testProvider(selectedProvider, config)
      setTestResult(success)
    } catch (error) {
      setTestResult(false)
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    try {
      const config = buildConfig()
      console.log('[SettingsTab] Saving config:', {
        provider: selectedProvider,
        model: config.model,
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl,
      })

      await llmManager.setCurrentProvider(selectedProvider, config)

      const result = await new Promise<Record<string, LLMConfig>>((resolve) => {
        chrome.storage.local.get(STORAGE_KEYS.llmConfig, (data: Record<string, LLMConfig>) => {
          resolve(data)
        })
      })

      if (result[STORAGE_KEYS.llmConfig]?.provider === selectedProvider) {
        setSavedConfig(result[STORAGE_KEYS.llmConfig])
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        alert(t.saveVerifyFailed)
      }
    } catch (error) {
      console.error('[SettingsTab] Save failed:', error)
      alert(`${t.saveFailed}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleClear = async () => {
    if (!confirm(t.clearConfirm)) return

    try {
      await llmManager.clearConfig(selectedProvider)
      setSavedConfig((current) => (current?.provider === selectedProvider ? null : current))
      applyConfigToForm(selectedProvider)
      setSaved(false)
      setTestResult(null)
      alert(t.clearSuccess)
    } catch (error) {
      alert(`${t.clearFailed}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-900">{t.info}</p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-gray-600 mb-1">{t.providerDetails}</p>
        <p className="text-sm font-semibold text-gray-900">
          {selectedProviderSettings.label[language]}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          {selectedProviderSettings.description[language]}
        </p>
        {selectedProvider === 'custom' && (
          <p className="text-xs text-blue-700 mt-2">{t.customHelp}</p>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 1000 }}>
        <label className="text-xs font-semibold text-gray-600 block mb-2">
          {t.provider}
        </label>
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value as LLMProviderType)}
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          style={{ position: 'relative', zIndex: 1001 }}
        >
          {providerOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label[language]} {opt.cost ? `(${opt.cost})` : ''}
            </option>
          ))}
        </select>
      </div>

      {shouldShowApiKeyInput(selectedProvider) ? (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            {selectedProviderSettings.apiKeyMode === 'optional' ? t.apiKeyOptional : t.apiKey}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              selectedProviderSettings.apiKeyMode === 'optional'
                ? t.optionalApiKeyHint
                : `${selectedProviderSettings.label[language]} ${t.apiKey}`
            }
            className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedProviderSettings.apiKeyMode === 'optional' ? t.optionalApiKeyHint : t.localStorageHint}
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600">
          {t.noApiKeyNeeded}
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">
          {t.model}
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={selectedProviderSettings.modelPlaceholder || selectedProviderSettings.defaultModel}
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
        />
      </div>

      {selectedProviderSettings.supportsBaseUrl && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            {t.baseUrl}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={selectedProviderSettings.baseUrlPlaceholder || selectedProviderSettings.defaultBaseUrl}
            className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedProviderSettings.baseUrlHint?.[language] || t.baseUrlAutoHint}
          </p>
        </div>
      )}

      {testResult !== null && (
        <div className={`p-2 rounded text-sm ${testResult ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
          {testResult ? t.connected : t.failed}
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="w-full py-2 px-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded text-sm font-medium transition"
        >
          {testing ? t.testing : t.testConnection}
        </button>

        <button
          onClick={handleSave}
          className="w-full py-2 px-3 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition"
        >
          {t.save}
        </button>

        <button
          onClick={handleClear}
          className="w-full py-2 px-3 bg-gray-400 hover:bg-gray-500 text-white rounded text-sm font-medium transition"
        >
          {t.clear}
        </button>
      </div>

      {saved && (
        <div className="p-2 rounded text-sm bg-green-100 text-green-900 text-center">
          {t.saved}
        </div>
      )}

      {usageStats && usageStats.totalCalls > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="font-semibold text-sm text-yellow-800 mb-2">{t.usageTitle}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white rounded p-2">
              <div className="text-gray-500">{t.apiCalls}</div>
              <div className="text-lg font-bold text-gray-800">{usageStats.totalCalls}</div>
            </div>
            <div className="bg-white rounded p-2">
              <div className="text-gray-500">{t.totalTokens}</div>
              <div className="text-lg font-bold text-gray-800">{usageStats.totalTokens.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded p-2 col-span-2">
              <div className="text-gray-500">{t.estimatedCost}</div>
              <div className="text-lg font-bold text-green-600">${usageStats.estimatedCost.toFixed(4)}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-yellow-700">{t.cacheHint}</div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600">
        <p className="font-semibold mb-2">{t.getApiKeys}</p>
        <ul className="space-y-1">
          {providerOptions
            .filter((opt) => opt.docsUrl)
            .map((opt) => (
              <li key={opt.value}>
                • {opt.label[language]}:{' '}
                <a
                  href={opt.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {opt.docsUrl?.replace(/^https?:\/\//, '')}
                </a>
              </li>
            ))}
          <li>• {selectedProviderSettings.label[language]}: {selectedProvider === 'custom' ? t.customHelp : t.localStorageHint}</li>
        </ul>
      </div>
    </div>
  )
}

export default SettingsTab
