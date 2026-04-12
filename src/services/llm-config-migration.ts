import { LLMConfig, LegacyLLMConfig, NormalizedLLMConfig } from '../types/llm.js'

export function migrateLegacyLLMConfig(
  config: LegacyLLMConfig | LLMConfig | NormalizedLLMConfig,
): NormalizedLLMConfig {
  if ('protocol' in config && 'preset' in config) {
    return {
      protocol: config.protocol,
      preset: config.preset,
      localMode: config.localMode,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    }
  }

  const commonFields = {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  }

  switch (config.provider) {
    case 'openai':
      return {
        protocol: 'openai',
        preset: 'openai-official',
        ...commonFields,
      }
    case 'custom':
      return {
        protocol: 'openai',
        preset: 'custom-openai',
        ...commonFields,
      }
    case 'deepseek':
      return {
        protocol: 'openai',
        preset: 'deepseek',
        ...commonFields,
      }
    case 'siliconflow':
      return {
        protocol: 'openai',
        preset: 'siliconflow',
        ...commonFields,
      }
    case 'zhipu':
      return {
        protocol: 'openai',
        preset: 'zhipu',
        ...commonFields,
      }
    case 'claude':
      return {
        protocol: 'claude',
        preset: 'anthropic-official',
        ...commonFields,
      }
    case 'ollama':
      return {
        protocol: 'local',
        preset: 'ollama',
        localMode: 'ollama',
        ...commonFields,
      }
    case 'lmstudio':
      return {
        protocol: 'local',
        preset: 'lmstudio',
        localMode: 'openai-compatible',
        ...commonFields,
      }
  }
}
