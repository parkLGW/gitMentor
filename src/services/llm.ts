// LLM Service Manager

import { LLMConfig, LLMProvider, LLMProviderType } from '@/types/llm'
import { ClaudeProvider, OpenAIProvider, OllamaProvider, DeepSeekProvider, GroqProvider, LMStudioProvider } from './llm-base'

export class LLMManager {
  private static instance: LLMManager
  private providers: Map<LLMProviderType, LLMProvider> = new Map()
  private currentProvider: LLMProvider | null = null
  private configKey = 'gitmentor_llm_config'
  private initialized = false

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
    // Use chrome.storage for persistence across extension reloads
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(this.configKey, (data: any) => {
        try {
          if (data[this.configKey]) {
            const config = data[this.configKey]
            console.log('[LLMManager] Loaded saved config from chrome.storage:', config.provider)
            this.setCurrentProvider(config.provider, config)
            this.initialized = true
          }
        } catch (error) {
          console.warn('Failed to load saved LLM config from chrome.storage:', error)
        }
      })
    }
  }

  async setCurrentProvider(type: LLMProviderType, config: LLMConfig): Promise<void> {
    const provider = this.providers.get(type)
    if (!provider) {
      throw new Error(`Unknown provider: ${type}`)
    }

    await provider.configure(config)
    this.currentProvider = provider

    // Save config to chrome.storage for persistence
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const configToSave = {
        provider: type,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey, // Store API key securely in chrome.storage
      }
      
      // Use promise-based wrapper to ensure config is saved before returning
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({ [this.configKey]: configToSave }, () => {
          console.log('[LLMManager] Config saved to chrome.storage:', type, configToSave)
          resolve()
        })
      })
    }
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
    // Clear from chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(this.configKey, () => {
        console.log('[LLMManager] Config cleared from chrome.storage')
      })
    }
    this.currentProvider = null
  }
}

// Export singleton instance
export const llmManager = LLMManager.getInstance()
