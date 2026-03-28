import type { SourceMapOutput } from "@/prompts/types";
import type { ConceptCard, LearningMission, MissionStep } from "@/types/learning";

function sanitizeMissionText(text: string): string {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*?\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/[#>*_~\-]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentencePreview(text: string, fallback: string): string {
  const cleaned = sanitizeMissionText(text);
  if (!cleaned) return fallback;
  const first = cleaned.split(/[.!?。！？]/).find(Boolean)?.trim();
  return first || fallback;
}

function normalizeFilePath(path: string): string {
  return String(path || "")
    .replace(/[`"'<>]/g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

function uniqueFiles(files: string[]): string[] {
  const unique = Array.from(
    new Set(
      files
        .map(normalizeFilePath)
        .filter((item) => item && !item.includes(" ") && !item.includes("\n")),
    ),
  );
  return unique.slice(0, 5);
}

function normalizeObjective(
  text: string | undefined,
  fallback: string,
  language: "zh" | "en",
): string {
  const cleaned = sanitizeMissionText(String(text || ""));
  const minLength = language === "zh" ? 6 : 12;
  if (!cleaned || cleaned.length < minLength || /<|>|img\s|href\s*=/.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

function phaseToMissionStep(
  phase: SourceMapOutput["learningPath"][number],
  index: number,
  language: "zh" | "en",
): MissionStep {
  const fallbackObjective =
    language === "zh"
      ? `完成第 ${phase.phase} 阶段并理解关键文件职责`
      : `Finish phase ${phase.phase} and understand the role of key files`;

  return {
    id: `phase-${phase.phase}-${index}`,
    title: phase.title || (language === "zh" ? `阶段 ${phase.phase}` : `Phase ${phase.phase}`),
    objective: normalizeObjective(phase.goal, fallbackObjective, language),
    requiredFiles: uniqueFiles(phase.files || []),
    completionCriteria:
      language === "zh"
        ? "能用自己的话解释该阶段文件如何协作。"
        : "You can explain how the files in this phase work together.",
    nextStepHint:
      language === "zh"
        ? "继续下一个阶段，优先打开标记为 high 的模块文件。"
        : "Move to the next phase and prioritize files from high-importance modules.",
    estimatedMinutes: Math.max(10, phase.estimatedMinutes || 20),
  };
}

function buildSummaryStep(
  sourceMap: SourceMapOutput,
  readmeSummary: string,
  language: "zh" | "en",
): MissionStep {
  const intro = sentencePreview(
    readmeSummary,
    language === "zh"
      ? "先快速理解项目目标和使用场景。"
      : "Start by understanding the project goals and use cases.",
  );

  return {
    id: "mission-intro",
    title: language === "zh" ? "了解项目目标" : "Understand Project Goal",
    objective: normalizeObjective(
      intro,
      language === "zh"
        ? "先快速理解项目目标和使用场景。"
        : "Start by understanding the project goals and use cases.",
      language,
    ),
    requiredFiles: uniqueFiles(["README.md", ...sourceMap.coreModules.flatMap((m) => m.keyFiles || [])]),
    completionCriteria:
      language === "zh"
        ? "你可以在 1 分钟内讲清这个项目解决什么问题。"
        : "You can explain in 1 minute what problem this project solves.",
    nextStepHint:
      language === "zh"
        ? "接下来阅读架构图与入口文件。"
        : "Next, read the architecture view and entry files.",
    estimatedMinutes: 10,
  };
}

function buildWrapUpStep(
  sourceMap: SourceMapOutput,
  language: "zh" | "en",
): MissionStep {
  const priorityFiles = sourceMap.coreModules
    .filter((m) => m.importance === "high")
    .flatMap((m) => m.keyFiles || []);

  return {
    id: "mission-wrap-up",
    title: language === "zh" ? "完成一次功能追踪" : "Complete One Feature Trace",
    objective:
      language === "zh"
        ? "从入口到核心模块追踪一条功能链路，形成自己的理解。"
        : "Trace one full feature path from entry to core modules.",
    requiredFiles: uniqueFiles(priorityFiles),
    completionCriteria:
      language === "zh"
        ? "写下该功能链路的 3 个关键步骤。"
        : "List 3 key steps in the feature flow.",
    nextStepHint:
      language === "zh"
        ? "你已经可以开始阅读 issue 或尝试小改动。"
        : "You are ready to read issues or make a small contribution.",
    estimatedMinutes: 20,
  };
}

export function createLearningMission(input: {
  repoKey: string;
  sourceMap: SourceMapOutput;
  readmeSummary: string;
  language: "zh" | "en";
}): LearningMission {
  const { repoKey, sourceMap, readmeSummary, language } = input;
  const steps: MissionStep[] = [];

  steps.push(buildSummaryStep(sourceMap, readmeSummary, language));

  sourceMap.learningPath.slice(0, 5).forEach((phase, index) => {
    steps.push(phaseToMissionStep(phase, index, language));
  });

  steps.push(buildWrapUpStep(sourceMap, language));

  const clipped = steps.slice(0, 7);
  while (clipped.length < 5) {
    const n = clipped.length + 1;
    clipped.push({
      id: `mission-auto-${n}`,
      title: language === "zh" ? `学习任务 ${n}` : `Mission Step ${n}`,
      objective: normalizeObjective(
        language === "zh"
          ? "阅读一个关键模块并记录你的理解。"
          : "Read one key module and note your understanding.",
        language === "zh"
          ? "阅读一个关键模块并记录你的理解。"
          : "Read one key module and note your understanding.",
        language,
      ),
      requiredFiles: uniqueFiles(sourceMap.coreModules.flatMap((m) => m.keyFiles || [])),
      completionCriteria:
        language === "zh"
          ? "能回答该模块在系统中的作用。"
          : "You can explain the module's role in the system.",
      nextStepHint:
        language === "zh"
          ? "继续查看下一个相关模块。"
          : "Continue with the next related module.",
      estimatedMinutes: 15,
    });
  }

  return {
    repoKey,
    generatedAt: Date.now(),
    steps: clipped,
  };
}

export function normalizeConceptCard(
  concept: SourceMapOutput["keyConcepts"][number],
  language: "zh" | "en",
): ConceptCard {
  const whereFiles = (concept.relatedFiles || []).slice(0, 4);

  return {
    term: concept.term,
    definition: concept.definition,
    relatedFiles: concept.relatedFiles || [],
    importance: concept.importance,
    beginnerExplanation:
      (concept as ConceptCard).beginnerExplanation ||
      (language === "zh"
        ? `用大白话：${concept.term} 是为了让你更快理解项目结构。`
        : `In plain words: ${concept.term} helps you understand the project structure faster.`),
    whyItMatters:
      (concept as ConceptCard).whyItMatters ||
      (language === "zh"
        ? `${concept.term} 影响你阅读代码时的理解速度与准确性。`
        : `${concept.term} directly affects your reading speed and accuracy.`),
    whereToFind:
      (concept as ConceptCard).whereToFind ||
      (whereFiles.length > 0
        ? whereFiles
        : language === "zh"
          ? ["README.md", "src/"]
          : ["README.md", "src/"]),
  };
}
