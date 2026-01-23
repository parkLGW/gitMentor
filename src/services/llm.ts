// LLM Service Manager

import { LLMConfig, LLMProvider, LLMProviderType } from '@/types/llm'
import { ClaudeProvider, OpenAIProvider, OllamaProvider, DeepSeekProvider, GroqProvider, LMStudioProvider } from './llm-base'

export class LLMManager {
  private static instance: LLMManager
  private providers: Map<LLMProviderType, LLMProvider> = new Map()
  private currentProvider: LLMProvider | null = null
  private configKey = 'gitmentor_llm_config'

  private constructor() {
    this.initializeProviders()
    this.loadSavedConfig()
  }

  static getInstance(): LLMManager {
    if (!LLMManager.instance) {
      LLMManager.instance = new LLMManager()
    }
    return LLMManager.instance
  }

  private initializeProviders(): void {
    this.providers.set('claude', new ClaudeProvider())
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('ollama', new OllamaProvider())
    this.providers.set('deepseek', new DeepSeekProvider())
    this.providers.set('groq', new GroqProvider())
    this.providers.set('lmstudio', new LMStudioProvider())
  }

  private loadSavedConfig(): void {
    try {
      const saved = localStorage.getItem(this.configKey)
      if (saved) {
        const config = JSON.parse(saved)
        this.setCurrentProvider(config.provider, config)
      }
    } catch (error) {
      console.warn('Failed to load saved LLM config:', error)
    }
  }

  async setCurrentProvider(type: LLMProviderType, config: LLMConfig): Promise<void> {
    const provider = this.providers.get(type)
    if (!provider) {
      throw new Error(`Unknown provider: ${type}`)
    }

    await provider.configure(config)
    this.currentProvider = provider

    // Save config (without API key for security)
    localStorage.setItem(
      this.configKey,
      JSON.stringify({
        provider: type,
        model: config.model,
        baseUrl: config.baseUrl,
      })
    )
  }

  getCurrentProvider(): LLMProvider | null {
    return this.currentProvider
  }

  isConfigured(): boolean {
    return this.currentProvider?.isConfigured() ?? false
  }

  getProvider(type: LLMProviderType): LLMProvider | undefined {
    return this.providers.get(type)
  }

  getAvailableProviders(): LLMProviderType[] {
    return Array.from(this.providers.keys())
  }

  async testProvider(type: LLMProviderType, config: LLMConfig): Promise<boolean> {
    const provider = this.providers.get(type)
    if (!provider) return false

    try {
      const tempConfig = { ...config }
      await provider.configure(tempConfig)
      return await provider.testConnection()
    } catch {
      return false
    }
  }

  clearConfig(): void {
    localStorage.removeItem(this.configKey)
    this.currentProvider = null
  }
}

// Export singleton instance
export const llmManager = LLMManager.getInstance()
