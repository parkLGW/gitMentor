import type {
  AnalysisEvidence,
  ConfidenceLevel,
  DeepAnalysisWorkflowStep,
  DeepFileAnalysisResult,
} from "../types/learning.js";
import { buildFileLocalInsight } from "./file-insights.js";

type Language = "zh" | "en";

interface NormalizeDeepFileAnalysisOptions {
  fileName: string;
  fileContent: string;
  language: Language;
}

interface SourceHighlight {
  lineStart: number;
  line: string;
  functionName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapAnalysis(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const nestedKeys = ["analysis", "data", "result", "fileAnalysis"];
  for (const key of nestedKeys) {
    if (isRecord(raw[key])) return raw[key] as Record<string, unknown>;
  }
  return raw;
}

function firstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return "";
}

function firstArray(value: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const raw = value[key];
    if (Array.isArray(raw)) return raw;
  }
  return [];
}

function firstValue(value: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (value[key] !== undefined) return value[key];
  }
  return undefined;
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  const value = String(raw || "").toLowerCase();
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function normalizeComponentType(raw: unknown): DeepFileAnalysisResult["components"][number]["type"] {
  const value = String(raw || "").toLowerCase();
  if (value === "function" || value === "class" || value === "interface" || value === "constant" || value === "module") {
    return value;
  }
  if (value === "type" || value === "component" || value === "hook" || value === "export") return "module";
  return "module";
}

function normalizeComponents(value: Record<string, unknown>): DeepFileAnalysisResult["components"] {
  const rawComponents = firstArray(value, [
    "components",
    "keyComponents",
    "functions",
    "classes",
    "exports",
    "组件",
    "关键组件",
    "函数",
    "类",
  ]);

  return rawComponents
    .map((item) => {
      if (typeof item === "string") {
        return {
          name: item.slice(0, 120),
          type: "module" as const,
          description: "",
        };
      }
      if (!isRecord(item)) return null;
      const name = firstString(item, ["name", "functionName", "className", "名称", "函数名", "类名"]);
      if (!name) return null;
      return {
        name: name.slice(0, 120),
        type: normalizeComponentType(firstString(item, ["type", "kind", "类型"])),
        description: firstString(item, ["description", "purpose", "explanation", "描述", "用途", "说明"]).slice(0, 300),
      };
    })
    .filter(Boolean)
    .slice(0, 10) as DeepFileAnalysisResult["components"];
}

function normalizeStringList(value: Record<string, unknown>, keys: string[], limit: number): string[] {
  return Array.from(
    new Set(
      firstArray(value, keys)
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function basename(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function stem(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, "");
}

function parentModule(filePath: string): string {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length <= 1) return "root";
  return segments[segments.length - 2] || "root";
}

function humanizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function localizedTopic(raw: string, lang: Language): string {
  const value = raw.toLowerCase();
  if (lang === "en") return humanizeIdentifier(raw);
  const topics: Record<string, string> = {
    path: "路径",
    paths: "路径",
    route: "路由",
    routes: "路由",
    memory: "记忆",
    memories: "记忆",
    config: "配置",
    settings: "配置",
    auth: "认证",
    session: "会话",
    storage: "存储",
    store: "存储",
    client: "客户端",
    api: "接口",
  };
  return topics[value] || humanizeIdentifier(raw);
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text);
}

function shouldPreferSourceRole(
  role: string,
  options: NormalizeDeepFileAnalysisOptions,
  sourceSymbols: string[],
): boolean {
  if (!role) return true;
  if (options.language === "zh" && !containsCjk(role) && /[A-Za-z]{4,}/.test(role)) return true;
  if (options.language === "zh" && containsCjk(role)) return false;
  if (sourceSymbols.length === 0) return false;

  const lowerRole = role.toLowerCase();
  const module = parentModule(options.fileName).toLowerCase();
  const fileStem = stem(options.fileName).toLowerCase();
  const mentionsModule = module !== "root" && lowerRole.includes(module);
  const mentionsFileTopic = lowerRole.includes(fileStem);
  const mentionsSymbol = sourceSymbols.some((symbol) => lowerRole.includes(symbol.toLowerCase()));

  return !mentionsModule && !mentionsFileTopic && !mentionsSymbol;
}

function buildSourceRole(
  options: NormalizeDeepFileAnalysisOptions,
  sourceSymbols: string[],
): string {
  const module = parentModule(options.fileName);
  const topic = localizedTopic(stem(options.fileName), options.language);
  const symbolText = sourceSymbols.slice(0, 3).join(options.language === "zh" ? "、" : ", ");

  if (options.language === "zh") {
    const symbolPart = symbolText ? `，核心入口是 ${symbolText}` : "";
    return `这个文件位于 ${module} 模块，负责${topic}相关逻辑${symbolPart}。`;
  }

  const symbolPart = symbolText ? `, mainly through ${symbolText}` : "";
  return `This file belongs to the ${module} module and centralizes ${topic} logic${symbolPart}.`;
}

function sourceComponents(
  options: NormalizeDeepFileAnalysisOptions,
): DeepFileAnalysisResult["components"] {
  const insight = buildFileLocalInsight(options.fileName, options.fileContent, options.language);
  return insight.symbols.map((symbol) => ({
    name: symbol.name,
    type: normalizeComponentType(symbol.kind),
    description: options.language === "zh"
      ? `${symbol.kind === "class" ? "类" : symbol.kind === "type" || symbol.kind === "interface" ? "类型定义" : "函数入口"}，负责 ${humanizeIdentifier(symbol.name)} 相关逻辑。`
      : `${symbol.kind} entry for ${humanizeIdentifier(symbol.name)} logic.`,
  })).slice(0, 8);
}

function sourceDependencies(options: NormalizeDeepFileAnalysisOptions): string[] {
  return buildFileLocalInsight(options.fileName, options.fileContent, options.language)
    .imports
    .map((item) => item.source)
    .slice(0, 12);
}

function collectSourceHighlights(options: NormalizeDeepFileAnalysisOptions): SourceHighlight[] {
  const lines = options.fileContent.split("\n");
  const highlights: SourceHighlight[] = [];
  let currentFunction = "";

  lines.forEach((line, index) => {
    const lineStart = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;

    const functionMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/) ||
      trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/) ||
      trimmed.match(/^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*=>/);
    if (functionMatch) {
      currentFunction = functionMatch[1];
      highlights.push({ lineStart, line: trimmed, functionName: currentFunction });
      return;
    }

    if (/^(?:return|yield)\b/.test(trimmed) || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed)) {
      highlights.push({
        lineStart,
        line: trimmed,
        functionName: currentFunction || undefined,
      });
    }
  });

  return highlights.slice(0, 8);
}

function titleForHighlight(highlight: SourceHighlight, lang: Language): string {
  const line = highlight.line;
  const functionMatch = line.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/) ||
    line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/) ||
    line.match(/^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (functionMatch) return functionMatch[1];

  const assignment = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (assignment) {
    const target = humanizeIdentifier(assignment[1]);
    return lang === "zh" ? `计算 ${target}` : `Compute ${target}`;
  }

  if (/MEMORY\.md/.test(line)) return lang === "zh" ? "定位 MEMORY.md" : "Locate MEMORY.md";
  if (/^return\b/.test(line)) return lang === "zh" ? "返回结果" : "Return result";
  return lang === "zh" ? "关键步骤" : "Key step";
}

function descriptionForHighlight(highlight: SourceHighlight, lang: Language): string {
  const code = highlight.line.slice(0, 180);
  if (lang === "zh") {
    if (/^(?:async\s+)?def\b|^(?:export\s+)?(?:async\s+)?function\b|^(?:export\s+)?const\b/.test(code)) {
      return `定义 ${highlight.functionName || "当前符号"}，作为这个文件的一个对外实现入口。`;
    }
    if (/^return\b/.test(code)) return `返回关键结果：${code}`;
    return `执行关键计算：${code}`;
  }

  if (/^(?:async\s+)?def\b|^(?:export\s+)?(?:async\s+)?function\b|^(?:export\s+)?const\b/.test(code)) {
    return `Defines ${highlight.functionName || "this symbol"} as one implementation entry in the file.`;
  }
  if (/^return\b/.test(code)) return `Returns the key result: ${code}`;
  return `Performs a key computation: ${code}`;
}

function sourceWorkflow(options: NormalizeDeepFileAnalysisOptions): DeepAnalysisWorkflowStep[] {
  return collectSourceHighlights(options).map((highlight, index) => ({
    step: index + 1,
    title: titleForHighlight(highlight, options.language),
    description: descriptionForHighlight(highlight, options.language),
    lineNumber: highlight.lineStart,
    functionName: highlight.functionName,
  })).slice(0, 6);
}

function sourceDesignNotes(options: NormalizeDeepFileAnalysisOptions): string[] {
  const lower = `${options.fileName}\n${options.fileContent}`.toLowerCase();
  if (options.language === "zh") {
    const notes = [
      `把${localizedTopic(stem(options.fileName), "zh")}逻辑集中在 ${basename(options.fileName)}，可以让同一模块复用稳定入口。`,
    ];
    if (lower.includes("sha1") || lower.includes("digest") || lower.includes("hash")) {
      notes.push("使用路径摘要作为标识，可以降低不同项目共享同一个存储位置的风险。");
    }
    if (lower.includes("memory.md")) {
      notes.push("固定 MEMORY.md 作为入口文件名，让上层代码只需要依赖一个稳定路径函数。");
    }
    return notes.slice(0, 4);
  }

  const notes = [
    `Keeping ${localizedTopic(stem(options.fileName), "en")} logic in ${basename(options.fileName)} gives the module a stable reuse point.`,
  ];
  if (lower.includes("sha1") || lower.includes("digest" ) || lower.includes("hash")) {
    notes.push("Using a path digest reduces the chance that different projects share the same storage location.");
  }
  if (lower.includes("memory.md")) {
    notes.push("A fixed MEMORY.md entrypoint lets callers depend on one stable path helper.");
  }
  return notes.slice(0, 4);
}

function normalizeWorkflow(value: Record<string, unknown>): DeepAnalysisWorkflowStep[] {
  const rawSteps = firstArray(value, ["workflow", "codeFlow", "flow", "steps", "工作流程", "流程", "步骤"]);
  return rawSteps
    .map((item, index) => {
      if (typeof item === "string") {
        const description = item.trim();
        return description
          ? { step: index + 1, description }
          : null;
      }
      if (!isRecord(item)) return null;
      const description = firstString(item, ["description", "summary", "explanation", "描述", "说明"]);
      if (!description) return null;
      const stepRaw = firstValue(item, ["step", "index", "序号"]);
      const lineRaw = firstValue(item, ["lineNumber", "lineStart", "line", "行号"]);
      const step: DeepAnalysisWorkflowStep = {
        step: typeof stepRaw === "number" ? stepRaw : index + 1,
        description: description.slice(0, 260),
      };
      const title = firstString(item, ["title", "name", "标题", "名称"]);
      const functionName = firstString(item, ["functionName", "function", "函数", "函数名"]);
      if (title) step.title = title;
      if (typeof lineRaw === "number") step.lineNumber = lineRaw;
      if (functionName) step.functionName = functionName;
      return step;
    })
    .filter(Boolean)
    .slice(0, 6) as DeepAnalysisWorkflowStep[];
}

function normalizeDesignNotes(value: Record<string, unknown>): string[] {
  const notes = normalizeStringList(value, ["designNotes", "designIntent", "rationale", "why", "设计意图", "设计说明", "原因"], 4);
  if (notes.length > 0) return notes;

  const takeaway = firstString(value, ["keyTakeaway", "takeaway", "关键洞察", "学习要点"]);
  if (takeaway) return [takeaway.slice(0, 260)];

  const conceptNotes = firstArray(value, ["coreConcepts", "concepts", "核心概念"])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!isRecord(item)) return "";
      const concept = firstString(item, ["concept", "name", "概念", "名称"]);
      const explanation = firstString(item, ["explanation", "description", "说明", "解释"]);
      return [concept, explanation].filter(Boolean).join(": ");
    })
    .filter(Boolean);

  return Array.from(new Set(conceptNotes)).slice(0, 4);
}

function normalizeEvidence(input: unknown): AnalysisEvidence[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!isRecord(item)) return null;
      const snippet = firstString(item, ["snippet", "code", "片段", "代码"]).slice(0, 260);
      const reason = firstString(item, ["reason", "explanation", "理由", "说明"]).slice(0, 220);
      if (!snippet || !reason) return null;
      const line = item.lineStart ?? item.lineNumber ?? item.line ?? item["行号"];
      return {
        filePath: firstString(item, ["filePath", "file", "文件"]) || undefined,
        lineStart: typeof line === "number" ? line : undefined,
        snippet,
        reason,
      };
    })
    .filter(Boolean)
    .slice(0, 3) as AnalysisEvidence[];
}

function fallbackEvidence(options: NormalizeDeepFileAnalysisOptions): AnalysisEvidence[] {
  const lines = options.fileContent
    .split("\n")
    .map((line, index) => ({ line, lineStart: index + 1 }));
  const selected =
    lines.find(({ line }) =>
      /\b(async\s+def|def|class|function|const|let|var|export|interface|type|return)\b/.test(line)
    ) ||
    lines.find(({ line }) =>
      /\b(import|from)\b/.test(line)
    ) ||
    lines.find(({ line }) => line.trim().length > 0);

  if (!selected) return [];

  const trimmed = selected.line.replace(/\s+/g, " ").trim();
  const reason = (() => {
    if (/^(?:async\s+)?def\b|^(?:export\s+)?(?:async\s+)?function\b|^(?:export\s+)?const\b/.test(trimmed)) {
      return options.language === "zh"
        ? "这是当前文件的关键函数定义，支撑对核心入口的判断。"
        : "This is a key function definition that supports the file-entrypoint explanation.";
    }
    if (/^return\b/.test(trimmed)) {
      return options.language === "zh"
        ? "这是函数返回结果的实现行，支撑对工作流程的判断。"
        : "This return line supports the workflow explanation.";
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed)) {
      return options.language === "zh"
        ? "这是关键赋值或计算逻辑，支撑对实现步骤的判断。"
        : "This assignment or computation supports the implementation-step explanation.";
    }
    return options.language === "zh"
      ? "这是从当前文件提取的源码证据，用于支撑文件分析。"
      : "Fetched source line used as fallback evidence for the file analysis.";
  })();

  return [
    {
      filePath: options.fileName,
      lineStart: selected.lineStart,
      snippet: trimmed.slice(0, 260),
      reason,
    },
  ];
}

function fallbackSummary(
  value: Record<string, unknown>,
  options: NormalizeDeepFileAnalysisOptions,
  components: DeepFileAnalysisResult["components"],
): string {
  const concepts = normalizeStringList(value, ["coreConcepts", "concepts", "核心概念"], 2);
  if (components.length > 0) {
    const names = components.slice(0, 3).map((item) => item.name).join(", ");
    return options.language === "zh"
      ? `这个文件主要定义了 ${names} 等关键实现。`
      : `This file mainly defines ${names}.`;
  }
  if (concepts.length > 0) {
    return options.language === "zh"
      ? `这个文件围绕 ${concepts.join("、")} 展开。`
      : `This file is centered on ${concepts.join(", ")}.`;
  }
  return options.language === "zh"
    ? `这个文件是 ${options.fileName}，当前 AI 返回未提供稳定摘要。`
    : `This file is ${options.fileName}; the AI response did not provide a stable summary.`;
}

export function normalizeDeepFileAnalysisResult(
  raw: unknown,
  options: NormalizeDeepFileAnalysisOptions,
): DeepFileAnalysisResult {
  const value = unwrapAnalysis(raw);
  const normalizedComponents = normalizeComponents(value);
  const localComponents = sourceComponents(options);
  const components = normalizedComponents.length > 0 ? normalizedComponents : localComponents;
  const sourceSymbols = localComponents.map((component) => component.name);
  const rawSummary = firstString(value, [
    "role",
    "summary",
    "fileOverview",
    "overview",
    "purpose",
    "description",
    "摘要",
    "职责",
    "文件概览",
    "概述",
    "用途",
    "描述",
  ]);
  const evidence = normalizeEvidence(value.evidence ?? value["证据"]);
  const rawRole = firstString(value, ["role", "responsibility", "职责", "定位"]) || rawSummary;
  const localRole = buildSourceRole(options, sourceSymbols);
  const preferSourceRole = shouldPreferSourceRole(rawRole, options, sourceSymbols);
  const role = preferSourceRole
    ? localRole
    : rawRole || localRole || fallbackSummary(value, options, components);
  const summary = preferSourceRole
    ? role
    : rawSummary || fallbackSummary(value, options, components);
  const workflow = normalizeWorkflow(value);
  const designNotes = normalizeDesignNotes(value);
  const dependencies = normalizeStringList(value, ["dependencies", "imports", "依赖", "导入"], 12);

  return {
    summary: (summary || fallbackSummary(value, options, components)).slice(0, 800),
    role: role.slice(0, 500),
    workflow: workflow.length > 0 ? workflow : sourceWorkflow(options),
    designNotes: designNotes.length > 0 ? designNotes : sourceDesignNotes(options),
    components,
    dependencies: dependencies.length > 0 ? dependencies : sourceDependencies(options),
    suggestions: normalizeStringList(value, ["suggestions", "suggestedNextSteps", "nextSteps", "建议", "下一步"], 6),
    evidence: evidence.length > 0 ? evidence : fallbackEvidence(options),
    confidence: normalizeConfidence(value.confidence ?? value["置信度"]),
  };
}
