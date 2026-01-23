// LLM Provider types and interfaces

export type LLMProviderType = 'claude' | 'openai' | 'ollama' | 'deepseek' | 'groq' | 'lmstudio'

export interface LLMConfig {
  provider: LLMProviderType
  apiKey: string
  model?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

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
  type: LLMProviderType
  
  // Configure provider with API key and settings
  configure(config: LLMConfig): Promise<void>
  
  // Check if provider is properly configured
  isConfigured(): boolean
  
  // Single completion call
  complete(prompt: string, systemPrompt?: string): Promise<LLMResponse>
  
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
  provider: LLMProviderType
  model: string
  timestamp: number
  tokensUsed?: number
}
