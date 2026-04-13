// LLM Provider and protocol types and interfaces

export type LLMProtocolType = 'openai' | 'claude' | 'local'

export type LLMPresetType =
  | 'openai-official'
  | 'deepseek'
  | 'siliconflow'
  | 'zhipu'
  | 'custom-openai'
  | 'anthropic-official'
  | 'custom-claude'
  | 'ollama'
  | 'lmstudio'
  | 'custom-local'

interface LLMConfigSharedFields {
  apiKey: string
  model?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

export interface NormalizedLLMConfig extends LLMConfigSharedFields {
  protocol: LLMProtocolType
  preset: LLMPresetType
  localMode?: 'ollama' | 'openai-compatible'
}

export interface LegacyLLMConfig extends LLMConfigSharedFields {
  provider:
    | 'claude'
    | 'openai'
    | 'custom'
    | 'ollama'
    | 'deepseek'
    | 'lmstudio'
    | 'zhipu'
    | 'siliconflow'
}

export type LLMProviderType = LegacyLLMConfig['provider']

export type LLMConfig =
  | LegacyLLMConfig
  | (NormalizedLLMConfig & {
      // Transitional compatibility during provider->protocol migration.
      provider?: LLMProviderType
    })

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMResponse {
  content: string
  tokensUsed?: {
    prompt: number
    completion: number
    total: number
  }
  model?: string
}

export interface LLMProvider {
  name: string
  type: LLMProtocolType
  
  // Configure provider with API key and settings
  configure(config: LLMConfig): Promise<void>
  
  // Check if provider is properly configured
  isConfigured(): boolean
  
  // Single completion call with optional abort signal
  complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse>
  
  // Stream completion (for long responses)
  stream(prompt: string, systemPrompt?: string): AsyncGenerator<string>
  
  // Test connection
  testConnection(): Promise<boolean>
}

export interface AnalysisPrompts {
  projectAnalysis: string
  quickStart: string
  sourceMap: string
}

export interface AnalysisResult {
  type: 'project' | 'quickstart' | 'sourcemap'
  content: string
  provider: LLMProtocolType
  model: string
  timestamp: number
  tokensUsed?: number
}
