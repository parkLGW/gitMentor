import { normalizeGithubFilePath } from "@/services/agent-code-context";
import type { AgentMessage } from "@/types/agent";

export function buildGithubBlobUrl(
  repo: { owner: string; name: string },
  filePath: string,
  branch?: string,
): string {
  const normalizedPath = normalizeGithubFilePath(filePath);
  const encodedPath = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedBranch = encodeURIComponent(branch || "main");
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob/${encodedBranch}/${encodedPath}`;
}

export function getAnalyzedFiles(
  message: AgentMessage,
): NonNullable<AgentMessage["retrievedFiles"]> {
  const retrievedFiles = Array.isArray(message.retrievedFiles)
    ? message.retrievedFiles
    : [];
  const seen = new Set<string>();
  return retrievedFiles
    .filter((file) => file.status === "fetched" && file.filePath)
    .filter((file) => {
      const key = `${file.branch || "main"}::${file.filePath}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

export function getFallbackRelatedFiles(message: AgentMessage): string[] {
  const evidence = Array.isArray(message.evidence) ? message.evidence : [];
  const relatedFiles = evidence
    .filter((item) => item.reason === "related_file" && item.filePath)
    .map((item) => String(item.filePath));
  const fallbackFiles = evidence
    .filter((item) => item.filePath)
    .map((item) => String(item.filePath));
  const files = new Set<string>();
  for (const filePath of relatedFiles.length ? relatedFiles : fallbackFiles) {
    if (!filePath || files.has(filePath)) continue;
    files.add(filePath);
    if (files.size >= 6) break;
  }
  return Array.from(files);
}

/**
 * Localized confidence label. The raw values are English enum strings, so
 * rendering them as-is produces mixed-language UI like "置信度: low".
 */
export function formatConfidenceLabel(
  confidence: string | undefined,
  language: "zh" | "en",
): string {
  if (language !== "zh") return confidence || "low";
  const labels: Record<string, string> = { high: "高", medium: "中", low: "低" };
  return labels[String(confidence || "low")] || "低";
}

const MAX_DISPLAY_PATH_SEGMENTS = 6;

function pathTail(filePath: string, segmentCount: number): string {
  const segments = String(filePath || "").split("/").filter(Boolean);
  if (segments.length <= segmentCount) return segments.join("/");
  return `…/${segments.slice(-segmentCount).join("/")}`;
}

/**
 * Compact a repo-relative path for a narrow chip: keep the identifying tail
 * (`…/tools/index.ts`) rather than a full monorepo path that overflows the
 * popup. The full path is still shown via the element's title attribute.
 */
export function shortenFilePathForDisplay(filePath: string): string {
  return pathTail(filePath, 2);
}

/**
 * Shorten a group of paths while keeping them distinguishable. Truncating each
 * path independently makes distinct files collapse into the same label (several
 * `…/commands/search.ts` rows in a monorepo), so grow the tail per path until
 * it is unique within the group.
 */
export function shortenFilePathsForDisplay(filePaths: string[]): string[] {
  return filePaths.map((filePath) => {
    const others = filePaths.filter((candidate) => candidate !== filePath);
    for (let count = 2; count <= MAX_DISPLAY_PATH_SEGMENTS; count += 1) {
      const label = pathTail(filePath, count);
      const collides = others.some((other) => pathTail(other, count) === label);
      if (!collides) return label;
    }
    return filePath;
  });
}

/**
 * Evidence items to render. The model frequently returns the same file/reason
 * twice, so de-duplicate before capping rather than showing a repeated row.
 */
export function getDisplayEvidence(
  message: AgentMessage,
  limit = 2,
): NonNullable<AgentMessage["evidence"]> {
  const evidence = Array.isArray(message.evidence) ? message.evidence : [];
  const seen = new Set<string>();
  return evidence
    .filter((item) => item.reason !== "related_file")
    .filter((item) => {
      const key = `${item.filePath || ""}::${item.reason || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildRetrievalUiNote(
  message: AgentMessage,
  language: "zh" | "en",
): string | null {
  if (!message.retrievalNote) return null;

  const retrievedFiles = Array.isArray(message.retrievedFiles)
    ? message.retrievedFiles
    : [];
  const requestedCount = retrievedFiles.length;
  const fetchedCount = retrievedFiles.filter((file) => file.status === "fetched").length;

  if (message.retrievalMode === "summary-only" && requestedCount > 0 && fetchedCount === 0) {
    return language === "zh"
      ? "GitHub 源码未成功获取（通常是接口限流或网络问题），本次回答回退为 README、源码地图和会话上下文。建议在设置中配置 GitHub Token 或稍后重试以提升成功率。"
      : "GitHub code could not be fetched (usually API rate limiting or a network issue), so this answer fell back to README, source map, and session context. Configuring a GitHub token in settings or retrying shortly should help.";
  }

  if (message.retrievalMode === "github-code" && requestedCount > 0 && fetchedCount > 0 && fetchedCount < requestedCount) {
    return language === "zh"
      ? `仅成功获取 ${fetchedCount}/${requestedCount} 个 GitHub 文件。`
      : `Used ${fetchedCount}/${requestedCount} requested GitHub files.`;
  }

  return message.retrievalNote;
}
