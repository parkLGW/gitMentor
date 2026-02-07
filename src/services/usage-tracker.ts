// Token Usage Tracker Service
// Tracks API calls and estimated token usage

export interface UsageRecord {
  timestamp: number
  action: string
  inputTokens: number
  outputTokens: number
  model: string
  repo?: string
}

export interface UsageStats {
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  estimatedCost: number
  byAction: Record<string, { calls: number; tokens: number }>
  recentRecords: UsageRecord[]
}

const STORAGE_KEY = 'gitmentor_usage_stats'
const MAX_RECORDS = 100

// Rough token estimation (4 chars = 1 token for English, 2 chars = 1 token for Chinese)
export function estimateTokens(text: string): number {
  if (!text) return 0
  // Count Chinese characters
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

// Cost per 1M tokens (approximate, varies by model)
const COST_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-opus': { input: 15, output: 75 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'default': { input: 0.5, output: 1.5 },
}

function getCostRate(model: string): { input: number; output: number } {
  const modelLower = model.toLowerCase()
  for (const [key, rate] of Object.entries(COST_PER_1M_TOKENS)) {
    if (modelLower.includes(key)) {
      return rate
    }
  }
  return COST_PER_1M_TOKENS['default']
}

class UsageTracker {
  private records: UsageRecord[] = []
  private loaded = false

  private async load() {
    if (this.loaded) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        this.records = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('[UsageTracker] Failed to load:', e)
    }
    this.loaded = true
  }

  private save() {
    try {
      // Keep only recent records
      if (this.records.length > MAX_RECORDS) {
        this.records = this.records.slice(-MAX_RECORDS)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records))
    } catch (e) {
      console.warn('[UsageTracker] Failed to save:', e)
    }
  }

  async track(
    action: string,
    inputText: string,
    outputText: string,
    model: string,
    repo?: string
  ) {
    await this.load()

    const inputTokens = estimateTokens(inputText)
    const outputTokens = estimateTokens(outputText)

    const record: UsageRecord = {
      timestamp: Date.now(),
      action,
      inputTokens,
      outputTokens,
      model,
      repo,
    }

    this.records.push(record)
    this.save()

    console.log(`[UsageTracker] ${action}: ~${inputTokens + outputTokens} tokens (${model})`)

    return record
  }

  async getStats(days: number = 7): Promise<UsageStats> {
    await this.load()

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const recentRecords = this.records.filter((r) => r.timestamp > cutoff)

    const stats: UsageStats = {
      totalCalls: recentRecords.length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      byAction: {},
      recentRecords: recentRecords.slice(-20).reverse(),
    }

    for (const record of recentRecords) {
      stats.totalInputTokens += record.inputTokens
      stats.totalOutputTokens += record.outputTokens

      // By action
      if (!stats.byAction[record.action]) {
        stats.byAction[record.action] = { calls: 0, tokens: 0 }
      }
      stats.byAction[record.action].calls++
      stats.byAction[record.action].tokens += record.inputTokens + record.outputTokens

      // Estimated cost
      const rate = getCostRate(record.model)
      stats.estimatedCost +=
        (record.inputTokens * rate.input + record.outputTokens * rate.output) / 1_000_000
    }

    stats.totalTokens = stats.totalInputTokens + stats.totalOutputTokens

    return stats
  }

  async clear() {
    this.records = []
    this.save()
  }
}

export const usageTracker = new UsageTracker()
