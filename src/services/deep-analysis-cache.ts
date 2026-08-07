import { STORAGE_PREFIXES } from "../constants/storage.js";

export interface DeepAnalysisCacheRef {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export interface DeepAnalysisCacheEntry<T> {
  data: T;
  timestamp: number;
}

export const DEEP_ANALYSIS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** chrome.storage.local has no eviction of its own, so cap the entry count. */
export const DEEP_ANALYSIS_CACHE_LIMIT = 60;

/**
 * FNV-1a. The analysis describes a specific revision of the file, so the content
 * has to take part in the key — otherwise a stale analysis would survive an edit
 * to the same path on the same branch.
 */
function hashContent(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function buildDeepAnalysisCacheKey(
  ref: DeepAnalysisCacheRef,
  language: "zh" | "en",
  fileContent: string,
): string {
  const file = `${ref.owner}/${ref.repo}@${ref.branch}:${ref.path}`;
  return `${STORAGE_PREFIXES.deepFileAnalysis}${file}|${language}|${hashContent(fileContent)}`;
}

export function isDeepAnalysisCacheKey(key: string): boolean {
  return key.startsWith(STORAGE_PREFIXES.deepFileAnalysis);
}

export function readFreshEntry<T>(
  raw: unknown,
  now: number,
  maxAgeMs: number = DEEP_ANALYSIS_CACHE_TTL_MS,
): T | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Partial<DeepAnalysisCacheEntry<T>>;
  if (typeof entry.timestamp !== "number" || entry.data == null) return null;
  if (now - entry.timestamp > maxAgeMs) return null;
  return entry.data as T;
}

/**
 * Returns the keys to drop so that at most `limit` entries remain, oldest first.
 */
export function selectEvictableKeys(
  stored: Record<string, unknown>,
  limit: number = DEEP_ANALYSIS_CACHE_LIMIT,
): string[] {
  const entries = Object.entries(stored)
    .filter(([key]) => isDeepAnalysisCacheKey(key))
    .map(([key, value]) => ({
      key,
      timestamp:
        typeof (value as DeepAnalysisCacheEntry<unknown>)?.timestamp === "number"
          ? (value as DeepAnalysisCacheEntry<unknown>).timestamp
          : 0,
    }));

  if (entries.length <= limit) return [];

  entries.sort((a, b) => a.timestamp - b.timestamp);
  return entries.slice(0, entries.length - limit).map((entry) => entry.key);
}
