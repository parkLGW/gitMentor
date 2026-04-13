export function normalizeClaudeCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  return trimmed
}

export function resolveClaudeCompatibleBaseUrl(baseUrl?: string): string {
  return normalizeClaudeCompatibleBaseUrl(baseUrl || '')
}

export function resolveClaudeCompatibleMessagesUrl(baseUrl?: string): string {
  const resolved = resolveClaudeCompatibleBaseUrl(baseUrl)
  if (!resolved) return ''

  if (resolved.endsWith('/v1/messages') || resolved.endsWith('/messages')) {
    return resolved
  }

  if (resolved.endsWith('/v1')) {
    return `${resolved}/messages`
  }

  return `${resolved}/v1/messages`
}
