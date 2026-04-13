// LLM Service Manager

import { LLMConfig, LLMPresetType, LLMProtocolType, LLMProvider, LLMProviderType } from '@/types/llm'
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
            const normalized = migrateLegacyLLMConfig(config)
            console.log(
              '[LLMManager] Loaded saved config from chrome.storage:',
              normalized.protocol,
              normalized.preset,
            )
            void this.applyCurrentConfig(config)
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

  private getSelectionKey(protocol: LLMProtocolType, preset: LLMPresetType): string {
    return `${protocol}:${preset}`
  }

  private async applyCurrentConfig(config: LLMConfig): Promise<void> {
    const normalized = migrateLegacyLLMConfig(config)
    const provider = this.providers.get(normalized.protocol)
    if (!provider) {
      throw new Error(`Unknown protocol: ${normalized.protocol}`)
    }

    await provider.configure(config)
    this.currentProvider = provider
  }

  async setCurrentConfig(config: LLMConfig): Promise<void> {
    const normalized = migrateLegacyLLMConfig(config)
    await this.applyCurrentConfig(config)

    const providerCandidate = (config as { provider?: unknown }).provider
    const configToSave =
      typeof providerCandidate === 'string'
        ? { ...normalized, provider: providerCandidate as LLMProviderType }
        : normalized

    eventBus.emit(EVENTS.LLM_CONFIG_CHANGED, normalized.protocol, configToSave)

    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({ [this.configKey]: configToSave }, () => {
          chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
            const map = (data[this.multiConfigKey] as Record<string, unknown>) || {}
            map[this.getSelectionKey(normalized.protocol, normalized.preset)] = configToSave
            chrome.storage.local.set({ [this.multiConfigKey]: map }, () => {
              console.log('[LLMManager] Config saved to selection map:', normalized.protocol, normalized.preset)
              resolve()
            })
          })
        })
      })
    }
  }

  async setCurrentProvider(type: LLMProviderType, config: LLMConfig): Promise<void> {
    return this.setCurrentConfig({ ...migrateLegacyLLMConfig(config), provider: type } as LLMConfig)
  }

  async getSavedConfig(type: LLMProviderType): Promise<LLMConfig | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) return null

    return new Promise((resolve) => {
      chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
        const map = (data[this.multiConfigKey] as Record<string, LLMConfig>) || {}
        const direct = map[type]
        if (direct) {
          resolve(direct)
          return
        }

        const fallback = Object.values(map).find((entry) => {
          const providerCandidate = (entry as { provider?: unknown }).provider
          return providerCandidate === type
        })
        resolve(fallback || null)
      })
    })
  }

  async getSavedConfigForSelection(protocol: LLMProtocolType, preset: LLMPresetType): Promise<LLMConfig | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) return null

    return new Promise((resolve) => {
      chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
        const map = (data[this.multiConfigKey] as Record<string, LLMConfig>) || {}
        resolve(map[this.getSelectionKey(protocol, preset)] || null)
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

  async testConfig(config: LLMConfig): Promise<boolean> {
    const normalized = migrateLegacyLLMConfig(config)
    const provider = this.createProtocolProvider(normalized.protocol)

    try {
      await provider.configure(config)
      return provider.isConfigured()
    } catch {
      return false
    }
  }

  async clearConfig(selection?: LLMProviderType | { protocol: LLMProtocolType; preset: LLMPresetType }): Promise<void> {
    eventBus.emit(EVENTS.LLM_CONFIG_CLEARED, selection)

    if (typeof chrome === 'undefined' || !chrome.storage) {
      this.currentProvider = null
      return
    }

    return new Promise((resolve) => {
      chrome.storage.local.get(this.multiConfigKey, (data: Record<string, unknown>) => {
        const map = ((data[this.multiConfigKey] as Record<string, LLMConfig>) || {})
        const activeSelection = typeof selection === 'string' ? selection : null
        const selectionKey =
          selection && typeof selection !== 'string'
            ? this.getSelectionKey(selection.protocol, selection.preset)
            : null

        if (selectionKey) {
          delete map[selectionKey]
        } else if (activeSelection) {
          delete map[activeSelection]
          Object.entries(map).forEach(([key, value]) => {
            if ((value as { provider?: unknown }).provider === activeSelection) {
              delete map[key]
            }
          })
        }

        const operations: Record<string, unknown> = { [this.multiConfigKey]: map }
        chrome.storage.local.set(operations, () => {
          const finish = () => {
            console.log('[LLMManager] Config cleared from chrome.storage', selection || '(active)')
            resolve()
          }

          if (!selection) {
            chrome.storage.local.remove([this.configKey, this.multiConfigKey], () => {
              this.currentProvider = null
              finish()
            })
            return
          }

          chrome.storage.local.get(this.configKey, (activeConfig: Record<string, unknown>) => {
            const active = activeConfig[this.configKey] as LLMConfig | undefined
            const normalizedActive = active ? migrateLegacyLLMConfig(active) : null
            const shouldClearActive =
              !!active &&
              (typeof selection === 'string'
                ? (active as { provider?: unknown }).provider === selection
                : !!normalizedActive &&
                  normalizedActive.protocol === selection.protocol &&
                  normalizedActive.preset === selection.preset)

            if (shouldClearActive) {
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
