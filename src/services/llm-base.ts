// Base LLM Provider implementations

import { LLMConfig, LLMProvider, LLMProviderType, LLMResponse } from '@/types/llm'

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string
  abstract type: LLMProviderType
  
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

// Claude Provider
export class ClaudeProvider extends BaseLLMProvider {
  name = 'Claude (Anthropic)'
  type = 'claude' as const

  async complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse> {
    const config = this.getConfig()
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-sonnet-20240229',
          max_tokens: config.maxTokens || 2000,
          system: this.createSystemPrompt(systemPrompt),
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Claude API error: ${error.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return {
        content: data.content[0].text,
        model: data.model,
        tokensUsed: {
          prompt: data.usage.input_tokens,
          completion: data.usage.output_tokens,
          total: data.usage.input_tokens + data.usage.output_tokens,
        },
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      throw new Error(`Claude error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-sonnet-20240229',
          max_tokens: config.maxTokens || 2000,
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
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content_block_delta' && data.delta.type === 'text_delta') {
              yield data.delta.text
            }
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-sonnet-20240229',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// OpenAI Provider
export class OpenAIProvider extends BaseLLMProvider {
  name = 'OpenAI (GPT-4)'
  type = 'openai' as const

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const config = this.getConfig()
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4',
          max_tokens: config.maxTokens || 2000,
          temperature: config.temperature ?? 0.7,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`)
      }

      const data = await response.json()
      return {
        content: data.choices[0].message.content,
        model: data.model,
        tokensUsed: {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        },
      }
    } catch (error) {
      throw new Error(`OpenAI error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4',
          max_tokens: config.maxTokens || 2000,
          temperature: config.temperature ?? 0.7,
          stream: true,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`)
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.choices?.[0]?.delta?.content) {
                yield data.choices[0].delta.content
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`OpenAI stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ok' }],
        }),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Ollama Provider (local)
export class OllamaProvider extends BaseLLMProvider {
  name = 'Ollama (Local)'
  type = 'ollama' as const

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const config = this.getConfig()
    const baseUrl = config.baseUrl || 'http://localhost:11434'

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'mistral',
          prompt: `${this.createSystemPrompt(systemPrompt)}\n\n${prompt}`,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        content: data.response,
        model: config.model || 'mistral',
      }
    } catch (error) {
      throw new Error(`Ollama error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()
    const baseUrl = config.baseUrl || 'http://localhost:11434'

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'mistral',
          prompt: `${this.createSystemPrompt(systemPrompt)}\n\n${prompt}`,
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`)
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
          if (line.trim()) {
            try {
              const data = JSON.parse(line)
              if (data.response) {
                yield data.response
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Ollama stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const baseUrl = config.baseUrl || 'http://localhost:11434'
      const response = await fetch(`${baseUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }
}

// DeepSeek Provider - 超便宜的中文LLM
export class DeepSeekProvider extends BaseLLMProvider {
  type: LLMProviderType = 'deepseek'
  name = 'DeepSeek'

  private async fetchWithRetry(
    url: string, 
    options: RequestInit, 
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[DeepSeek] Attempt ${attempt}/${maxRetries}...`)
        const response = await fetch(url, options)
        
        // Check if we got a valid response
        if (response.ok) {
          return response
        }
        
        // If server error (5xx), retry
        if (response.status >= 500) {
          console.log(`[DeepSeek] Server error ${response.status}, will retry...`)
          lastError = new Error(`HTTP ${response.status}`)
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
          continue
        }
        
        // For client errors (4xx), don't retry
        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.log(`[DeepSeek] Request failed (attempt ${attempt}):`, lastError.message)
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff: 2s, 4s, 8s)
          const waitTime = Math.pow(2, attempt) * 1000
          console.log(`[DeepSeek] Waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    throw lastError || new Error('All retry attempts failed')
  }

  async complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse> {
    const config = this.getConfig()

    try {
      const response = await this.fetchWithRetry(
        'https://api.deepseek.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model || 'deepseek-chat',
            temperature: config.temperature ?? 0.7,
            max_tokens: config.maxTokens || 2000,
            messages: [
              { role: 'system', content: this.createSystemPrompt(systemPrompt) },
              { role: 'user', content: prompt },
            ],
          }),
          signal,
        },
        3 // max retries
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || response.statusText || `HTTP ${response.status}`
        throw new Error(`DeepSeek API error: ${errorMessage}`)
      }

      const data = await response.json()
      console.log('[DeepSeek] Response received successfully')
      return {
        content: data.choices[0].message.content,
        model: config.model || 'deepseek-chat',
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
      throw new Error(`DeepSeek error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'deepseek-chat',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          stream: true,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.statusText}`)
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.choices[0].delta.content) {
                yield data.choices[0].delta.content
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`DeepSeek stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const response = await fetch('https://api.deepseek.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }
}


// LM Studio Provider - 本地免费运行，兼容OpenAI API
export class LMStudioProvider extends BaseLLMProvider {
  type: LLMProviderType = 'lmstudio'
  name = 'LM Studio'

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const config = this.getConfig()
    const baseUrl = config.baseUrl || 'http://localhost:1234'

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'local-model',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        content: data.choices[0].message.content,
        model: config.model || 'local-model',
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
      }
    } catch (error) {
      throw new Error(`LM Studio error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()
    const baseUrl = config.baseUrl || 'http://localhost:1234'

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'local-model',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          stream: true,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.statusText}`)
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.choices[0].delta.content) {
                yield data.choices[0].delta.content
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`LM Studio stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const baseUrl = config.baseUrl || 'http://localhost:1234'
      const response = await fetch(`${baseUrl}/v1/models`)
      return response.ok
    } catch {
      return false
    }
  }
}

// Zhipu (ChatGLM) Provider
export class ZhipuProvider extends BaseLLMProvider {
  type: LLMProviderType = 'zhipu'
  name = 'Zhipu AI (ChatGLM)'

  async complete(prompt: string, systemPrompt?: string): Promise<LLMResponse> {
    const config = this.getConfig()

    try {
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'glm-4',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || response.statusText || `HTTP ${response.status}`
        throw new Error(`Zhipu API error: ${errorMessage}`)
      }

      const data = await response.json()
      return {
        content: data.choices[0].message.content,
        model: config.model || 'glm-4',
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
      }
    } catch (error) {
      throw new Error(`Zhipu error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()

    try {
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'glm-4',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          stream: true,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`Zhipu API error: ${response.statusText}`)
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.choices[0]?.delta?.content) {
                yield data.choices[0].delta.content
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Zhipu stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Silicon Flow Provider - 硅基流动
export class SiliconFlowProvider extends BaseLLMProvider {
  type: LLMProviderType = 'siliconflow'
  name = 'Silicon Flow (硅基流动)'

  async complete(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<LLMResponse> {
    const config = this.getConfig()

    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'Qwen/Qwen2.5-72B-Instruct',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
        signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || response.statusText || `HTTP ${response.status}`
        throw new Error(`Silicon Flow API error: ${errorMessage}`)
      }

      const data = await response.json()
      return {
        content: data.choices[0].message.content,
        model: config.model || 'Qwen/Qwen2.5-72B-Instruct',
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
      throw new Error(`Silicon Flow error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async *stream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const config = this.getConfig()

    try {
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'Qwen/Qwen2.5-72B-Instruct',
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens || 2000,
          stream: true,
          messages: [
            { role: 'system', content: this.createSystemPrompt(systemPrompt) },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`Silicon Flow API error: ${response.statusText}`)
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            if (dataStr === '[DONE]') continue
            try {
              const data = JSON.parse(dataStr)
              if (data.choices[0].delta.content) {
                yield data.choices[0].delta.content
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Silicon Flow stream error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const config = this.getConfig()
      const response = await fetch('https://api.siliconflow.cn/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }
}
