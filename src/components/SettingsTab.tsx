import { useState, useEffect } from 'react'
import { llmManager } from '@/services/llm'
import { LLMProviderType, LLMConfig } from '@/types/llm'
import { usageTracker, UsageStats } from '@/services/usage-tracker'

interface SettingsTabProps {
  language: 'zh' | 'en'
}

function SettingsTab({ language }: SettingsTabProps) {
  const [selectedProvider, setSelectedProvider] = useState<LLMProviderType>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [saved, setSaved] = useState(false)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [savedConfig, setSavedConfig] = useState<any>(null)

  const labels = {
    zh: {
      settings: '设置',
      provider: 'AI模型提供商',
      apiKey: 'API密钥',
      model: '模型',
      baseUrl: '基础URL',
      testConnection: '测试连接',
      save: '保存配置',
      clear: '清空配置',
      testing: '测试中...',
      connected: '✓ 连接成功',
      failed: '✗ 连接失败',
      saved: '✓ 已保存',
      info: '请输入你的API密钥。密钥仅保存在浏览器本地。',
      claude: 'Claude 3 (Anthropic)',
      openai: 'GPT-4 (OpenAI)',
      ollama: 'Ollama (本地)',
      zhipu: '智谱 AI (Zhipu)',
      siliconflow: '硅基流动 (Silicon Flow)',
    },
    en: {
      settings: 'Settings',
      provider: 'AI Model Provider',
      apiKey: 'API Key',
      model: 'Model',
      baseUrl: 'Base URL',
      testConnection: 'Test Connection',
      save: 'Save Configuration',
      clear: 'Clear Configuration',
      testing: 'Testing...',
      connected: '✓ Connected',
      failed: '✗ Failed',
      saved: '✓ Saved',
      info: 'Enter your API key. Keys are stored locally in your browser only.',
      claude: 'Claude 3 (Anthropic)',
      openai: 'GPT-4 (OpenAI)',
      ollama: 'Ollama (Local)',
      zhipu: 'Zhipu AI (ChatGLM)',
      siliconflow: 'Silicon Flow',
    },
  }

  const t = labels[language]

  const providerOptions: { value: LLMProviderType; label: string; defaultModel: string; cost?: string }[] = [
    { value: 'claude', label: t.claude, defaultModel: 'claude-3-sonnet-20240229', cost: '¥' },
    { value: 'openai', label: t.openai, defaultModel: 'gpt-4', cost: '¥¥' },
    { value: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', cost: '¥ (便宜!)' },
    { value: 'siliconflow', label: t.siliconflow, defaultModel: 'Qwen/Qwen2.5-72B-Instruct', cost: '$ (便宜)' },
    { value: 'zhipu', label: t.zhipu, defaultModel: 'glm-4', cost: '¥ (便宜)' },
  ]

  // Load saved configuration on component mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Use chrome.storage.local for persistence across reloads
        const result = await new Promise<Record<string, any>>((resolve) => {
          chrome.storage.local.get('gitmentor_llm_config', (data: Record<string, any>) => {
            resolve(data)
          })
        })
        
        if (result.gitmentor_llm_config) {
          const config = result.gitmentor_llm_config
          console.log('[GitMentor] Loaded saved LLM config:', config.provider)
          setSavedConfig(config)
          setSelectedProvider(config.provider || 'claude')
          setModel(config.model || '')
          setBaseUrl(config.baseUrl || '')
          // Also populate API key if it was saved
          if (config.apiKey) {
            setApiKey(config.apiKey)
          }
        }
      } catch (error) {
        console.warn('Failed to load saved LLM config:', error)
      }
    }
    loadConfig()
  }, [])

  // Load usage stats
  useEffect(() => {
    usageTracker.getStats(7).then(setUsageStats)
  }, [])

  useEffect(() => {
    // Reset form when provider changes
    const option = providerOptions.find(o => o.value === selectedProvider)
    
    const loadProviderConfig = async () => {
      // Try to load saved config for this specific provider from the map
      const savedProviderConfig = await llmManager.getSavedConfig(selectedProvider)
      
      if (savedProviderConfig) {
        console.log('[SettingsTab] Found saved config for:', selectedProvider)
        setModel(savedProviderConfig.model || option?.defaultModel || '')
        setBaseUrl(savedProviderConfig.baseUrl || '')
        setApiKey(savedProviderConfig.apiKey || '')
      } else {
        // Fallback: If this is the currently active provider in legacy storage
        if (savedConfig && savedConfig.provider === selectedProvider) {
           setModel(savedConfig.model || option?.defaultModel || '')
           setBaseUrl(savedConfig.baseUrl || '')
           setApiKey(savedConfig.apiKey || '')
        } else {
          // Use defaults
          setModel(option?.defaultModel || '')
          setBaseUrl(selectedProvider === 'ollama' ? 'http://localhost:11434' : selectedProvider === 'lmstudio' ? 'http://localhost:1234' : '')
          setApiKey('')
        }
      }
    }

    loadProviderConfig()
    setSaved(false)
    setTestResult(null)
  }, [selectedProvider, savedConfig])

  const handleTest = async () => {
    if (!apiKey && !['ollama', 'lmstudio'].includes(selectedProvider)) {
      alert(language === 'zh' ? '请输入API密钥' : 'Please enter API key')
      return
    }

    setTesting(true)
    try {
      const config: LLMConfig = {
        provider: selectedProvider,
        apiKey,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
      }

      const success = await llmManager.testProvider(selectedProvider, config)
      setTestResult(success)
    } catch (error) {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!apiKey && !['ollama', 'lmstudio'].includes(selectedProvider)) {
      alert(language === 'zh' ? '请输入API密钥' : 'Please enter API key')
      return
    }

    try {
      const config: LLMConfig = {
        provider: selectedProvider,
        apiKey,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
      }

      console.log('[SettingsTab] Saving config:', { provider: selectedProvider, model, hasApiKey: !!apiKey })
      
      await llmManager.setCurrentProvider(selectedProvider, config)
      
      // Verify config was saved
      const result = await new Promise<Record<string, any>>((resolve) => {
        chrome.storage.local.get('gitmentor_llm_config', (data: Record<string, any>) => {
          resolve(data)
        })
      })
      
      if (result.gitmentor_llm_config && result.gitmentor_llm_config.provider === selectedProvider) {
        console.log('[SettingsTab] Config verified in storage:', result.gitmentor_llm_config)
        setSavedConfig(result.gitmentor_llm_config)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        console.error('[SettingsTab] Config NOT found in storage after save!')
        alert(language === 'zh' ? '配置保存失败，请重试' : 'Config save verification failed, please try again')
      }
    } catch (error) {
      console.error('[SettingsTab] Save failed:', error)
      alert(`${language === 'zh' ? '保存失败' : 'Save failed'}: ${error}`)
    }
  }

  const handleClear = () => {
    if (confirm(language === 'zh' ? '确定要清空配置吗？' : 'Clear configuration?')) {
      llmManager.clearConfig()
      setApiKey('')
      setSaved(false)
      setTestResult(null)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-900">{t.info}</p>
      </div>

      {/* Provider Selection */}
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
              {opt.label} {opt.cost ? `(${opt.cost})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* API Key Input */}
      {!['ollama', 'lmstudio'].includes(selectedProvider) && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            {t.apiKey}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Enter your ${selectedProvider.toUpperCase()} API key`}
            className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {language === 'zh' 
              ? '✓ API密钥已保存到浏览器本地存储' 
              : '✓ API key is saved to browser local storage'}
          </p>
        </div>
      )}

      {/* Model Input */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-2">
          {t.model}
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g., claude-3-sonnet-20240229"
          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
        />
      </div>

      {/* Base URL for Local Services */}
      {['ollama', 'lmstudio'].includes(selectedProvider) && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">
            {t.baseUrl}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={selectedProvider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234'}
            className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedProvider === 'ollama' 
              ? 'Ollama default: http://localhost:11434'
              : 'LM Studio default: http://localhost:1234'}
          </p>
        </div>
      )}

      {/* Test Result */}
      {testResult !== null && (
        <div className={`p-2 rounded text-sm ${testResult ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
          {testResult ? t.connected : t.failed}
        </div>
      )}

      {/* Buttons */}
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

      {/* Usage Stats */}
      {usageStats && usageStats.totalCalls > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <p className="font-semibold text-sm text-yellow-800 mb-2">
            {language === 'zh' ? 'API 用量统计 (近7天)' : 'API Usage Stats (Last 7 Days)'}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white rounded p-2">
              <div className="text-gray-500">{language === 'zh' ? '调用次数' : 'API Calls'}</div>
              <div className="text-lg font-bold text-gray-800">{usageStats.totalCalls}</div>
            </div>
            <div className="bg-white rounded p-2">
              <div className="text-gray-500">{language === 'zh' ? '总 Token 数' : 'Total Tokens'}</div>
              <div className="text-lg font-bold text-gray-800">{usageStats.totalTokens.toLocaleString()}</div>
            </div>
            <div className="bg-white rounded p-2 col-span-2">
              <div className="text-gray-500">{language === 'zh' ? '预估费用' : 'Est. Cost'}</div>
              <div className="text-lg font-bold text-green-600">${usageStats.estimatedCost.toFixed(4)}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-yellow-700">
            {language === 'zh' 
              ? '提示: 缓存已开启，同一项目7天内不会重复调用 API'
              : 'Tip: Cache enabled, same project won\'t call API again within 7 days'}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600">
        <p className="font-semibold mb-1">{language === 'zh' ? '获取API密钥：' : 'Get API Keys:'}</p>
        <ul className="space-y-1">
          <li>• Claude: <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">console.anthropic.com</a></li>
          <li>• OpenAI: <a href="https://platform.openai.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">platform.openai.com</a></li>
          <li>• DeepSeek 🔥: <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">platform.deepseek.com</a></li>
          <li>• Silicon Flow 💎: <a href="https://cloud.siliconflow.cn" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" onClick={(e) => { e.preventDefault(); window.open('https://cloud.siliconflow.cn/i/vrmTfRTN', '_blank'); }}>cloud.siliconflow.cn</a></li>
          <li>• Zhipu 💡: <a href="https://open.bigmodel.cn" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline" onClick={(e) => { e.preventDefault(); window.open('https://www.bigmodel.cn/invite?icode=l1vVV6SGlJOOAf2kyoL8fOZLO2QH3C0EBTSr%2BArzMw4%3D', '_blank'); }}>open.bigmodel.cn</a></li>
        </ul>
      </div>
    </div>
  )
}

export default SettingsTab
