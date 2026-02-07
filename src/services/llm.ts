// LLM Service Manager

import { LLMConfig, LLMProvider, LLMProviderType } from '@/types/llm'
import { ClaudeProvider, OpenAIProvider, OllamaProvider, DeepSeekProvider, LMStudioProvider, ZhipuProvider, SiliconFlowProvider } from './llm-base'
import { eventBus, EVENTS } from '@/utils/eventBus'

export class LLMManager {
  private static instance: LLMManager
  private providers: Map<LLMProviderType, LLMProvider> = new Map()
  private currentProvider: LLMProvider | null = null
  private configKey = 'gitmentor_llm_config'
  private multiConfigKey = 'gitmentor_llm_configs_map'

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
    this.providers.set('zhipu', new ZhipuProvider())
    this.providers.set('lmstudio', new LMStudioProvider())
    this.providers.set('siliconflow', new SiliconFlowProvider())
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

    // Emit event to notify listeners
    eventBus.emit(EVENTS.LLM_CONFIG_CHANGED, type, config)

    // Save config to chrome.storage for persistence
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const configToSave = {
        provider: type,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      }

      // Use promise-based wrapper to ensure config is saved before returning
      return new Promise<void>((resolve) => {
        // 1. Save active config
        chrome.storage.local.set({ [this.configKey]: configToSave }, () => {
          // 2. Save to map for multi-provider support
          chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
            const map = (data[this.multiConfigKey] as Record<string, unknown>) || {}
            map[type] = configToSave
            chrome.storage.local.set({ [this.multiConfigKey]: map }, () => {
              console.log('[LLMManager] Config saved to map:', type)
              resolve()
            })
          })
        })
      })
    }
  }

  async getSavedConfig(type: LLMProviderType): Promise<LLMConfig | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) return null

    return new Promise((resolve) => {
      chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
        const map = (data[this.multiConfigKey] as Record<string, LLMConfig>) || {}
        resolve(map[type] || null)
      })
    })
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
    // Emit event before clearing
    eventBus.emit(EVENTS.LLM_CONFIG_CLEARED)

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
