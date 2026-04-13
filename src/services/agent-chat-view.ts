import type { AgentMessage } from "@/types/agent";

export function buildGithubBlobUrl(
  repo: { owner: string; name: string },
  filePath: string,
  branch?: string,
): string {
  return `https://github.com/${repo.owner}/${repo.name}/blob/${branch || "main"}/${filePath}`;
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
      ? "GitHub 源码未成功获取，本次回答回退为 README、源码地图和会话上下文。"
      : "GitHub code could not be fetched, so this answer fell back to README, source map, and session context.";
  }

  if (message.retrievalMode === "github-code" && requestedCount > 0 && fetchedCount > 0 && fetchedCount < requestedCount) {
    return language === "zh"
      ? `仅成功获取 ${fetchedCount}/${requestedCount} 个 GitHub 文件。`
      : `Used ${fetchedCount}/${requestedCount} requested GitHub files.`;
  }

  return message.retrievalNote;
}
