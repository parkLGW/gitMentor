// Fetches the provider's own model listing so the Settings page can offer
// live model choices instead of relying on hard-coded defaults.
import { LLMConfig } from '@/types/llm'
import { migrateLegacyLLMConfig } from './llm-config-migration'
import { resolveClaudeCompatibleMessagesUrl } from './claude-compatible-utils'
import { normalizeOpenAICompatibleBaseUrl, resolveProviderBaseUrl } from './llm-provider-config'

function resolveModelsUrl(config: LLMConfig): { url: string; headers: Record<string, string> } {
  const normalized = migrateLegacyLLMConfig(config)

  if (normalized.protocol === 'claude') {
    const headers: Record<string, string> = { 'anthropic-version': '2023-06-01' }
    if (normalized.apiKey) headers['x-api-key'] = normalized.apiKey

    if (normalized.preset === 'anthropic-official') {
      return { url: 'https://api.anthropic.com/v1/models', headers }
    }
    const messagesUrl = resolveClaudeCompatibleMessagesUrl(normalized.baseUrl)
    if (!messagesUrl) throw new Error('Base URL is required')
    return { url: messagesUrl.replace(/\/messages\/?$/, '/models'), headers }
  }

  const headers: Record<string, string> = {}
  if (normalized.apiKey) headers.Authorization = `Bearer ${normalized.apiKey}`

  switch (normalized.preset) {
    case 'openai-official':
      return { url: 'https://api.openai.com/v1/models', headers }
    case 'deepseek':
      return { url: 'https://api.deepseek.com/v1/models', headers }
    case 'siliconflow':
      return { url: 'https://api.siliconflow.cn/v1/models', headers }
    case 'zhipu':
      return { url: 'https://open.bigmodel.cn/api/paas/v4/models', headers }
    case 'ollama':
      return {
        url: `${resolveProviderBaseUrl('ollama', normalized.baseUrl) || 'http://localhost:11434'}/v1/models`,
        headers,
      }
    case 'lmstudio':
      return {
        url: `${resolveProviderBaseUrl('lmstudio', normalized.baseUrl) || 'http://localhost:1234'}/v1/models`,
        headers,
      }
    default: {
      const base = normalizeOpenAICompatibleBaseUrl(normalized.baseUrl || '')
      if (!base) throw new Error('Base URL is required')
      return { url: `${base}/models`, headers }
    }
  }
}

export async function fetchAvailableModels(
  config: LLMConfig,
  options: { timeoutMs?: number } = {},
): Promise<string[]> {
  const { url, headers } = resolveModelsUrl(config)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000)

  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const entries = Array.isArray(data?.data) ? data.data : []
    const ids = entries
      .map((entry: unknown) =>
        typeof (entry as { id?: unknown })?.id === 'string' ? (entry as { id: string }).id : '',
      )
      .filter(Boolean)

    // Preserve API order (providers usually list newest first), dedupe only
    return Array.from(new Set<string>(ids))
  } finally {
    clearTimeout(timer)
  }
}
