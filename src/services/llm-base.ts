// Base LLM Provider implementations

import { LLMConfig, LLMProtocolType, LLMProvider, LLMResponse, NormalizedLLMConfig } from '@/types/llm'
import { migrateLegacyLLMConfig } from '@/services/llm-config-migration'
import {
  getPresetSettings,
  normalizeOpenAICompatibleBaseUrl,
  resolveProviderBaseUrl,
} from '@/services/llm-provider-config'
import { resolveClaudeCompatibleMessagesUrl } from '@/services/claude-compatible-utils'
import { shouldFallbackCustomStreaming } from '@/services/custom-openai-utils'

function resolveModel(normalized: NormalizedLLMConfig): string {
  return normalized.model || getPresetSettings(normalized.preset).defaultModel
}

function normalizeOpenAIFinishReason(
  reason: unknown,
): LLMResponse['finishReason'] {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'content_filter':
    case 'tool_calls':
      return reason
    default:
      return 'unknown'
  }
}

function normalizeClaudeStopReason(
  reason: unknown,
): LLMResponse['finishReason'] {
  switch (reason) {
    case 'max_tokens':
      return 'length'
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'tool_use':
      return 'tool_calls'
    default:
      return 'unknown'
  }
}

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string
  abstract type: LLMProtocolType
  
  protected config: LLMConfig | null = null
  protected isConfiguredFlag = false

  async configure(config: LLMConfig): Promise<void> {
    this.config = config
    this.isConfiguredFlag = true
    // Test connection after configuration
    const connected = await this.testConnection()
    if (!connected) {
      throw new Error(`Failed to connect to ${this.name}`)
    }
  }

  isConfigured(): boolean {
    return this.isConfiguredFlag && !!this.config
  }

  protected getConfig(): LLMConfig {
    if (!this.config) throw new Error('Provider not configured')
    return this.config
  }

  abstract complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse>
  abstract stream(prompt: string, systemPrompt?: string): AsyncGenerator<string>
  abstract testConnection(): Promise<boolean>

  protected createSystemPrompt(custom?: string): string {
    return custom || 'You are a helpful assistant analyzing GitHub projects. Provide clear, concise, and actionable information.'
  }
}

// Presets where the API key is optional or absent; skip the Authorization
// header entirely when no key is configured
const OPTIONAL_KEY_PRESETS = new Set(['custom-openai', 'custom-local', 'ollama', 'lmstudio'])

export class OpenAICompatibleProvider extends BaseLLMProvider {
  name = 'OpenAI-Compatible Protocol'
  type: LLMProtocolType = 'openai'

  private resolveApiUrl(config: LLMConfig): string {
    const normalized = migrateLegacyLLMConfig(config)

    switch (normalized.preset) {
      case 'openai-official':
        return 'https://api.openai.com/v1/chat/completions'
      case 'deepseek':
        return 'https://api.deepseek.com/v1/chat/completions'
      case 'siliconflow':
        return 'https://api.siliconflow.cn/v1/chat/completions'
      case 'zhipu':
        return 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
      // Local runtimes (Ollama, LM Studio) expose OpenAI-compatible endpoints,
      // so the local protocol shares this provider
      case 'ollama': {
        const baseUrl = resolveProviderBaseUrl('ollama', normalized.baseUrl) || 'http://localhost:11434'
        return `${baseUrl}/v1/chat/completions`
      }
      case 'lmstudio': {
        const baseUrl = resolveProviderBaseUrl('lmstudio', normalized.baseUrl) || 'http://localhost:1234'
        return `${baseUrl}/v1/chat/completions`
      }
      case 'custom-local':
      case 'custom-openai': {
        const baseUrl = normalizeOpenAICompatibleBaseUrl(normalized.baseUrl || '')
        if (!baseUrl) {
          throw new Error('OpenAI-compatible base URL is required')
        }
        return `${baseUrl}/chat/completions`
      }
      default:
        // Should not happen: migrateLegacyLLMConfig maps all current legacy providers.
        throw new Error(`Unsupported OpenAI-compatible preset: ${normalized.preset}`)
    }
  }

  private buildHeaders(config: LLMConfig): Record<string, string> {
    const normalized = migrateLegacyLLMConfig(config)
    const apiKey = normalized.apiKey || ''

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey || !OPTIONAL_KEY_PRESETS.has(normalized.preset)) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    return headers
  }

  async complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse> {
    const config = this.getConfig()
    const normalized = migrateLegacyLLMConfig(config)
    const apiUrl = this.resolveApiUrl(config)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: resolveModel(normalized),
          max_tokens: normalized.maxTokens || 2000,
          temperature: normalized.temperature ?? 0.7,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
        signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message = errorData.error?.message || response.statusText || `HTTP ${response.status}`
        throw new Error(message)
      }

      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content || '',
        finishReason: normalizeOpenAIFinishReason(data.choices?.[0]?.finish_reason),
        model: data.model || normalized.model,
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      throw new Error(`OpenAI-compatible error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()
    const normalized = migrateLegacyLLMConfig(config)
    const apiUrl = this.resolveApiUrl(config)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: resolveModel(normalized),
          max_tokens: normalized.maxTokens || 2000,
          temperature: normalized.temperature ?? 0.7,
          stream: true,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        if (
          (normalized.preset === 'custom-openai' || normalized.preset === 'custom-local') &&
          shouldFallbackCustomStreaming(response.status)
        ) {
          const fallback = await this.complete(prompt, systemPrompt)
          if (fallback.content) yield fallback.content
          return
        }
        throw new Error(`OpenAI-compatible API error: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        const fallback = await this.complete(prompt, systemPrompt)
        if (fallback.content) yield fallback.content
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6)
          if (dataStr === '[DONE]') continue
          try {
            const data = JSON.parse(dataStr)
            const chunk = data.choices?.[0]?.delta?.content
            if (chunk) yield chunk
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } catch (error) {
      throw new Error(`OpenAI-compatible stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const apiUrl = this.resolveApiUrl(config)
      const normalized = migrateLegacyLLMConfig(config)

      // Local runtimes: probe the models listing instead of a chat completion,
      // so the test does not force a model load (or fail on an unpulled model)
      if (normalized.preset === 'ollama' || normalized.preset === 'lmstudio') {
        const modelsUrl = apiUrl.replace(/\/chat\/completions$/, '/models')
        const response = await fetch(modelsUrl, { headers: this.buildHeaders(config) })
        return response.ok
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: resolveModel(normalized),
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }
}

export class ClaudeCompatibleProvider extends BaseLLMProvider {
  name = 'Claude-Compatible Protocol'
  type: LLMProtocolType = 'claude'

  private resolveApiUrl(config: LLMConfig): string {
    const normalized = migrateLegacyLLMConfig(config)
    if (normalized.preset === 'anthropic-official') {
      return 'https://api.anthropic.com/v1/messages'
    }
    if (normalized.preset === 'custom-claude') {
      const url = resolveClaudeCompatibleMessagesUrl(normalized.baseUrl)
      if (!url) throw new Error('Claude-compatible base URL is required')
      return url
    }
    throw new Error(`Unsupported Claude-compatible preset: ${normalized.preset}`)
  }

  private buildHeaders(config: LLMConfig): Record<string, string> {
    const normalized = migrateLegacyLLMConfig(config)
    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }
    if (normalized.apiKey) {
      headers['x-api-key'] = normalized.apiKey
    }
    return headers
  }

  async complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse> {
    const config = this.getConfig()
    const normalized = migrateLegacyLLMConfig(config)
    const apiUrl = this.resolveApiUrl(config)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: resolveModel(normalized),
          max_tokens: normalized.maxTokens || 2000,
          system: this.createSystemPrompt(systemPrompt),
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message = errorData.error?.message || response.statusText || `HTTP ${response.status}`
        throw new Error(message)
      }

      const data = await response.json()
      return {
        content: data.content?.[0]?.text || '',
        finishReason: normalizeClaudeStopReason(data.stop_reason),
        model: data.model || normalized.model,
        tokensUsed: {
          prompt: data.usage?.input_tokens || 0,
          completion: data.usage?.output_tokens || 0,
          total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      throw new Error(`Claude-compatible error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()
    const normalized = migrateLegacyLLMConfig(config)
    const apiUrl = this.resolveApiUrl(config)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: resolveModel(normalized),
          max_tokens: normalized.maxTokens || 2000,
          system: this.createSystemPrompt(systemPrompt),
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              yield data.delta.text
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      throw new Error(`Claude stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const normalized = migrateLegacyLLMConfig(config)
      const apiUrl = this.resolveApiUrl(config)

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: resolveModel(normalized),
          max_tokens: 20,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }
}
