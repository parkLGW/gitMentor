import { normalizeGithubFilePath } from "./agent-code-context.js";

export interface GithubBlobPath {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export interface GithubRepoRef {
  owner: string;
  name: string;
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodePath(path: string): string {
  return normalizeGithubFilePath(path)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildGithubBlobUrl(
  repo: GithubRepoRef,
  filePath: string,
  branch?: string,
  lineStart?: number,
): string {
  const encodedBranch = encodeURIComponent((branch || "main").trim() || "main");
  const encodedPath = encodePath(filePath);
  const lineHash = lineStart && lineStart > 0 ? `#L${lineStart}` : "";

  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob/${encodedBranch}/${encodedPath}${lineHash}`;
}

export function parseGithubBlobPath(
  pathname: string,
  branchHints: string[] = [],
): GithubBlobPath | null {
  const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 5 || parts[2] !== "blob") {
    return null;
  }

  const owner = decodePathSegment(parts[0]);
  const repo = decodePathSegment(parts[1]);
  const rest = parts.slice(3);
  const decodedRest = rest.map(decodePathSegment).join("/");

  const sortedHints = Array.from(
    new Set(branchHints.map((hint) => hint.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean)),
  ).sort((a, b) => b.length - a.length);

  for (const branch of sortedHints) {
    if (decodedRest === branch || decodedRest.startsWith(`${branch}/`)) {
      const path = decodedRest.slice(branch.length).replace(/^\/+/, "");
      if (!path) return null;
      return { owner, repo, branch, path };
    }
  }

  const branch = decodePathSegment(rest[0]);
  const path = rest.slice(1).map(decodePathSegment).join("/");
  if (!branch || !path) {
    return null;
  }

  return { owner, repo, branch, path };
}
