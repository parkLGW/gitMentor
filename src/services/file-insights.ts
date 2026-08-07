export interface FileInsightImport {
  source: string;
  lineStart: number;
}

export type FileInsightSymbolKind =
  | "function"
  | "class"
  | "component"
  | "hook"
  | "type"
  | "interface"
  | "constant";

export interface FileInsightSymbol {
  name: string;
  kind: FileInsightSymbolKind;
  lineStart: number;
}

export interface FileLocalInsight {
  filePath: string;
  fileName: string;
  extension: string;
  languageLabel: string;
  totalLines: number;
  loc: number;
  imports: FileInsightImport[];
  symbols: FileInsightSymbol[];
  todos: number;
  quickQuestions: string[];
}

type InsightLanguage = "zh" | "en";

const LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  tsx: "TSX",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  rb: "Ruby",
  php: "PHP",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  sh: "Shell",
};

function basename(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function extension(filePath: string): string {
  const match = basename(filePath).match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() || "";
}

function languageLabel(filePath: string): string {
  const ext = extension(filePath);
  return LANGUAGE_LABELS[ext] || (ext ? ext.toUpperCase() : "File");
}

// A trailing newline terminates the last line rather than starting a new one.
// Counting it as a line reported one more than GitHub does for almost every file.
function splitSourceLines(fileContent: string): string[] {
  const lines = fileContent.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function countLoc(lines: string[]): number {
  return lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("*");
  }).length;
}

function pushUniqueImport(
  imports: FileInsightImport[],
  source: string,
  lineStart: number,
): void {
  const normalized = source.trim();
  if (!normalized || imports.some((item) => item.source === normalized)) return;
  imports.push({ source: normalized, lineStart });
}

function extractImports(lines: string[]): FileInsightImport[] {
  const imports: FileInsightImport[] = [];

  lines.forEach((line, index) => {
    const lineStart = index + 1;
    const trimmed = line.trim();

    const pythonFrom = trimmed.match(/^from\s+([A-Za-z0-9_.]+)\s+import\s+/);
    if (pythonFrom) {
      pushUniqueImport(imports, pythonFrom[1], lineStart);
      return;
    }

    const jsFrom = trimmed.match(/^import\s+.+?\s+from\s+["']([^"']+)["']/);
    if (jsFrom) {
      pushUniqueImport(imports, jsFrom[1], lineStart);
      return;
    }

    const jsSideEffect = trimmed.match(/^import\s*["']([^"']+)["']/);
    if (jsSideEffect) {
      pushUniqueImport(imports, jsSideEffect[1], lineStart);
      return;
    }

    const pythonImport = trimmed.match(/^import\s+(.+)/);
    if (pythonImport && !trimmed.startsWith("import(")) {
      pythonImport[1]
        .split(",")
        .map((item) => item.trim().split(/\s+as\s+/)[0])
        .forEach((source) => pushUniqueImport(imports, source, lineStart));
      return;
    }

    const requireMatch = trimmed.match(/require\(["']([^"']+)["']\)/);
    if (requireMatch) {
      pushUniqueImport(imports, requireMatch[1], lineStart);
    }
  });

  return imports.slice(0, 12);
}

function symbolKindForName(name: string, fallback: FileInsightSymbolKind): FileInsightSymbolKind {
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name) && (fallback === "function" || fallback === "constant")) {
    return "component";
  }
  return fallback;
}

function extractSymbols(lines: string[]): FileInsightSymbol[] {
  const symbols: FileInsightSymbol[] = [];

  lines.forEach((line, index) => {
    const lineStart = index + 1;
    const trimmed = line.trim();

    const pythonFunction = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (pythonFunction) {
      symbols.push({ name: pythonFunction[1], kind: "function", lineStart });
      return;
    }

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: "class", lineStart });
      return;
    }

    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (interfaceMatch) {
      symbols.push({ name: interfaceMatch[1], kind: "interface", lineStart });
      return;
    }

    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: "type", lineStart });
      return;
    }

    const functionMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (functionMatch) {
      symbols.push({
        name: functionMatch[1],
        kind: symbolKindForName(functionMatch[1], "function"),
        lineStart,
      });
      return;
    }

    const constFunction = trimmed.match(/^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*=>/);
    if (constFunction) {
      symbols.push({
        name: constFunction[1],
        kind: symbolKindForName(constFunction[1], "constant"),
        lineStart,
      });
    }
  });

  return symbols.slice(0, 16);
}

function moduleName(filePath: string): string {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length <= 1) return "root";
  const parent = segments[segments.length - 2];
  return parent === "src" && segments.length > 2 ? segments[segments.length - 3] : parent;
}

function buildQuickQuestions(
  filePath: string,
  imports: FileInsightImport[],
  lang: InsightLanguage,
): string[] {
  const moduleLabel = moduleName(filePath);
  if (lang === "zh") {
    return [
      "解释这个文件的实现原理",
      `这个文件在 ${moduleLabel} 模块中负责什么？`,
      imports.length > 0 ? "接下来应该看哪些依赖文件？" : "接下来应该看哪个相关文件？",
    ];
  }

  return [
    "Explain this file's implementation",
    `What role does this file play in the ${moduleLabel} module?`,
    imports.length > 0 ? "Which related files should I read next?" : "Which nearby file should I read next?",
  ];
}

export function buildFileLocalInsight(
  filePath: string,
  fileContent: string,
  lang: InsightLanguage = "en",
): FileLocalInsight {
  const lines = splitSourceLines(fileContent);
  const imports = extractImports(lines);
  return {
    filePath,
    fileName: basename(filePath),
    extension: extension(filePath),
    languageLabel: languageLabel(filePath),
    totalLines: lines.length,
    loc: countLoc(lines),
    imports,
    symbols: extractSymbols(lines),
    todos: lines.filter((line) => /TODO|FIXME|HACK|XXX/i.test(line)).length,
    quickQuestions: buildQuickQuestions(filePath, imports, lang),
  };
}
