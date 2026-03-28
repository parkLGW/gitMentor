import { STORAGE_PREFIXES } from "@/constants/storage";

const EVICTABLE_PREFIXES = [
  STORAGE_PREFIXES.githubCache,
  STORAGE_PREFIXES.overviewAnalysis,
  STORAGE_PREFIXES.quickStart,
  STORAGE_PREFIXES.sourceMap,
  STORAGE_PREFIXES.securityAudit,
];

function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("exceeded") ||
    message.includes("storage")
  );
}

function readTimestamp(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { timestamp?: number };
    return typeof parsed.timestamp === "number" ? parsed.timestamp : 0;
  } catch {
    return 0;
  }
}

function canEvict(key: string): boolean {
  return EVICTABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function setLocalCacheWithEviction(
  key: string,
  value: string,
): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceeded(error)) {
      throw error;
    }
  }

  const candidates: Array<{ key: string; timestamp: number; size: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const cacheKey = localStorage.key(i);
    if (!cacheKey || cacheKey === key) continue;
    if (!canEvict(cacheKey)) continue;
    const raw = localStorage.getItem(cacheKey);
    candidates.push({
      key: cacheKey,
      timestamp: readTimestamp(raw),
      size: raw?.length || 0,
    });
  }

  candidates.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return b.size - a.size;
  });

  for (const item of candidates) {
    try {
      localStorage.removeItem(item.key);
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (!isQuotaExceeded(error)) {
        throw error;
      }
    }
  }

  return false;
}

export function setJsonCacheWithEviction<T>(key: string, data: T): boolean {
  return setLocalCacheWithEviction(
    key,
    JSON.stringify({
      data,
      timestamp: Date.now(),
    }),
  );
}
