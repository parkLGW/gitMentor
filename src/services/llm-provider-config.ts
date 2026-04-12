import { LLMProviderType } from '../types/llm.js'

export type ApiKeyMode = 'required' | 'optional' | 'none'

export interface ProviderSettings {
  value: LLMProviderType
  label: {
    zh: string
    en: string
  }
  description: {
    zh: string
    en: string
  }
  defaultModel: string
  defaultBaseUrl: string
  baseUrlPlaceholder?: string
  baseUrlHint?: {
    zh: string
    en: string
  }
  modelPlaceholder?: string
  cost?: string
  apiKeyMode: ApiKeyMode
  supportsBaseUrl: boolean
  docsUrl?: string
}

const PROVIDER_SETTINGS: Record<LLMProviderType, ProviderSettings> = {
  claude: {
    value: 'claude',
    label: { zh: 'Claude (Anthropic)', en: 'Claude (Anthropic)' },
    description: {
      zh: 'Anthropic 官方 API',
      en: 'Anthropic official API',
    },
    defaultModel: 'claude-3-sonnet-20240229',
    defaultBaseUrl: '',
    modelPlaceholder: 'claude-3-sonnet-20240229',
    cost: '¥¥',
    apiKeyMode: 'required',
    supportsBaseUrl: false,
    docsUrl: 'https://console.anthropic.com',
  },
  openai: {
    value: 'openai',
    label: { zh: 'OpenAI', en: 'OpenAI' },
    description: {
      zh: 'OpenAI 官方 API',
      en: 'OpenAI official API',
    },
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: '',
    modelPlaceholder: 'gpt-4o-mini',
    cost: '¥¥',
    apiKeyMode: 'required',
    supportsBaseUrl: false,
    docsUrl: 'https://platform.openai.com',
  },
  custom: {
    value: 'custom',
    label: {
      zh: '自定义 OpenAI 兼容接口',
      en: 'Custom OpenAI-compatible API',
    },
    description: {
      zh: '适用于自建网关、代理和聚合服务',
      en: 'For self-hosted gateways, proxies, and aggregators',
    },
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: '',
    baseUrlPlaceholder: 'https://example.com/v1',
    baseUrlHint: {
      zh: '填写兼容 OpenAI 的基础地址，未带 /v1 时会自动补齐。',
      en: 'Use the OpenAI-compatible base URL. /v1 is appended automatically when missing.',
    },
    modelPlaceholder: 'gpt-4o-mini',
    cost: 'Flexible',
    apiKeyMode: 'optional',
    supportsBaseUrl: true,
  },
  deepseek: {
    value: 'deepseek',
    label: { zh: 'DeepSeek', en: 'DeepSeek' },
    description: {
      zh: 'DeepSeek 官方 API',
      en: 'DeepSeek official API',
    },
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: '',
    modelPlaceholder: 'deepseek-chat',
    cost: '¥',
    apiKeyMode: 'required',
    supportsBaseUrl: false,
    docsUrl: 'https://platform.deepseek.com',
  },
  siliconflow: {
    value: 'siliconflow',
    label: { zh: '硅基流动', en: 'Silicon Flow' },
    description: {
      zh: '硅基流动官方 API',
      en: 'Silicon Flow official API',
    },
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    defaultBaseUrl: '',
    modelPlaceholder: 'Qwen/Qwen2.5-72B-Instruct',
    cost: '$',
    apiKeyMode: 'required',
    supportsBaseUrl: false,
    docsUrl: 'https://cloud.siliconflow.cn',
  },
  zhipu: {
    value: 'zhipu',
    label: { zh: '智谱 AI', en: 'Zhipu AI' },
    description: {
      zh: '智谱官方 API',
      en: 'Zhipu official API',
    },
    defaultModel: 'glm-4',
    defaultBaseUrl: '',
    modelPlaceholder: 'glm-4',
    cost: '¥',
    apiKeyMode: 'required',
    supportsBaseUrl: false,
    docsUrl: 'https://open.bigmodel.cn',
  },
  ollama: {
    value: 'ollama',
    label: { zh: 'Ollama (本地)', en: 'Ollama (Local)' },
    description: {
      zh: '本地推理服务',
      en: 'Local inference service',
    },
    defaultModel: 'mistral',
    defaultBaseUrl: 'http://localhost:11434',
    baseUrlPlaceholder: 'http://localhost:11434',
    baseUrlHint: {
      zh: '默认接口为本机 Ollama 服务。',
      en: 'Defaults to the local Ollama service.',
    },
    modelPlaceholder: 'mistral',
    cost: 'Local',
    apiKeyMode: 'none',
    supportsBaseUrl: true,
  },
  lmstudio: {
    value: 'lmstudio',
    label: { zh: 'LM Studio (本地)', en: 'LM Studio (Local)' },
    description: {
      zh: '本地 OpenAI 兼容服务',
      en: 'Local OpenAI-compatible service',
    },
    defaultModel: 'local-model',
    defaultBaseUrl: 'http://localhost:1234',
    baseUrlPlaceholder: 'http://localhost:1234',
    baseUrlHint: {
      zh: '默认接口为本机 LM Studio 服务。',
      en: 'Defaults to the local LM Studio service.',
    },
    modelPlaceholder: 'local-model',
    cost: 'Local',
    apiKeyMode: 'none',
    supportsBaseUrl: true,
  },
}

export const SETTINGS_PROVIDER_ORDER: LLMProviderType[] = [
  'claude',
  'openai',
  'custom',
  'deepseek',
  'siliconflow',
  'zhipu',
  'ollama',
  'lmstudio',
]

export function getProviderSettings(type: LLMProviderType): ProviderSettings {
  return PROVIDER_SETTINGS[type]
}

export function getVisibleProviderSettings(): ProviderSettings[] {
  return SETTINGS_PROVIDER_ORDER.map((type) => PROVIDER_SETTINGS[type])
}

export function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

export function resolveProviderBaseUrl(type: LLMProviderType, baseUrl?: string): string {
  const input = (baseUrl || '').trim()
  const fallback = PROVIDER_SETTINGS[type].defaultBaseUrl
  const resolved = input || fallback

  if (!resolved) return ''
  if (type === 'custom') return normalizeOpenAICompatibleBaseUrl(resolved)
  return resolved.replace(/\/+$/, '')
}

export function shouldRequireApiKey(type: LLMProviderType): boolean {
  return getProviderSettings(type).apiKeyMode === 'required'
}

export function shouldShowApiKeyInput(type: LLMProviderType): boolean {
  return getProviderSettings(type).apiKeyMode !== 'none'
}
