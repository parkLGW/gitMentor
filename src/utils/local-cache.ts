import { STORAGE_PREFIXES } from "../constants/storage.js";

const EVICTABLE_PREFIXES = [
  STORAGE_PREFIXES.githubCache,
  STORAGE_PREFIXES.overviewAnalysis,
  STORAGE_PREFIXES.quickStart,
  STORAGE_PREFIXES.sourceMap,
  STORAGE_PREFIXES.securityAudit,
  STORAGE_PREFIXES.agentSession,
  STORAGE_PREFIXES.agentSummary,
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

export function getJsonCache<T>(
  key: string,
  maxAgeMs: number,
  validate?: (data: unknown) => boolean,
): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const { data, timestamp } = JSON.parse(raw) as {
      data?: unknown;
      timestamp?: number;
    };
    if (typeof timestamp !== "number" || Date.now() - timestamp > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    if (data == null || (validate && !validate(data))) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
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
