import { LLMPresetType, LLMProtocolType, LLMProviderType } from '../types/llm.js'

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

export interface ProtocolOption {
  value: LLMProtocolType
  label: {
    zh: string
    en: string
  }
  description: {
    zh: string
    en: string
  }
}

export interface PresetOption {
  value: LLMPresetType
  protocol: LLMProtocolType
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
  apiKeyMode: ApiKeyMode
  localMode?: 'ollama' | 'openai-compatible'
  docsUrl?: string
  baseUrlPlaceholder?: string
  baseUrlHint?: {
    zh: string
    en: string
  }
  modelPlaceholder?: string
  cost?: string
  supportsBaseUrl: boolean
}

interface PresetSettings extends PresetOption {}

const PROTOCOL_OPTIONS: Record<LLMProtocolType, ProtocolOption> = {
  openai: {
    value: 'openai',
    label: { zh: 'OpenAI 兼容协议', en: 'OpenAI-Compatible Protocol' },
    description: {
      zh: '适用于 OpenAI 及其兼容 API',
      en: 'For OpenAI and OpenAI-compatible APIs',
    },
  },
  claude: {
    value: 'claude',
    label: { zh: 'Claude 兼容协议', en: 'Claude-Compatible Protocol' },
    description: {
      zh: '适用于 Anthropic Claude 及其兼容 API',
      en: 'For Anthropic Claude and Claude-compatible APIs',
    },
  },
  local: {
    value: 'local',
    label: { zh: '本地推理协议', en: 'Local Inference Protocol' },
    description: {
      zh: '适用于本地模型运行时',
      en: 'For local model runtimes',
    },
  },
}

const PRESET_SETTINGS: Record<LLMPresetType, PresetSettings> = {
  'anthropic-official': {
    value: 'anthropic-official',
    protocol: 'claude',
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
  'custom-claude': {
    value: 'custom-claude',
    protocol: 'claude',
    label: {
      zh: '自定义 Claude 兼容接口',
      en: 'Custom Claude-compatible API',
    },
    description: {
      zh: '适用于 Claude 兼容代理和网关',
      en: 'For Claude-compatible proxies and gateways',
    },
    defaultModel: 'claude-3-sonnet-20240229',
    defaultBaseUrl: '',
    baseUrlPlaceholder: 'https://example.com/messages',
    baseUrlHint: {
      zh: '填写 Claude 兼容消息接口基础地址。',
      en: 'Use the Claude-compatible messages endpoint base URL.',
    },
    modelPlaceholder: 'claude-3-sonnet-20240229',
    cost: 'Flexible',
    apiKeyMode: 'optional',
    supportsBaseUrl: true,
  },
  'openai-official': {
    value: 'openai-official',
    protocol: 'openai',
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
  deepseek: {
    value: 'deepseek',
    protocol: 'openai',
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
    protocol: 'openai',
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
    protocol: 'openai',
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
  'custom-openai': {
    value: 'custom-openai',
    protocol: 'openai',
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
  ollama: {
    value: 'ollama',
    protocol: 'local',
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
    localMode: 'ollama',
    supportsBaseUrl: true,
  },
  lmstudio: {
    value: 'lmstudio',
    protocol: 'local',
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
    localMode: 'openai-compatible',
    supportsBaseUrl: true,
  },
  'custom-local': {
    value: 'custom-local',
    protocol: 'local',
    label: { zh: '自定义本地服务', en: 'Custom Local Service' },
    description: {
      zh: '适用于其他本地模型网关',
      en: 'For other local model gateways',
    },
    defaultModel: 'local-model',
    defaultBaseUrl: 'http://localhost:8000',
    baseUrlPlaceholder: 'http://localhost:8000',
    baseUrlHint: {
      zh: '填写本地推理服务地址。',
      en: 'Use your local inference service URL.',
    },
    modelPlaceholder: 'local-model',
    cost: 'Local',
    apiKeyMode: 'none',
    localMode: 'openai-compatible',
    supportsBaseUrl: true,
  },
}

const PROTOCOL_ORDER: LLMProtocolType[] = ['openai', 'claude', 'local']

const PRESET_ORDER_BY_PROTOCOL: Record<LLMProtocolType, LLMPresetType[]> = {
  openai: ['openai-official', 'deepseek', 'siliconflow', 'zhipu', 'custom-openai'],
  claude: ['anthropic-official', 'custom-claude'],
  local: ['ollama', 'lmstudio', 'custom-local'],
}

const LEGACY_PROVIDER_TO_PRESET: Record<LLMProviderType, LLMPresetType> = {
  claude: 'anthropic-official',
  openai: 'openai-official',
  custom: 'custom-openai',
  deepseek: 'deepseek',
  siliconflow: 'siliconflow',
  zhipu: 'zhipu',
  ollama: 'ollama',
  lmstudio: 'lmstudio',
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

function getPresetSettings(type: LLMPresetType): PresetSettings {
  return PRESET_SETTINGS[type]
}

function toProviderSettings(type: LLMProviderType): ProviderSettings {
  const preset = getPresetSettings(LEGACY_PROVIDER_TO_PRESET[type])

  return {
    value: type,
    label: preset.label,
    description: preset.description,
    defaultModel: preset.defaultModel,
    defaultBaseUrl: preset.defaultBaseUrl,
    baseUrlPlaceholder: preset.baseUrlPlaceholder,
    baseUrlHint: preset.baseUrlHint,
    modelPlaceholder: preset.modelPlaceholder,
    cost: preset.cost,
    apiKeyMode: preset.apiKeyMode,
    supportsBaseUrl: preset.supportsBaseUrl,
    docsUrl: preset.docsUrl,
  }
}

export function getProviderSettings(type: LLMProviderType): ProviderSettings {
  return toProviderSettings(type)
}

export function getVisibleProviderSettings(): ProviderSettings[] {
  return SETTINGS_PROVIDER_ORDER.map((type) => toProviderSettings(type))
}

export function getProtocolOptions(): ProtocolOption[] {
  return PROTOCOL_ORDER.map((type) => PROTOCOL_OPTIONS[type])
}

export function getPresetOptions(protocol: LLMProtocolType): PresetOption[] {
  return PRESET_ORDER_BY_PROTOCOL[protocol].map((type) => getPresetSettings(type))
}

export function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

export function resolveProviderBaseUrl(type: LLMProviderType, baseUrl?: string): string {
  const input = (baseUrl || '').trim()
  const fallback = getProviderSettings(type).defaultBaseUrl
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
