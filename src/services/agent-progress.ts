import type { AgentProgressEvent } from "../types/agent.js";

export function buildAgentProgressText(
  progress: AgentProgressEvent,
  language: "zh" | "en",
): string {
  const withNote = (text: string): string => {
    const note = String(progress.note || "").trim();
    if (!note) return text;
    return language === "zh" ? `${text}：${note}` : `${text}: ${note}`;
  };

  if (progress.stage === "understanding-intent") {
    return withNote(language === "zh"
      ? "正在理解问题意图"
      : "Understanding the question");
  }

  if (progress.stage === "searching-files") {
    return withNote(language === "zh"
      ? "正在搜索仓库上下文"
      : "Searching repository context");
  }

  if (progress.stage === "locating-files") {
    return withNote(language === "zh"
      ? "正在定位相关文件"
      : "Locating relevant files");
  }

  if (progress.stage === "reading-files") {
    const hasCounts = typeof progress.total === "number" && progress.total > 0;
    if (language === "zh") {
      return withNote(hasCounts
        ? `正在读取相关文件（${progress.completed || 0}/${progress.total}）`
        : "正在读取相关文件");
    }
    return withNote(hasCounts
      ? `Reading relevant files (${progress.completed || 0}/${progress.total})`
      : "Reading relevant files");
  }

  if (progress.stage === "indexing-code") {
    return withNote(language === "zh"
      ? "正在建立代码索引"
      : "Indexing code context");
  }

  return withNote(language === "zh" ? "正在整理答案" : "Preparing the answer");
}
