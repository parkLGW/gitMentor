function cleanupJson(input: string): string {
  return input
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");
}

function fixStringNewlines(input: string): string {
  return input.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) =>
    match
      .replace(/\r\n/g, "\\n")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\n")
      .replace(/\t/g, "\\t"),
  );
}

function tryParse(input: string): unknown | null {
  const cleaned = cleanupJson(input);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with newline cleanup.
  }

  try {
    return JSON.parse(fixStringNewlines(cleaned));
  } catch {
    return null;
  }
}

function isPopulatedObject(value: unknown): boolean {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0;
}

function selectBestParsedCandidate(candidates: string[]): unknown | null {
  let firstParsed: unknown | null = null;

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed === null) continue;
    firstParsed ??= parsed;
    if (isPopulatedObject(parsed)) return parsed;
  }

  return firstParsed;
}

function fencedJsonCandidates(text: string): string[] {
  return Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((match) => match[1]);
}

function objectCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

export function parseLooseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = tryParse(trimmed);
  if (direct !== null) return direct;

  const fenced = selectBestParsedCandidate(fencedJsonCandidates(trimmed));
  if (fenced !== null) return fenced;

  const object = selectBestParsedCandidate(objectCandidates(trimmed));
  if (object !== null) return object;

  return null;
}
