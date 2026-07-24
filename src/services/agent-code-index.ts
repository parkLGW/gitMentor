import { parse } from "@babel/parser";

import type {
  AgentCodeDependency,
  AgentCodeExport,
  AgentCodeFileIndex,
  AgentCodeImport,
  AgentCodeIndex,
  AgentCodeSymbol,
  RetrievedFileContext,
} from "../types/agent.js";

type BabelNode = {
  type?: string;
  loc?: { start?: { line?: number }; end?: { line?: number } };
  [key: string]: any;
};

const SUPPORTED_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx"]);

function getLanguage(filePath: string): AgentCodeFileIndex["language"] | null {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return SUPPORTED_EXTENSIONS.has(ext)
    ? (ext as AgentCodeFileIndex["language"])
    : null;
}

function lineStart(node: BabelNode): number | undefined {
  return node.loc?.start?.line;
}

function lineEnd(node: BabelNode): number | undefined {
  return node.loc?.end?.line;
}

function classifySymbol(name: string, baseKind: AgentCodeSymbol["kind"]): AgentCodeSymbol["kind"] {
  if (/^use[A-Z0-9]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name) && (baseKind === "function" || baseKind === "class" || baseKind === "const")) {
    return "component";
  }
  return baseKind;
}

function importKind(specifier: BabelNode): AgentCodeImport["kind"] {
  if (specifier.type === "ImportDefaultSpecifier") return "default";
  if (specifier.type === "ImportNamespaceSpecifier") return "namespace";
  return "named";
}

function importedName(specifier: BabelNode): string {
  return String(specifier.local?.name || specifier.imported?.name || "").trim();
}

function extractImport(node: BabelNode): AgentCodeImport {
  const specifiers = Array.isArray(node.specifiers) ? node.specifiers as BabelNode[] : [];
  if (specifiers.length === 0) {
    return {
      source: String(node.source?.value || ""),
      imported: [],
      kind: "side-effect",
      lineStart: lineStart(node),
    };
  }

  const firstKind = importKind(specifiers[0]);
  return {
    source: String(node.source?.value || ""),
    imported: specifiers.map(importedName).filter(Boolean),
    kind: firstKind,
    lineStart: lineStart(node),
  };
}

function addSymbol(
  symbols: AgentCodeSymbol[],
  name: string,
  kind: AgentCodeSymbol["kind"],
  node: BabelNode,
): void {
  const value = name.trim();
  if (!value) return;
  symbols.push({
    name: value,
    kind: classifySymbol(value, kind),
    lineStart: lineStart(node),
    lineEnd: lineEnd(node),
  });
}

function addExport(
  exportsList: AgentCodeExport[],
  name: string,
  kind: AgentCodeExport["kind"],
  node: BabelNode,
): void {
  const value = name.trim();
  if (!value) return;
  exportsList.push({
    name: value,
    kind,
    lineStart: lineStart(node),
  });
}

function handleDeclaration(
  node: BabelNode,
  symbols: AgentCodeSymbol[],
  exportsList?: AgentCodeExport[],
): void {
  if (node.type === "FunctionDeclaration") {
    const name = String(node.id?.name || "");
    addSymbol(symbols, name, "function", node);
    if (exportsList) addExport(exportsList, name, "function", node);
    return;
  }

  if (node.type === "ClassDeclaration") {
    const name = String(node.id?.name || "");
    addSymbol(symbols, name, "class", node);
    if (exportsList) addExport(exportsList, name, "class", node);
    return;
  }

  if (node.type === "TSTypeAliasDeclaration") {
    const name = String(node.id?.name || "");
    addSymbol(symbols, name, "type", node);
    if (exportsList) addExport(exportsList, name, "type", node);
    return;
  }

  if (node.type === "TSInterfaceDeclaration") {
    const name = String(node.id?.name || "");
    addSymbol(symbols, name, "interface", node);
    if (exportsList) addExport(exportsList, name, "interface", node);
    return;
  }

  if (node.type === "VariableDeclaration") {
    const declarations = Array.isArray(node.declarations) ? node.declarations as BabelNode[] : [];
    declarations.forEach((declaration) => {
      const name = String(declaration.id?.name || "");
      addSymbol(symbols, name, "const", declaration);
      if (exportsList) addExport(exportsList, name, "const", declaration);
    });
  }
}

function createFailedIndex(
  filePath: string,
  language: AgentCodeFileIndex["language"],
  error: string,
): AgentCodeFileIndex {
  return {
    filePath,
    language,
    status: "failed",
    imports: [],
    exports: [],
    symbols: [],
    error,
  };
}

function stripPromptHeader(snippet: string): string {
  return snippet.replace(/^File:\s*[^\n]+\n/, "");
}

function indexFile(file: RetrievedFileContext): AgentCodeFileIndex {
  const language = getLanguage(file.filePath);
  if (!language) {
    return createFailedIndex(file.filePath, "ts", "unsupported_language");
  }

  if (file.status !== "fetched" || !file.snippet) {
    return createFailedIndex(file.filePath, language, file.reason || "content_unavailable");
  }

  try {
    const ast = parse(stripPromptHeader(file.snippet), {
      sourceType: "module",
      plugins: [
        "typescript",
        "jsx",
        "classProperties",
        "objectRestSpread",
        "optionalChaining",
        "nullishCoalescingOperator",
      ],
      errorRecovery: false,
    }) as BabelNode;
    const body = Array.isArray(ast.program?.body) ? ast.program.body as BabelNode[] : [];
    const imports: AgentCodeImport[] = [];
    const exportsList: AgentCodeExport[] = [];
    const symbols: AgentCodeSymbol[] = [];

    body.forEach((node) => {
      if (node.type === "ImportDeclaration") {
        imports.push(extractImport(node));
        return;
      }

      if (node.type === "ExportNamedDeclaration") {
        if (node.declaration) {
          handleDeclaration(node.declaration as BabelNode, symbols, exportsList);
        }
        const specifiers = Array.isArray(node.specifiers) ? node.specifiers as BabelNode[] : [];
        specifiers.forEach((specifier) => {
          addExport(exportsList, String(specifier.exported?.name || specifier.local?.name || ""), "unknown", specifier);
        });
        // Re-export from another module (`export { x } from './y'`) is a
        // dependency edge to follow when expanding imports.
        const reExportSource = String(node.source?.value || "");
        if (reExportSource) {
          imports.push({
            source: reExportSource,
            imported: specifiers.map((specifier) => String(specifier.exported?.name || "")).filter(Boolean),
            kind: "side-effect",
            lineStart: lineStart(node),
          });
        }
        return;
      }

      if (node.type === "ExportAllDeclaration") {
        // Barrel re-export (`export * from './y'`): follow the pointer.
        const reExportSource = String(node.source?.value || "");
        if (reExportSource) {
          imports.push({
            source: reExportSource,
            imported: [],
            kind: "side-effect",
            lineStart: lineStart(node),
          });
        }
        return;
      }

      if (node.type === "ExportDefaultDeclaration") {
        const declaration = node.declaration as BabelNode | undefined;
        const name = String(declaration?.id?.name || "default");
        addExport(exportsList, name, "unknown", node);
        if (declaration) handleDeclaration(declaration, symbols);
        return;
      }

      handleDeclaration(node, symbols);
    });

    return {
      filePath: file.filePath,
      language,
      status: "indexed",
      imports,
      exports: exportsList,
      symbols,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createFailedIndex(file.filePath, language, `parse_failed: ${message}`);
  }
}

export function buildCodeIndex(files: RetrievedFileContext[]): AgentCodeIndex {
  const indexedFiles = files.map(indexFile);
  const dependencies: AgentCodeDependency[] = indexedFiles.flatMap((file) =>
    file.imports.map((item) => ({
      from: file.filePath,
      source: item.source,
    })),
  );

  return {
    files: indexedFiles,
    dependencies,
  };
}
