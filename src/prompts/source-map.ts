// 源码地图 Prompt 生成器

import {
  ProjectContext,
  SourceMapMergeResult,
  SourceMapOutput,
  SourceMapQuality,
  SourceMapSource,
} from "./types";
import { normalizeConceptCard } from "@/services/learning-mission";

export const SOURCE_MAP_SCHEMA_VERSION = 4;

const ARCH_TYPES: ReadonlyArray<SourceMapOutput["architectureType"]> = [
  "mvc",
  "component-based",
  "layered",
  "microservices",
  "plugin-based",
  "event-driven",
  "monolithic",
  "other",
];

function sanitizeText(input: unknown): string {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*?\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePath(path: unknown): string {
  return String(path || "")
    .replace(/[`"'<>]/g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

function normalizePathList(input: unknown, limit = 6): string[] {
  if (!Array.isArray(input)) return [];
  const unique = Array.from(
    new Set(
      input
        .map((item) => normalizePath(item))
        .filter((item) => item.length > 0 && !item.includes("\n") && !item.startsWith("#")),
    ),
  );
  return unique.slice(0, limit);
}

function normalizeImportance(input: unknown): "high" | "medium" | "low" {
  const value = String(input || "").toLowerCase();
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function normalizeConceptImportance(
  input: unknown,
): "essential" | "important" | "helpful" {
  const value = String(input || "").toLowerCase();
  if (value === "essential" || value === "important" || value === "helpful") {
    return value;
  }
  return "important";
}

function normalizeArchitectureType(raw: unknown): SourceMapOutput["architectureType"] {
  const value = String(raw || "").toLowerCase() as SourceMapOutput["architectureType"];
  return ARCH_TYPES.includes(value) ? value : "other";
}

function normalizeMermaid(input: unknown): string {
  let mermaidDiagram = String(input || "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .trim();

  if (
    mermaidDiagram &&
    !mermaidDiagram.includes("flowchart") &&
    !mermaidDiagram.includes("graph") &&
    mermaidDiagram.includes("-->")
  ) {
    mermaidDiagram = `flowchart TB\n${mermaidDiagram}`;
  }
  return mermaidDiagram;
}

function computeCompletenessScore(map: SourceMapOutput): number {
  const modulesScore = Math.min(map.coreModules.length, 4) / 4 * 35;
  const pathScore = Math.min(map.learningPath.length, 4) / 4 * 25;
  const conceptScore = Math.min(map.keyConcepts.length, 4) / 4 * 20;
  const diagramScore = map.mermaidDiagram ? 10 : 0;
  const summaryScore = map.architectureSummary.length > 16 ? 10 : (map.architectureSummary ? 5 : 0);
  return Math.round(modulesScore + pathScore + conceptScore + diagramScore + summaryScore);
}

function classifySourceMapQuality(
  map: SourceMapOutput,
  source: SourceMapSource,
): SourceMapQuality {
  if (source === "fallback") return "fallback";
  const score = computeCompletenessScore(map);
  const isComplete =
    map.coreModules.length >= 2 &&
    map.learningPath.length >= 2 &&
    map.keyConcepts.length >= 3 &&
    Boolean(map.mermaidDiagram);
  return isComplete && score >= 68 ? "complete" : "partial";
}

function withSourceMeta(
  map: SourceMapOutput,
  source: SourceMapSource,
): SourceMapOutput {
  const completenessScore = computeCompletenessScore(map);
  const quality = classifySourceMapQuality(map, source);
  return {
    ...map,
    source,
    quality,
    completenessScore,
    updatedAt: Date.now(),
    schemaVersion: SOURCE_MAP_SCHEMA_VERSION,
  };
}

function ensureConceptCards(
  concepts: SourceMapOutput["keyConcepts"],
  modules: SourceMapOutput["coreModules"],
  architectureSummary: string,
  language: "zh" | "en",
): SourceMapOutput["keyConcepts"] {
  const normalizedExisting = concepts
    .map((concept) => normalizeConceptCard(concept, language))
    .filter((concept) => concept.term && concept.definition);

  if (normalizedExisting.length >= 3) {
    return normalizedExisting.slice(0, 6);
  }

  const isZh = language === "zh";
  const generated: SourceMapOutput["keyConcepts"] = [];
  for (const module of modules.slice(0, 4)) {
    generated.push(
      normalizeConceptCard(
        {
          term: isZh ? `${module.name} 模块` : `${module.name} Module`,
          definition:
            module.responsibility ||
            (isZh ? "负责系统中的关键职责。" : "Handles key responsibilities in the system."),
          relatedFiles: module.keyFiles || [],
          importance: generated.length === 0 ? "essential" : "important",
          beginnerExplanation: isZh
            ? `先理解 ${module.name}，你会更容易串起系统主流程。`
            : `Start with ${module.name} to understand the main system flow faster.`,
          whyItMatters: isZh
            ? `${module.name} 影响你读代码时的整体理解速度。`
            : `${module.name} directly affects your overall reading speed.`,
          whereToFind: module.keyFiles || [module.path],
        },
        language,
      ),
    );
  }

  if (architectureSummary) {
    generated.push(
      normalizeConceptCard(
        {
          term: isZh ? "整体架构" : "Overall Architecture",
          definition: architectureSummary,
          relatedFiles: modules.flatMap((item) => item.keyFiles).slice(0, 4),
          importance: "important",
          beginnerExplanation: isZh
            ? "先建立整体架构认知，再看细节代码会更顺。"
            : "Build architecture-level understanding before diving into details.",
          whyItMatters: isZh
            ? "它决定了你如何组织阅读顺序。"
            : "It defines the order in which you should read files.",
          whereToFind: ["README.md", ...modules.flatMap((item) => item.keyFiles).slice(0, 3)],
        },
        language,
      ),
    );
  }

  const merged = [...normalizedExisting, ...generated];
  const deduped = Array.from(new Map(merged.map((item) => [item.term, item])).values());
  while (deduped.length < 3) {
    const index = deduped.length + 1;
    deduped.push(
      normalizeConceptCard(
        {
          term: language === "zh" ? `关键概念 ${index}` : `Key Concept ${index}`,
          definition:
            language === "zh"
              ? "帮助你理解项目核心结构的概念。"
              : "A concept that helps you understand the project's core structure.",
          relatedFiles: ["README.md"],
          importance: "helpful",
          beginnerExplanation:
            language === "zh"
              ? "先结合 README 和入口文件建立基本认知。"
              : "Build a basic understanding from README and entry files first.",
          whyItMatters:
            language === "zh"
              ? "概念清晰后，阅读代码会更快。"
              : "Clear concepts make code reading faster.",
          whereToFind: ["README.md", "src/"],
        },
        language,
      ),
    );
  }
  return deduped.slice(0, 6);
}

export function createSourceMapPrompt(
  context: ProjectContext,
  language: "zh" | "en",
): string {
  const isZh = language === "zh";

  return `
${isZh ? "你是一个代码架构分析专家。请基于以下信息，分析项目架构并生成详细的源码学习地图。" : "You are a code architecture analysis expert. Based on the following information, analyze the project architecture and generate a detailed source code learning map."}

## ${isZh ? "项目信息" : "Project Information"}
- ${isZh ? "名称" : "Name"}: ${context.name}
- ${isZh ? "作者" : "Owner"}: ${context.owner}
- ${isZh ? "主语言" : "Main Language"}: ${context.language}
- ${isZh ? "项目类型" : "Project Type"}: ${context.projectType}

## ${isZh ? "完整目录结构" : "Full Directory Structure"}
${context.fullDirectoryTree}

## ${isZh ? "入口文件内容" : "Entry File Content"}
${context.entryFileContent || "Not available"}

## ${isZh ? "核心文件预览" : "Core Files Preview"}
${context.coreFilesPreview || "Not available"}

## ${isZh ? "主要依赖" : "Main Dependencies"}
${context.dependencies?.slice(0, 20).join(", ") || "Not available"}

## README ${isZh ? "摘要" : "Summary"}
${context.readmeSummary}

---

${isZh ? "请输出 JSON 格式的源码地图：" : "Please output a source code map in JSON format:"}

\`\`\`json
{
  "architectureType": "mvc | component-based | layered | microservices | plugin-based | event-driven | monolithic | other",
  "architectureSummary": "${isZh ? "一句话描述项目架构特点" : "One sentence describing the project architecture"}",
  "mermaidDiagram": "flowchart TB\\n  subgraph ${isZh ? "核心层" : "Core"}\\n    A[${isZh ? "入口" : "Entry"}] --> B[${isZh ? "核心模块" : "Core Module"}]\\n  end\\n  ...",
  "coreModules": [
    {
      "name": "${isZh ? "模块名称" : "Module name"}",
      "path": "src/xxx",
      "responsibility": "${isZh ? "模块职责描述" : "Module responsibility description"}",
      "importance": "high | medium | low",
      "keyFiles": ["file1.ts", "file2.ts"],
      "description": "${isZh ? "详细说明" : "Detailed description"}"
    }
  ],
  "dependencies": [
    {
      "from": "${isZh ? "模块A" : "Module A"}",
      "to": "${isZh ? "模块B" : "Module B"}",
      "type": "imports | uses | extends | implements | calls",
      "description": "${isZh ? "依赖关系说明" : "Dependency description"}"
    }
  ],
  "learningPath": [
    {
      "phase": 1,
      "title": "${isZh ? "阶段标题" : "Phase title"}",
      "goal": "${isZh ? "学习目标" : "Learning goal"}",
      "files": ["path/to/file.ts"],
      "estimatedMinutes": 20,
      "prerequisites": ["${isZh ? "前置知识" : "Prerequisites"}"]
    }
  ],
  "keyConcepts": [
    {
      "term": "${isZh ? "概念名称" : "Concept name"}",
      "definition": "${isZh ? "概念解释" : "Concept definition"}",
      "relatedFiles": ["path/to/file.ts"],
      "importance": "essential | important | helpful"
    }
  ]
}
\`\`\`

${isZh ? "要求" : "Requirements"}:
1. **mermaidDiagram** ${isZh ? "必须是有效的 Mermaid flowchart 语法，使用 TB（从上到下）布局" : "must be valid Mermaid flowchart syntax, using TB (top to bottom) layout"}
2. ${isZh ? "模块划分必须基于实际目录结构，不要编造不存在的目录" : "Module division must be based on actual directory structure, do not fabricate non-existent directories"}
3. ${isZh ? "学习路径应该从入口文件开始，由浅入深，每个阶段 3-5 个文件" : "Learning path should start from entry file, from shallow to deep, 3-5 files per phase"}
4. ${isZh ? "时间估算基于文件数量和复杂度：简单文件 5-10 分钟，复杂文件 15-30 分钟" : "Time estimation based on file count and complexity: simple files 5-10 min, complex files 15-30 min"}
5. ${isZh ? "关键概念应该包含项目特有的术语和设计模式" : "Key concepts should include project-specific terminology and design patterns"}
6. ${isZh ? "importance 评级：high=核心功能，medium=重要辅助，low=工具/配置" : "Importance rating: high=core functionality, medium=important support, low=tools/config"}
7. ${isZh ? "输出语言必须是中文" : "Output language must be English"}
8. ${isZh ? "只输出 JSON，不要有其他内容" : "Output only JSON, no other content"}
9. **IMPORTANT**: ${isZh ? "mermaidDiagram 中的代码示例不要包含真实的换行符，使用 \\n 代替" : "Do not include real newlines in code examples within mermaidDiagram, use \\n instead"}

${isZh ? "Mermaid 图表示例" : "Mermaid Diagram Example"}:
\`\`\`
flowchart TB
  subgraph Entry["${isZh ? "入口层" : "Entry Layer"}"]
    A[index.ts]
  end
  subgraph Core["${isZh ? "核心层" : "Core Layer"}"]
    B[services/]
    C[hooks/]
  end
  subgraph UI["${isZh ? "UI层" : "UI Layer"}"]
    D[components/]
  end
  A --> B
  A --> D
  B --> C
  D --> C
\`\`\`
`.trim();
}

// Safe JSON extraction from markdown code block
function extractJSONFromMarkdown(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

// Find JSON boundaries by counting braces
function findJSONBoundaries(
  text: string,
): { start: number; end: number } | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inString) {
      inString = true;
    } else if (char === '"' && inString) {
      inString = false;
    } else if (!inString) {
      if (char === "{") {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          return { start, end: i + 1 };
        }
      }
    }
  }

  return null;
}

// Parse AI response with robust error handling
export function parseSourceMapResponse(
  response: string,
  language: "zh" | "en" = "en",
): SourceMapOutput | null {
  try {
    console.log("[SourceMap] Parsing response, length:", response.length);

    // Try to extract from markdown code block first
    let jsonStr = extractJSONFromMarkdown(response);

    // If not found, try to find JSON boundaries
    if (!jsonStr) {
      const boundaries = findJSONBoundaries(response);
      if (boundaries) {
        jsonStr = response.slice(boundaries.start, boundaries.end);
      } else {
        jsonStr = response.trim();
      }
    }

    console.log("[SourceMap] Extracted JSON length:", jsonStr.length);

    // Pre-process: Fix mermaidDiagram field which often contains unescaped newlines
    // This regex finds the mermaidDiagram value and escapes newlines within it
    jsonStr = jsonStr.replace(
      /("mermaidDiagram"\s*:\s*")([^"]*(?:\\.[^"]*)*)/g,
      (_match, prefix, content) => {
        // Escape actual newlines (not already escaped \n)
        const fixed = content
          .replace(/(?<!\\)\n/g, "\\n")
          .replace(/(?<!\\)\r/g, "\\r")
          .replace(/(?<!\\)\t/g, "\\t");
        return prefix + fixed;
      },
    );

    // Attempt 1: Direct parse
    try {
      const parsed = JSON.parse(jsonStr);
      console.log("[SourceMap] Direct parse succeeded");
      return normalizeSourceMapOutput(parsed, language);
    } catch (e) {
      console.log("[SourceMap] Direct parse failed, trying fixes...");
    }

    // Attempt 2: Fix common JSON issues - escape all newlines in string values
    try {
      // More aggressive: escape all newlines that appear after a quote and before the next quote
      let fixed = jsonStr
        // Remove BOM
        .replace(/^\uFEFF/, "")
        // Remove trailing commas
        .replace(/,\s*([}\]])/g, "$1");

      // Process string by string - find all strings and escape newlines in them
      fixed = fixed.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
      });

      const parsed = JSON.parse(fixed);
      console.log("[SourceMap] Second attempt succeeded");
      return normalizeSourceMapOutput(parsed, language);
    } catch (e) {
      console.log(
        "[SourceMap] Second attempt failed, trying line-by-line fix...",
      );
    }

    // Attempt 3: Line-by-line processing
    try {
      // Split by lines, rejoin with escaped newlines inside strings
      const lines = jsonStr.split("\n");
      let inString = false;
      let result = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Count unescaped quotes to determine if we're in a string
        let quoteCount = 0;
        for (let j = 0; j < line.length; j++) {
          if (line[j] === '"' && (j === 0 || line[j - 1] !== "\\")) {
            quoteCount++;
          }
        }

        if (inString) {
          // We're continuing a string from previous line
          result += "\\n" + line;
        } else {
          result += (i > 0 ? "\n" : "") + line;
        }

        // Update inString state
        if (quoteCount % 2 === 1) {
          inString = !inString;
        }
      }

      // Also fix trailing commas
      result = result.replace(/,\s*([}\]])/g, "$1");

      const parsed = JSON.parse(result);
      console.log("[SourceMap] Line-by-line fix succeeded");
      return normalizeSourceMapOutput(parsed, language);
    } catch (e) {
      console.log("[SourceMap] Line-by-line fix failed, trying extraction...");
    }

    // Attempt 4: Try to extract partial valid data
    try {
      // Try to extract just the essential fields using regex
      const architectureType = jsonStr.match(
        /"architectureType"\s*:\s*"([^"]+)"/,
      );
      const architectureSummary = jsonStr.match(
        /"architectureSummary"\s*:\s*"([^"]+)"/,
      );
      const mermaidMatch = jsonStr.match(
        /"mermaidDiagram"\s*:\s*"((?:[^"\\]|\\.)*)/,
      );

      if (architectureType) {
        console.log("[SourceMap] Extracted partial data via regex");

        // Try to extract coreModules array
        const coreModulesMatch = jsonStr.match(
          /"coreModules"\s*:\s*\[([\s\S]*?)\](?=\s*,?\s*"(?:dependencies|learningPath|keyConcepts|$)|\s*})/,
        );
        let coreModules: any[] = [];
        if (coreModulesMatch) {
          try {
            // Clean up the modules string and parse
            const modulesStr =
              "[" + coreModulesMatch[1].replace(/\n/g, "\\n") + "]";
            coreModules = JSON.parse(modulesStr);
          } catch {
            // Try to extract individual module objects
            const moduleMatches = jsonStr.matchAll(
              /"name"\s*:\s*"([^"]+)"[\s\S]*?"path"\s*:\s*"([^"]+)"[\s\S]*?"responsibility"\s*:\s*"([^"]+)"[\s\S]*?"importance"\s*:\s*"([^"]+)"/g,
            );
            for (const m of moduleMatches) {
              coreModules.push({
                name: m[1],
                path: m[2],
                responsibility: m[3],
                importance: m[4],
                keyFiles: [],
              });
            }
          }
        }

        return normalizeSourceMapOutput(
          {
            architectureType: architectureType[1],
            architectureSummary: architectureSummary?.[1] || "",
            mermaidDiagram:
              mermaidMatch?.[1]?.replace(/\\n/g, "\n").replace(/\\"/g, '"') || "",
            coreModules,
            dependencies: [],
            learningPath: [],
            keyConcepts: [],
          },
          language,
        );
      }
    } catch (e) {
      console.error("[SourceMap] Regex extraction failed:", e);
    }

    console.error("[SourceMap] All JSON parse attempts failed");
    console.error(
      "[SourceMap] Raw response (first 1000 chars):",
      response.slice(0, 1000),
    );
    console.error(
      "[SourceMap] Extracted JSON (first 1000 chars):",
      jsonStr.slice(0, 1000),
    );
    return null;
  } catch (error) {
    console.error("[SourceMap] Failed to parse response:", error);
    return null;
  }
}

// Normalize the parsed output to ensure all required fields
function normalizeSourceMapOutput(
  parsed: any,
  language: "zh" | "en",
  source: SourceMapSource = "ai",
): SourceMapOutput | null {
  if (!parsed || typeof parsed !== "object") {
    console.warn("[SourceMap] Parsed data is not an object");
    return null;
  }

  if (!parsed.architectureType) {
    console.warn("[SourceMap] Missing architectureType");
    return null;
  }

  const coreModules: SourceMapOutput["coreModules"] = Array.isArray(parsed.coreModules)
    ? parsed.coreModules
        .map((module: any, index: number) => {
          const keyFiles = normalizePathList(module?.keyFiles, 6);
          const modulePath =
            normalizePath(module?.path) ||
            (keyFiles[0]?.split("/").slice(0, -1).join("/") || "src");
          if (!modulePath && !module?.name) return null;
          return {
            name:
              sanitizeText(module?.name) ||
              (language === "zh" ? `模块 ${index + 1}` : `Module ${index + 1}`),
            path: modulePath,
            responsibility:
              sanitizeText(module?.responsibility || module?.description) ||
              (language === "zh" ? "负责一个核心职责。" : "Owns a core responsibility."),
            importance: normalizeImportance(module?.importance),
            keyFiles,
            description: sanitizeText(module?.description || ""),
          };
        })
        .filter(Boolean) as SourceMapOutput["coreModules"]
    : [];

  const learningPath: SourceMapOutput["learningPath"] = Array.isArray(parsed.learningPath)
    ? parsed.learningPath
        .map((phase: any, index: number) => ({
          phase: typeof phase?.phase === "number" ? phase.phase : index + 1,
          title:
            sanitizeText(phase?.title) ||
            (language === "zh" ? `阶段 ${index + 1}` : `Phase ${index + 1}`),
          goal:
            sanitizeText(phase?.goal) ||
            (language === "zh" ? "完成当前阶段关键文件阅读。" : "Complete reading key files for this phase."),
          files: normalizePathList(phase?.files, 5),
          estimatedMinutes:
            typeof phase?.estimatedMinutes === "number"
              ? Math.max(10, Math.min(90, phase.estimatedMinutes))
              : 20,
          prerequisites: Array.isArray(phase?.prerequisites)
            ? phase.prerequisites.map((item: unknown) => sanitizeText(item)).filter(Boolean)
            : [],
        }))
        .filter((phase: { files: string[]; goal: string }) => phase.files.length > 0 || phase.goal.length > 0)
    : [];

  const dependencies: SourceMapOutput["dependencies"] = Array.isArray(parsed.dependencies)
    ? parsed.dependencies
        .map((dep: any) => {
          const from = sanitizeText(dep?.from);
          const to = sanitizeText(dep?.to);
          if (!from || !to) return null;
          return {
            from,
            to,
            type: ["imports", "uses", "extends", "implements", "calls"].includes(String(dep?.type))
              ? dep.type
              : "uses",
            description: sanitizeText(dep?.description || ""),
          };
        })
        .filter(Boolean) as SourceMapOutput["dependencies"]
    : [];

  const rawConcepts = Array.isArray(parsed.keyConcepts)
    ? parsed.keyConcepts
        .map((concept: any) => ({
          term: sanitizeText(concept?.term),
          definition: sanitizeText(concept?.definition),
          relatedFiles: normalizePathList(concept?.relatedFiles, 5),
          importance: normalizeConceptImportance(concept?.importance),
          beginnerExplanation: sanitizeText(concept?.beginnerExplanation || ""),
          whyItMatters: sanitizeText(concept?.whyItMatters || ""),
          whereToFind: normalizePathList(concept?.whereToFind, 5),
        }))
        .filter((concept: { term: string; definition: string }) => concept.term && concept.definition)
    : [];

  const architectureSummary = sanitizeText(parsed.architectureSummary || "");
  const map: SourceMapOutput = {
    architectureType: normalizeArchitectureType(parsed.architectureType),
    architectureSummary,
    mermaidDiagram: normalizeMermaid(parsed.mermaidDiagram),
    coreModules,
    dependencies,
    learningPath,
    keyConcepts: ensureConceptCards(rawConcepts, coreModules, architectureSummary, language),
  };

  return withSourceMeta(map, source);
}

export function mergeSourceMapWithFallback(
  aiMap: SourceMapOutput,
  fallbackMap: SourceMapOutput,
  language: "zh" | "en",
): SourceMapMergeResult {
  const mergedModules: SourceMapOutput["coreModules"] =
    aiMap.coreModules.length >= 2
      ? aiMap.coreModules
      : Array.from(
          new Map(
            [...aiMap.coreModules, ...fallbackMap.coreModules].map((item) => [
              `${item.path}-${item.name}`,
              item,
            ]),
          ).values(),
        ).slice(0, 8);

  const defaultFiles = Array.from(
    new Set(
      mergedModules
        .flatMap((module) => module.keyFiles || [])
        .filter(Boolean),
    ),
  ).slice(0, 5);

  const mergedLearningPath = Array.from(
    new Map(
      [...aiMap.learningPath, ...fallbackMap.learningPath].map((item) => [
        String(item.phase),
        item,
      ]),
    ).values(),
  )
    .slice(0, 6)
    .map((phase, index) => {
      const fallbackPhase = fallbackMap.learningPath.find((item) => item.phase === phase.phase)
        || fallbackMap.learningPath[index]
      const files = Array.from(
        new Set([
          ...(phase.files || []),
          ...(fallbackPhase?.files || []),
          ...defaultFiles,
        ]),
      )
        .filter(Boolean)
        .slice(0, 5)
      return {
        ...phase,
        files,
      }
    })
    .filter((phase) => phase.files.length > 0)

  const mergedConcepts = ensureConceptCards(
    [...aiMap.keyConcepts, ...fallbackMap.keyConcepts],
    mergedModules,
    aiMap.architectureSummary || fallbackMap.architectureSummary,
    language,
  );

  const mergedMap: SourceMapOutput = withSourceMeta(
    {
      architectureType: aiMap.architectureType || fallbackMap.architectureType,
      architectureSummary:
        aiMap.architectureSummary.length >= 12
          ? aiMap.architectureSummary
          : fallbackMap.architectureSummary,
      mermaidDiagram: aiMap.mermaidDiagram || fallbackMap.mermaidDiagram,
      coreModules: mergedModules,
      dependencies:
        aiMap.dependencies.length > 0 ? aiMap.dependencies : fallbackMap.dependencies,
      learningPath: mergedLearningPath.length > 0 ? mergedLearningPath : fallbackMap.learningPath,
      keyConcepts: mergedConcepts,
    },
    aiMap.coreModules.length >= 2 && aiMap.learningPath.length >= 2 ? "ai" : "ai-merged",
  );

  return {
    map: mergedMap,
    quality: mergedMap.quality || "partial",
    completenessScore: mergedMap.completenessScore || 0,
    shouldCacheLongTerm: mergedMap.quality === "complete",
    usedFallbackMerge: mergedMap.source === "ai-merged",
  };
}

// 生成 fallback 数据（当 AI 分析失败时使用）
export function createSourceMapFallback(
  context: ProjectContext,
  language: "zh" | "en",
): SourceMapOutput {
  const isZh = language === "zh";

  // 基于项目类型生成通用架构图
  const mermaidDiagram = generateFallbackDiagram(context.projectType, isZh);
  const coreModules = generateFallbackModules(context, isZh);
  const moduleFiles = Array.from(
    new Set(
      coreModules
        .flatMap((module) => module.keyFiles || [])
        .map((file) => normalizePath(file))
        .filter(Boolean),
    ),
  );
  const entryPatterns = /(\/|^)(main|index|app|lib|mod)\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|rb|php|c|cpp)$/i;
  const entryFiles = moduleFiles.filter((file) => entryPatterns.test(file)).slice(0, 3);
  const phase2Files = (entryFiles.length > 0 ? entryFiles : moduleFiles).slice(0, 3);
  const phase3Files = moduleFiles
    .filter((file) => !phase2Files.includes(file))
    .slice(0, 3);
  const learningPath: SourceMapOutput["learningPath"] = [
    {
      phase: 1,
      title: isZh ? "了解项目结构" : "Understand Project Structure",
      goal: isZh
        ? "熟悉项目的目录结构和主要文件"
        : "Familiarize with directory structure and main files",
      files: ["README.md", "package.json"],
      estimatedMinutes: 15,
      prerequisites: [],
    },
    {
      phase: 2,
      title: isZh ? "阅读入口文件" : "Read Entry Files",
      goal: isZh
        ? "理解项目的启动流程"
        : "Understand the project startup flow",
      files: phase2Files.length > 0 ? phase2Files : ["README.md"],
      estimatedMinutes: 30,
      prerequisites: [],
    },
    {
      phase: 3,
      title: isZh ? "深入核心逻辑" : "Dive into Core Logic",
      goal: isZh
        ? "理解核心业务逻辑和数据流"
        : "Understand core business logic and data flow",
      files: phase3Files.length > 0 ? phase3Files : (phase2Files.length > 0 ? phase2Files.slice(0, 2) : ["README.md"]),
      estimatedMinutes: 60,
      prerequisites: [],
    },
  ];

  const map: SourceMapOutput = {
    architectureType: detectArchitectureType(context.projectType),
    architectureSummary: isZh
      ? `${context.name} 项目采用 ${context.projectType} 架构`
      : `${context.name} project uses ${context.projectType} architecture`,
    mermaidDiagram,
    coreModules,
    dependencies: [],
    learningPath,
    keyConcepts: ensureConceptCards(
      [
        {
          term: isZh ? "入口点" : "Entry Point",
          definition: isZh ? "应用程序的启动文件" : "The application startup file",
          relatedFiles: ["src/index.ts"],
          importance: "essential",
          beginnerExplanation: isZh
            ? "先把入口点看明白，你就知道项目怎么启动。"
            : "Understand the entry point first to know how the project starts.",
          whyItMatters: isZh
            ? "入口点串起了后续模块，能帮你建立全局视角。"
            : "It connects later modules and gives you a global view.",
          whereToFind: ["src/index.ts", "src/main.ts", "src/app.ts"],
        },
      ],
      coreModules,
      isZh
        ? `${context.name} 项目采用 ${context.projectType} 架构`
        : `${context.name} project uses ${context.projectType} architecture`,
      language,
    ),
  };

  return withSourceMeta(map, "fallback");
}

function detectArchitectureType(
  projectType: string,
): SourceMapOutput["architectureType"] {
  switch (projectType) {
    case "react":
    case "vue":
    case "angular":
      return "component-based";
    case "express":
    case "node":
    case "django":
    case "flask":
      return "layered";
    case "nextjs":
      return "component-based";
    case "library":
    case "cli":
      return "monolithic";
    default:
      return "other";
  }
}

function generateFallbackDiagram(projectType: string, isZh: boolean): string {
  const entry = isZh ? "入口" : "Entry";
  const core = isZh ? "核心" : "Core";
  const ui = isZh ? "UI层" : "UI Layer";
  const services = isZh ? "服务层" : "Services";
  const utils = isZh ? "工具层" : "Utils";

  if (["react", "vue", "angular", "nextjs"].includes(projectType)) {
    return `flowchart TB
  subgraph Entry["${entry}"]
    A[App/Main]
  end
  subgraph UI["${ui}"]
    B[Components]
    C[Pages/Views]
  end
  subgraph Logic["${services}"]
    D[Hooks/Composables]
    E[Services/API]
  end
  subgraph Utils["${utils}"]
    F[Utils/Helpers]
  end
  A --> C
  C --> B
  C --> D
  D --> E
  E --> F`;
  }

  if (["express", "node", "django", "flask"].includes(projectType)) {
    return `flowchart TB
  subgraph Entry["${entry}"]
    A[Server/App]
  end
  subgraph Routes["Routes"]
    B[API Routes]
  end
  subgraph Controllers["Controllers"]
    C[Request Handlers]
  end
  subgraph Services["${services}"]
    D[Business Logic]
  end
  subgraph Data["Data"]
    E[Models/DB]
  end
  A --> B
  B --> C
  C --> D
  D --> E`;
  }

  // 通用架构
  return `flowchart TB
  subgraph Entry["${entry}"]
    A[Main Entry]
  end
  subgraph Core["${core}"]
    B[Core Logic]
  end
  subgraph Utils["${utils}"]
    C[Utilities]
  end
  A --> B
  B --> C`;
}

// 从完整目录树中提取文件路径
function extractFilesFromTree(fullTree: string, dirPath: string): string[] {
  const files: string[] = [];
  const lines = fullTree.split("\n");

  let inTargetDir = false;
  let targetIndent = -1;

  for (const line of lines) {
    // 计算缩进级别（每级 4 个字符）
    const indent = line.search(/[^\s│]/);
    const cleanLine = line.replace(/^[│├└\s─]+/, "").trim();

    // 检查是否进入目标目录
    if (
      cleanLine.includes(`📁 ${dirPath}`) ||
      cleanLine.includes(`📁 ${dirPath.replace("/", "")}`)
    ) {
      inTargetDir = true;
      targetIndent = indent;
      continue;
    }

    // 如果在目标目录中
    if (inTargetDir) {
      // 检查是否退出目标目录（回到更低的缩进级别）
      if (indent <= targetIndent && cleanLine.length > 0) {
        inTargetDir = false;
        continue;
      }

      // 提取文件（不是目录）
      if (cleanLine.includes("📄")) {
        const fileName = cleanLine.replace("📄", "").trim();
        if (fileName) {
          files.push(`${dirPath}/${fileName}`.replace(/\/+/g, "/"));
        }
      }
    }
  }

  // 如果没找到，尝试从 fullTree 中直接匹配
  if (files.length === 0) {
    const regex = new RegExp(
      `${dirPath}/[^/\\s]+\\.(ts|tsx|js|jsx|py|go|rs)`,
      "g",
    );
    const matches = fullTree.match(regex);
    if (matches) {
      files.push(...matches.slice(0, 5));
    }
  }

  return files.slice(0, 5); // 最多返回 5 个文件
}

// 从 coreFilesPreview 中提取特定目录的文件
function extractFilesFromPreview(
  preview: string | undefined,
  dirName: string,
): string[] {
  if (!preview) return [];

  const files: string[] = [];
  const lines = preview.split("\n");

  let inDir = false;
  for (const line of lines) {
    if (line.includes(`📁 ${dirName}/`)) {
      inDir = true;
      continue;
    }
    if (line.startsWith("📁") && inDir) {
      inDir = false;
      continue;
    }
    if (inDir && line.trim().startsWith("-")) {
      const fileName = line.replace(/^\s*-\s*/, "").trim();
      if (fileName) {
        files.push(`${dirName}/${fileName}`);
      }
    }
  }

  return files.slice(0, 5);
}

function generateFallbackModules(
  context: ProjectContext,
  isZh: boolean,
): SourceMapOutput["coreModules"] {
  const modules: SourceMapOutput["coreModules"] = [];
  // 使用完整目录树进行检测
  const fullTree = context.fullDirectoryTree || context.directoryTree || "";
  const preview = context.coreFilesPreview || "";

  console.log(
    "[SourceMap Fallback] Generating modules from tree:",
    fullTree.slice(0, 500),
  );

  // 定义要检测的目录及其描述
  const dirConfigs: Array<{
    names: string[];
    path: string;
    labelZh: string;
    labelEn: string;
    descZh: string;
    descEn: string;
    importance: "high" | "medium" | "low";
  }> = [
    {
      names: ["components"],
      path: "src/components",
      labelZh: "组件",
      labelEn: "Components",
      descZh: "UI 组件",
      descEn: "UI Components",
      importance: "high",
    },
    {
      names: ["services"],
      path: "src/services",
      labelZh: "服务",
      labelEn: "Services",
      descZh: "业务逻辑和 API 调用",
      descEn: "Business logic and API calls",
      importance: "high",
    },
    {
      names: ["hooks"],
      path: "src/hooks",
      labelZh: "Hooks",
      labelEn: "Hooks",
      descZh: "自定义 React Hooks",
      descEn: "Custom React Hooks",
      importance: "medium",
    },
    {
      names: ["utils", "lib", "helpers"],
      path: "src/utils",
      labelZh: "工具",
      labelEn: "Utils",
      descZh: "通用工具函数",
      descEn: "Utility functions",
      importance: "low",
    },
    {
      names: ["types"],
      path: "src/types",
      labelZh: "类型",
      labelEn: "Types",
      descZh: "TypeScript 类型定义",
      descEn: "TypeScript type definitions",
      importance: "medium",
    },
    {
      names: ["prompts"],
      path: "src/prompts",
      labelZh: "提示词",
      labelEn: "Prompts",
      descZh: "AI 提示词模板",
      descEn: "AI prompt templates",
      importance: "medium",
    },
    {
      names: ["pages", "views", "screens"],
      path: "src/pages",
      labelZh: "页面",
      labelEn: "Pages",
      descZh: "页面组件",
      descEn: "Page components",
      importance: "high",
    },
    {
      names: ["api", "routes"],
      path: "src/api",
      labelZh: "API",
      labelEn: "API",
      descZh: "API 路由和接口",
      descEn: "API routes and endpoints",
      importance: "high",
    },
    {
      names: ["store", "stores", "state"],
      path: "src/store",
      labelZh: "状态管理",
      labelEn: "State",
      descZh: "全局状态管理",
      descEn: "Global state management",
      importance: "medium",
    },
    {
      names: ["content", "content-script"],
      path: "src/content",
      labelZh: "内容脚本",
      labelEn: "Content Script",
      descZh: "浏览器扩展内容脚本",
      descEn: "Browser extension content scripts",
      importance: "high",
    },
    {
      names: ["background", "service-worker"],
      path: "src/background",
      labelZh: "后台服务",
      labelEn: "Background",
      descZh: "后台服务和 Service Worker",
      descEn: "Background services and service workers",
      importance: "high",
    },
    {
      names: ["popup"],
      path: "src/popup",
      labelZh: "弹出窗口",
      labelEn: "Popup",
      descZh: "扩展弹出窗口 UI",
      descEn: "Extension popup UI",
      importance: "high",
    },
  ];

  // 检测每个目录
  for (const config of dirConfigs) {
    const found = config.names.some(
      (name) =>
        fullTree.toLowerCase().includes(`📁 ${name}`) ||
        fullTree.toLowerCase().includes(`/${name}`) ||
        preview.toLowerCase().includes(`📁 ${name}/`),
    );

    if (found) {
      // 尝试从 preview 或 fullTree 中提取实际文件
      let keyFiles: string[] = [];

      for (const name of config.names) {
        keyFiles = extractFilesFromPreview(preview, name);
        if (keyFiles.length === 0) {
          keyFiles = extractFilesFromTree(fullTree, `src/${name}`);
        }
        if (keyFiles.length > 0) break;
      }

      // 如果还是没有文件，检查顶级目录
      if (keyFiles.length === 0) {
        for (const name of config.names) {
          keyFiles = extractFilesFromTree(fullTree, name);
          if (keyFiles.length > 0) {
            // 更新路径为实际找到的路径
            config.path = name;
            break;
          }
        }
      }

      modules.push({
        name: isZh ? config.labelZh : config.labelEn,
        path: config.path,
        responsibility: isZh ? config.descZh : config.descEn,
        importance: config.importance,
        keyFiles,
      });
    }
  }

  // 如果没有检测到任何模块，添加基本的 src 模块
  if (modules.length === 0 && fullTree.toLowerCase().includes("src")) {
    const srcFiles = extractFilesFromTree(fullTree, "src");
    modules.push({
      name: "src",
      path: "src/",
      responsibility: isZh ? "源代码目录" : "Source code directory",
      importance: "high",
      keyFiles: srcFiles,
    });
  }

  // 最终回退
  if (modules.length === 0) {
    modules.push({
      name: isZh ? "主模块" : "Main Module",
      path: "./",
      responsibility: isZh ? "项目主要代码" : "Main project code",
      importance: "high",
      keyFiles: [],
    });
  }

  console.log(
    "[SourceMap Fallback] Generated modules:",
    modules.map((m) => ({ name: m.name, files: m.keyFiles?.length })),
  );

  return modules;
}
