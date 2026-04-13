// LLM Service Manager

import { LLMConfig, LLMProtocolType, LLMProvider, LLMProviderType } from '@/types/llm'
import { migrateLegacyLLMConfig } from '@/services/llm-config-migration'
import { ClaudeCompatibleProvider, LocalProvider, OpenAICompatibleProvider } from './llm-base'
import { eventBus, EVENTS } from '@/utils/eventBus'
import { STORAGE_KEYS } from '@/constants/storage'

export class LLMManager {
  private static instance: LLMManager
  private providers: Map<LLMProtocolType, LLMProvider> = new Map()
  private currentProvider: LLMProvider | null = null
  private configKey = STORAGE_KEYS.llmConfig
  private multiConfigKey = STORAGE_KEYS.llmConfigMap

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
    this.providers.set('openai', new OpenAICompatibleProvider())
    this.providers.set('claude', new ClaudeCompatibleProvider())
    this.providers.set('local', new LocalProvider())
  }

  private loadSavedConfig(): void {
    // Use chrome.storage for persistence across extension reloads
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(this.configKey, (data: any) => {
        try {
          if (data[this.configKey]) {
            const config = data[this.configKey]
            const providerCandidate = (config as { provider?: unknown }).provider
            const provider = typeof providerCandidate === 'string'
              ? (providerCandidate as LLMProviderType)
              : (() => {
                  const normalized = migrateLegacyLLMConfig(config)
                  // Best-effort fallback when storage is already protocolized.
                  if (normalized.protocol === 'claude') return 'claude'
                  if (normalized.protocol === 'local') {
                    return normalized.preset === 'lmstudio' ? 'lmstudio' : 'ollama'
                  }
                  return normalized.preset === 'custom-openai' ? 'custom' : 'openai'
                })()

            console.log('[LLMManager] Loaded saved config from chrome.storage:', provider)
            this.setCurrentProvider(provider, config)
          }
        } catch (error) {
          console.warn('Failed to load saved LLM config from chrome.storage:', error)
        }
      })
    }
  }

  private createProtocolProvider(protocol: LLMProtocolType): LLMProvider {
    switch (protocol) {
      case 'openai':
        return new OpenAICompatibleProvider()
      case 'claude':
        return new ClaudeCompatibleProvider()
      case 'local':
        return new LocalProvider()
      default:
        throw new Error(`Unknown protocol: ${protocol}`)
    }
  }

  async setCurrentProvider(type: LLMProviderType, config: LLMConfig): Promise<void> {
    const normalized = migrateLegacyLLMConfig(config)
    const provider = this.providers.get(normalized.protocol)
    if (!provider) {
      throw new Error(`Unknown protocol: ${normalized.protocol}`)
    }

    // Keep legacy `provider` field for mid-migration UI flows, while routing by protocol.
    await provider.configure({ ...normalized, provider: type } as LLMConfig)
    this.currentProvider = provider

    // Emit event to notify listeners
    eventBus.emit(EVENTS.LLM_CONFIG_CHANGED, type, config)

    // Save config to chrome.storage for persistence
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const configToSave = {
        provider: type,
        protocol: normalized.protocol,
        preset: normalized.preset,
        localMode: normalized.localMode,
        apiKey: normalized.apiKey,
        model: normalized.model,
        baseUrl: normalized.baseUrl,
        temperature: normalized.temperature,
        maxTokens: normalized.maxTokens,
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

  getProvider(protocol: LLMProtocolType): LLMProvider | undefined {
    return this.providers.get(protocol)
  }

  getAvailableProviders(): LLMProtocolType[] {
    return Array.from(this.providers.keys())
  }

  async testProvider(type: LLMProviderType, config: LLMConfig): Promise<boolean> {
    const normalized = migrateLegacyLLMConfig(config)
    const provider = this.createProtocolProvider(normalized.protocol)

    try {
      await provider.configure({ ...normalized, provider: type } as LLMConfig)
      return provider.isConfigured()
    } catch {
      return false
    }
  }

  async clearConfig(type?: LLMProviderType): Promise<void> {
    eventBus.emit(EVENTS.LLM_CONFIG_CLEARED, type)

    if (typeof chrome === 'undefined' || !chrome.storage) {
      this.currentProvider = null
      return
    }

    return new Promise((resolve) => {
      chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
        const map = ((data[this.multiConfigKey] as Record<string, LLMConfig>) || {})

        if (type) {
          delete map[type]
        }

        const operations: Record<string, unknown> = { [this.multiConfigKey]: map }
        chrome.storage.local.set(operations, () => {
          const finish = () => {
            console.log('[LLMManager] Config cleared from chrome.storage', type || '(active)')
            resolve()
          }

          if (!type) {
            chrome.storage.local.remove([this.configKey, this.multiConfigKey], () => {
              this.currentProvider = null
              finish()
            })
            return
          }

          chrome.storage.local.get(this.configKey, (activeConfig: Record<string, unknown>) => {
            if ((activeConfig[this.configKey] as LLMConfig | undefined)?.provider === type) {
              chrome.storage.local.remove(this.configKey, () => {
                this.currentProvider = null
                finish()
              })
              return
            }
            finish()
          })
        })
      })
    })
  }
}

// Export singleton instance
export const llmManager = LLMManager.getInstance()
