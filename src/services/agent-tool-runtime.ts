import { normalizeCandidatePath } from "./agent-code-context.js";

import type { AgentCodeImport } from "../types/agent.js";

export interface ExpandImportsInput {
  fromFile: string;
  imports: Array<Pick<AgentCodeImport, "source">>;
  repoPaths: string[];
}

const PATH_HINT_PATTERN =
  /(?:^|[\s`"'([{<])((?:\.\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|vue|svelte|py|go|java|rs|rb|php|cs|swift|kt|scala))/g;

export function extractRepoPathHintsFromText(...texts: Array<string | undefined | null>): string[] {
  const paths: string[] = [];

  texts.forEach((text) => {
    if (!text) return;
    for (const match of text.matchAll(PATH_HINT_PATTERN)) {
      const normalized = normalizeCandidatePath(match[1]);
      if (normalized && !paths.includes(normalized)) {
        paths.push(normalized);
      }
    }
  });

  return paths;
}

function dirname(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/");
}

function normalizePath(path: string): string {
  const output: string[] = [];
  path.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      output.pop();
      return;
    }
    output.push(part);
  });
  return output.join("/");
}

function resolveImportBase(fromFile: string, source: string): string | null {
  if (source.startsWith("@/")) return normalizeCandidatePath(`src/${source.slice(2)}`);
  if (source.startsWith("./") || source.startsWith("../")) {
    return normalizeCandidatePath(normalizePath(`${dirname(fromFile)}/${source}`));
  }
  return null;
}

function candidatePaths(base: string): string[] {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
}

/**
 * Resolve a file's imports/re-exports (relative or `@/`-aliased) to concrete
 * repo-relative paths that exist in the repository. Used for deterministic
 * one-hop expansion behind barrel/index files.
 */
export function expandImports(input: ExpandImportsInput): string[] {
  const repoPathSet = new Set(input.repoPaths.map(normalizeCandidatePath).filter(Boolean));
  const resolved: string[] = [];

  input.imports.forEach((item) => {
    const base = resolveImportBase(input.fromFile, item.source);
    if (!base) return;
    const found = candidatePaths(base).find((path) => repoPathSet.has(path));
    if (found && !resolved.includes(found)) {
      resolved.push(found);
    }
  });

  return resolved;
}
