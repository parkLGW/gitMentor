export type DeepAnalysisResponseLanguage = "zh" | "en";

const DEEP_ANALYSIS_KEYS = [
  "role",
  "summary",
  "workflow",
  "components",
  "designNotes",
  "dependencies",
  "evidence",
  "suggestions",
  "confidence",
];

const NESTED_WRAPPER_KEYS = ["analysis", "data", "result", "fileAnalysis"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * parseLooseJson falls back to any balanced object it can find in the text, so a
 * reply cut off mid-array still "parses" — into an inner fragment such as a lone
 * component entry, which the normalizer would then pad out into an analysis that
 * looks empty rather than failed. Require the shape actually requested.
 */
export function looksLikeDeepAnalysis(parsed: unknown): boolean {
  if (!isRecord(parsed)) return false;

  const candidates = [parsed];
  for (const key of NESTED_WRAPPER_KEYS) {
    const nested = parsed[key];
    if (isRecord(nested)) candidates.push(nested);
  }

  return candidates.some((candidate) =>
    DEEP_ANALYSIS_KEYS.some((key) => candidate[key] !== undefined)
  );
}

export type UnparseableResponseKind =
  | "empty"
  | "prose"
  | "truncated"
  | "malformed";

export function classifyUnparseableResponse(
  response: string,
): UnparseableResponseKind {
  const trimmed = response.trim();
  if (!trimmed) return "empty";
  if (!trimmed.includes("{")) return "prose";
  // A finished answer ends on the closing brace (or fence). Anything else means
  // the output stopped mid-token, which is a length limit rather than bad JSON.
  if (!trimmed.endsWith("}") && !trimmed.endsWith("```")) return "truncated";
  return "malformed";
}

/**
 * Turns an unusable model reply into something the reader can act on. Every one
 * of these used to surface as the same opaque "Failed to parse AI response".
 */
export function describeUnparseableResponse(
  response: string,
  lang: DeepAnalysisResponseLanguage,
): string {
  const zh = lang === "zh";
  switch (classifyUnparseableResponse(response)) {
    case "empty":
      return zh
        ? "模型没有返回任何内容，请重试；如果反复出现，建议换一个模型。"
        : "The model returned no content at all. Try again, and switch models if it keeps happening.";
    case "prose":
      return zh
        ? "模型没有返回 JSON，可能是它拒绝了这个请求或输出了纯文本"
        : "The model returned prose instead of JSON. It may have declined the request.";
    case "truncated":
      // There is no max-output setting in the UI, so never tell the reader to
      // go change one
      return zh
        ? "模型输出被长度限制截断，精简重试后仍然不完整。这个文件可能过大，或该模型的输出上限太低，建议换一个模型。"
        : "The model output was cut off by the length limit, and the compact retry was still incomplete. The file may be too large, or this model's output limit too low — try another model.";
    default:
      return zh
        ? "无法解析模型返回的 JSON，请重试"
        : "Could not parse the JSON returned by the model. Try again.";
  }
}

/**
 * Shown when a reasoning model spent its entire output budget on the chain of
 * thought and emitted no answer, twice — including once with a much larger
 * budget. At that point the model choice is the only lever the reader has.
 */
export function describeReasoningOnlyResponse(
  lang: DeepAnalysisResponseLanguage,
): string {
  return lang === "zh"
    ? "模型只输出了思考过程，没有给出答案（即使放大输出预算后重试也一样）。请换成非推理模型，例如把 deepseek-reasoner 换成 deepseek-chat。"
    : "The model produced only its chain of thought and never emitted an answer, even after retrying with a much larger budget. Switch to a non-reasoning model — for example deepseek-chat instead of deepseek-reasoner.";
}

/**
 * Appended to the original prompt for one retry after a truncated reply. Mirrors
 * the compact-retry approach already used for quick-start analysis.
 */
export function compactRetryInstruction(
  lang: DeepAnalysisResponseLanguage,
): string {
  return lang === "zh"
    ? "\n\n上一次的回答被输出长度限制截断了。请返回一个更紧凑但完整的 JSON：workflow 最多 3 步，components 最多 4 项，designNotes 最多 2 项，dependencies 最多 5 项，evidence 最多 1 项，suggestions 最多 3 项，每个字段值都要简短。不要输出解释或 Markdown。"
    : "\n\nThe previous response was cut off by the output limit. Return a more compact but complete JSON object: at most 3 workflow steps, 4 components, 2 designNotes, 5 dependencies, 1 evidence entry, and 3 suggestions, keeping every field value short. Do not output explanations or Markdown.";
}
