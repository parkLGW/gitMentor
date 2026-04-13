export function normalizeClaudeCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  return trimmed
}

export function resolveClaudeCompatibleBaseUrl(baseUrl?: string): string {
  return normalizeClaudeCompatibleBaseUrl(baseUrl || '')
}
