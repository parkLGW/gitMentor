import type { AgentProgressEvent } from "../types/agent.js";

export function buildAgentProgressText(
  progress: AgentProgressEvent,
  language: "zh" | "en",
): string {
  if (progress.stage === "locating-files") {
    return language === "zh"
      ? "正在定位相关文件"
      : "Locating relevant files";
  }

  if (progress.stage === "reading-files") {
    const hasCounts = typeof progress.total === "number" && progress.total > 0;
    if (language === "zh") {
      return hasCounts
        ? `正在读取相关文件（${progress.completed || 0}/${progress.total}）`
        : "正在读取相关文件";
    }
    return hasCounts
      ? `Reading relevant files (${progress.completed || 0}/${progress.total})`
      : "Reading relevant files";
  }

  return language === "zh" ? "正在整理答案" : "Preparing the answer";
}
