import { useEffect, useMemo, useState } from 'react'
import { llmManager } from '@/services/llm'
import { LLMConfig, LLMPresetType, LLMProtocolType } from '@/types/llm'
import { migrateLegacyLLMConfig } from '@/services/llm-config-migration'
import { normalizeClaudeCompatibleBaseUrl } from '@/services/claude-compatible-utils'
import { STORAGE_KEYS } from '@/constants/storage'
import { usageTracker, UsageStats } from '@/services/usage-tracker'
import {
  getDefaultPresetForProtocol,
  getPresetOptions,
  getPresetSettings,
  getProtocolOptions,
  normalizeOpenAICompatibleBaseUrl,
} from '@/services/llm-provider-config'

interface SettingsTabProps {
  language: 'zh' | 'en'
}

function resolveBaseUrlForPreset(preset: LLMPresetType, baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return ''

  switch (preset) {
    case 'custom-openai':
    case 'custom-local':
      return normalizeOpenAICompatibleBaseUrl(trimmed)
    case 'custom-claude':
      return normalizeClaudeCompatibleBaseUrl(trimmed)
    default:
      return trimmed.replace(/\/+$/, '')
  }
}

function SettingsTab({ language }: SettingsTabProps) {
  const protocolOptions = useMemo(() => getProtocolOptions(), [])
  const allPresetOptions = useMemo(
    () => ['openai', 'claude', 'local'].flatMap((protocol) => getPresetOptions(protocol as LLMProtocolType)),
    [],
  )
  const [selectedProtocol, setSelectedProtocol] = useState<LLMProtocolType>('openai')
  const [selectedPreset, setSelectedPreset] = useState<LLMPresetType>(
    getDefaultPresetForProtocol('openai'),
  )
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [saved, setSaved] = useState(false)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [savedConfig, setSavedConfig] = useState<LLMConfig | null>(null)

  const labels = {
    zh: {
      connectionType: '连接类型',
      presetTemplate: '模板预设',
      apiKey: 'API 密钥',
      apiKeyOptional: 'API 密钥（可选）',
      model: '模型',
      baseUrl: '基础 URL',
      githubToken: 'GitHub Token（可选）',
      testConnection: '测试连接',
      save: '保存配置',
      clear: '清空当前配置',
      testing: '测试中...',
      connected: '✓ 连接成功',
      failed: '✗ 连接失败',
      saved: '✓ 已保存',
      info: '先选择协议类型，再选择模板预设。支持官方接口、自建兼容网关和本地模型服务，配置只保存在浏览器本地。',
      selectionDetails: '当前选择',
      selectedProtocol: '连接类型',
      selectedPreset: '模板预设',
      customHelp: '自定义模板适用于自建网关、反向代理和聚合服务。保存时会按对应协议自动规范化地址。',
      enterApiKey: '请输入 API 密钥',
      enterBaseUrl: '请输入基础 URL',
      clearConfirm: '确定要清空当前配置吗？',
      clearSuccess: '当前配置已清空',
      clearFailed: '清空失败',
      saveFailed: '保存失败',
      saveVerifyFailed: '配置保存验证失败，请重试',
      getApiKeys: '官方入口',
      noApiKeyNeeded: '当前预设不需要 API 密钥。',
      optionalApiKeyHint: '可留空，适用于不要求鉴权的兼容接口。',
      localStorageHint: '配置会保存到浏览器本地存储。',
      cacheHint: '提示: 缓存已开启，同一项目 7 天内不会重复调用 API',
      usageTitle: 'API 用量统计（近 7 天）',
      apiCalls: '调用次数',
      totalTokens: '总 Token 数',
      estimatedCost: '预估费用',
      baseUrlAutoHint: '基础 URL 会按当前协议自动规范化。',
      githubTokenTip: '遇到 GitHub rate limit 时，建议在此填写 GitHub Token 以提高稳定性。',
      githubTokenHint: '用于 GitHub API 和源码抓取请求，保存到浏览器本地存储。',
    },
    en: {
      connectionType: 'Connection Type',
      presetTemplate: 'Preset Template',
      apiKey: 'API Key',
      apiKeyOptional: 'API Key (Optional)',
      model: 'Model',
      baseUrl: 'Base URL',
      githubToken: 'GitHub Token (Optional)',
      testConnection: 'Test Connection',
      save: 'Save Configuration',
      clear: 'Clear Current Configuration',
      testing: 'Testing...',
      connected: '✓ Connected',
      failed: '✗ Failed',
      saved: '✓ Saved',
      info: 'Choose a protocol first, then a preset template. Supports official APIs, self-hosted compatible gateways, and local model services. Configuration stays in browser local storage only.',
      selectionDetails: 'Current Selection',
      selectedProtocol: 'Connection Type',
      selectedPreset: 'Preset Template',
      customHelp: 'Custom presets are for self-hosted gateways, reverse proxies, and aggregator APIs. The base URL is normalized according to the selected protocol when you save.',
      enterApiKey: 'Please enter an API key',
      enterBaseUrl: 'Please enter a base URL',
      clearConfirm: 'Clear configuration for the current selection?',
      clearSuccess: 'Current configuration cleared',
      clearFailed: 'Clear failed',
      saveFailed: 'Save failed',
      saveVerifyFailed: 'Config save verification failed, please try again',
      getApiKeys: 'Official Links',
      noApiKeyNeeded: 'This preset does not require an API key.',
      optionalApiKeyHint: 'You can leave this blank for compatible endpoints without auth.',
      localStorageHint: 'Configuration is stored in browser local storage.',
      cacheHint: 'Tip: Cache enabled, same project will not call the API again within 7 days',
      usageTitle: 'API Usage Stats (Last 7 Days)',
      apiCalls: 'API Calls',
      totalTokens: 'Total Tokens',
      estimatedCost: 'Est. Cost',
      baseUrlAutoHint: 'The base URL is normalized automatically for the selected protocol.',
      githubTokenTip: 'If you hit GitHub rate limits, add a GitHub token here for better stability.',
      githubTokenHint: 'Used for GitHub API and source fetch requests. Stored in browser local storage.',
    },
  }

  const t = labels[language]
  const presetOptions = useMemo(() => getPresetOptions(selectedProtocol), [selectedProtocol])
  const selectedProtocolOption = protocolOptions.find((option) => option.value === selectedProtocol) || protocolOptions[0]
  const selectedPresetSettings = getPresetSettings(selectedPreset)

  const applySelectionDefaults = (preset: LLMPresetType, config?: Partial<LLMConfig> | null) => {
    const settings = getPresetSettings(preset)
    setModel(config?.model || settings.defaultModel)
    setBaseUrl(config?.baseUrl || settings.defaultBaseUrl)
    setApiKey(config?.apiKey || '')
  }

  const transitionPreset = (nextPreset: LLMPresetType, previousPreset: LLMPresetType) => {
    const previousSettings = getPresetSettings(previousPreset)
    const nextSettings = getPresetSettings(nextPreset)

    setModel((current) => (!current || current === previousSettings.defaultModel ? nextSettings.defaultModel : current))
    setBaseUrl((current) =>
      !current || current === previousSettings.defaultBaseUrl ? nextSettings.defaultBaseUrl : current,
    )
  }

  useEffect(() => {
    const loadConfig = async () => {
      try {
        chrome.storage.local.get(STORAGE_KEYS.githubToken, (data: Record<string, string>) => {
          setGithubToken(String(data?.[STORAGE_KEYS.githubToken] || ''))
        })

        const result = await new Promise<Record<string, LLMConfig>>((resolve) => {
          chrome.storage.local.get(STORAGE_KEYS.llmConfig, (data: Record<string, LLMConfig>) => {
            resolve(data)
          })
        })

        const config = result[STORAGE_KEYS.llmConfig]
        if (config) {
          const normalized = migrateLegacyLLMConfig(config)
          setSavedConfig(config)
          setSelectedProtocol(normalized.protocol)
          setSelectedPreset(normalized.preset)
          applySelectionDefaults(normalized.preset, config)
          return
        }

        const initialPreset = getDefaultPresetForProtocol('openai')
        setSelectedPreset(initialPreset)
        applySelectionDefaults(initialPreset)
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
    let cancelled = false

    const loadSelectionConfig = async () => {
      const selectionConfig = await llmManager.getSavedConfigForSelection(selectedProtocol, selectedPreset)
      if (cancelled) return

      if (selectionConfig) {
        applySelectionDefaults(selectedPreset, selectionConfig)
        return
      }

      if (savedConfig) {
        const normalized = migrateLegacyLLMConfig(savedConfig)
        if (normalized.protocol === selectedProtocol && normalized.preset === selectedPreset) {
          applySelectionDefaults(selectedPreset, savedConfig)
        }
      }
    }

    void loadSelectionConfig()
    setSaved(false)
    setTestResult(null)

    return () => {
      cancelled = true
    }
  }, [selectedProtocol, selectedPreset, savedConfig])

  const buildConfig = (): LLMConfig => {
    const trimmedApiKey = selectedPresetSettings.apiKeyMode === 'none' ? '' : apiKey.trim()
    const trimmedModel = model.trim()
    const trimmedBaseUrl = baseUrl.trim()

    if (selectedPresetSettings.apiKeyMode === 'required' && !trimmedApiKey) {
      throw new Error(t.enterApiKey)
    }

    if (selectedPresetSettings.supportsBaseUrl && !trimmedBaseUrl) {
      throw new Error(t.enterBaseUrl)
    }

    return {
      protocol: selectedProtocol,
      preset: selectedPreset,
      localMode: selectedPresetSettings.localMode,
      apiKey: trimmedApiKey,
      model: trimmedModel || undefined,
      baseUrl: selectedPresetSettings.supportsBaseUrl
        ? resolveBaseUrlForPreset(selectedPreset, trimmedBaseUrl) || undefined
        : undefined,
    }
  }

  const handleProtocolChange = (protocol: LLMProtocolType) => {
    const nextPreset = getDefaultPresetForProtocol(protocol)
    transitionPreset(nextPreset, selectedPreset)
    setSelectedProtocol(protocol)
    setSelectedPreset(nextPreset)
  }

  const handlePresetChange = (preset: LLMPresetType) => {
    transitionPreset(preset, selectedPreset)
    setSelectedPreset(preset)
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const config = buildConfig()
      const success = await llmManager.testConfig(config)
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
        protocol: selectedProtocol,
        preset: selectedPreset,
        model: config.model,
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl,
      })

      await llmManager.setCurrentConfig(config)
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.githubToken]: githubToken.trim() }, () => resolve())
      })

      const result = await new Promise<Record<string, LLMConfig>>((resolve) => {
        chrome.storage.local.get(STORAGE_KEYS.llmConfig, (data: Record<string, LLMConfig>) => {
          resolve(data)
        })
      })

      const activeConfig = result[STORAGE_KEYS.llmConfig]
      if (activeConfig) {
        const normalized = migrateLegacyLLMConfig(activeConfig)
        if (normalized.protocol === selectedProtocol && normalized.preset === selectedPreset) {
          setSavedConfig(activeConfig)
          setSaved(true)
          setTimeout(() => setSaved(false), 3000)
          return
        }
      }

      alert(t.saveVerifyFailed)
    } catch (error) {
      console.error('[SettingsTab] Save failed:', error)
      alert(`${t.saveFailed}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleClear = async () => {
    if (!confirm(t.clearConfirm)) return

    try {
      await llmManager.clearConfig({ protocol: selectedProtocol, preset: selectedPreset })
      setSavedConfig((current) => {
        if (!current) return null
        const normalized = migrateLegacyLLMConfig(current)
        return normalized.protocol === selectedProtocol && normalized.preset === selectedPreset ? null : current
      })
      applySelectionDefaults(selectedPreset)
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

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs text-amber-900">{t.githubTokenTip}</p>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-xs font-semibold text-gray-600 mb-1">{t.selectionDetails}</p>
        <p className="text-sm font-semibold text-gray-900">
          {selectedPresetSettings.label[language]}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          {selectedPresetSettings.description[language]}
        </p>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <p>{t.selectedProtocol}: {selectedProtocolOption.label[language]}</p>
          <p>{t.selectedPreset}: {selectedPresetSettings.label[language]}</p>
        </div>
        {(selectedPreset === 'custom-openai' || selectedPreset === 'custom-claude' || selectedPreset === 'custom-local') && (
          <p className="text-xs text-blue-700 mt-2">{t.customHelp}</p>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 1000 }}>
        <label className="text-xs font-semibold text-gray-600 block mb-2">
          {t.connectionType}
        </label>
        <select
          value={selectedProtocol}
          onChange={(e) => handleProtocolChange(e.target.value as LLMProtocolType)}
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          style={{ position: 'relative', zIndex: 1001 }}
        >
          {protocolOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label[language]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ position: 'relative', zIndex: 999 }}>
        <label className="text-xs font-semibold text-gray-600 block mb-2">
          {t.presetTemplate}
        </label>
        <select
          value={selectedPreset}
          onChange={(e) => handlePresetChange(e.target.value as LLMPresetType)}
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          style={{ position: 'relative', zIndex: 1000 }}
        >
          {presetOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label[language]} {opt.cost ? `(${opt.cost})` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedPresetSettings.apiKeyMode !== 'none' ? (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            {selectedPresetSettings.apiKeyMode === 'optional' ? t.apiKeyOptional : t.apiKey}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              selectedPresetSettings.apiKeyMode === 'optional'
                ? t.optionalApiKeyHint
                : `${selectedPresetSettings.label[language]} ${t.apiKey}`
            }
            className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedPresetSettings.apiKeyMode === 'optional' ? t.optionalApiKeyHint : t.localStorageHint}
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
          placeholder={selectedPresetSettings.modelPlaceholder || selectedPresetSettings.defaultModel}
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
        />
      </div>

      {selectedPresetSettings.supportsBaseUrl && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            {t.baseUrl}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={selectedPresetSettings.baseUrlPlaceholder || selectedPresetSettings.defaultBaseUrl}
            className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedPresetSettings.baseUrlHint?.[language] || t.baseUrlAutoHint}
          </p>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">
          {t.githubToken}
        </label>
        <input
          type="password"
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
          placeholder="ghp_xxx"
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          {t.githubTokenHint}
        </p>
      </div>

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
          {allPresetOptions
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
          <li>• {selectedPresetSettings.label[language]}: {selectedPresetSettings.apiKeyMode === 'optional' ? t.customHelp : t.localStorageHint}</li>
        </ul>
      </div>
    </div>
  )
}

export default SettingsTab
