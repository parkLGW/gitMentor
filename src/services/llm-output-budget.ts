// Output budget rules for reasoning models.
//
// A reasoning model bills its hidden thinking against the same max_tokens
// budget as the visible answer. A budget sized for the answer alone comes back
// as an empty message with finish_reason "length": every token went to
// reasoning the caller never sees. A blank completion is unusable whatever the
// finish reason, so the same one-shot retry with a larger budget applies.
//
// The constraint on how large that retry can be is the model's *output* limit,
// not its context window: current hosted models allow 64K-128K output tokens,
// but a small local model behind Ollama or LM Studio can reject anything past a
// few thousand. So the retry aims high and steps back down when the provider
// says no, remembering the ceiling for the rest of the session.

export const DEFAULT_OUTPUT_BUDGET = 2000;
const REASONING_MIN_BUDGET = 32000;
const REASONING_MAX_BUDGET = 64000;

export function isBlankCompletion(content: string | undefined | null): boolean {
  return !content || content.trim().length === 0;
}

// Returns null when the budget could not grow, so no identical call is wasted.
export function reasoningRetryBudget(requested: number): number | null {
  const expanded = Math.min(
    Math.max(requested * 4, REASONING_MIN_BUDGET),
    REASONING_MAX_BUDGET,
  );
  return expanded > requested ? expanded : null;
}

// Providers phrase this differently but all of them name the parameter.
export function isOutputBudgetRejection(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("max_tokens") || message.includes("max tokens");
}

// Steps back toward the budget the caller originally asked for, which the
// provider already accepts. Returns null once there is nothing left to give up.
export function reducedOutputBudget(attempted: number, floor: number): number | null {
  if (attempted <= floor) return null;
  return Math.max(Math.floor(attempted / 4), floor);
}

// Per-model state for this session: models that returned a blank completion
// (retrying every call from the small budget would waste one request per
// analysis) and the largest budget each model actually accepted.
const blankCompletionModels = new Set<string>();
const budgetCeilings = new Map<string, number>();

export function rememberBlankCompletion(modelKey: string): void {
  blankCompletionModels.add(modelKey);
}

export function rememberBudgetCeiling(modelKey: string, ceiling: number): void {
  const known = budgetCeilings.get(modelKey);
  if (known === undefined || ceiling < known) {
    budgetCeilings.set(modelKey, ceiling);
  }
}

export function startingOutputBudget(modelKey: string, configured: number): number {
  const wanted = blankCompletionModels.has(modelKey)
    ? Math.max(configured, reasoningRetryBudget(configured) ?? configured)
    : configured;

  const ceiling = budgetCeilings.get(modelKey);
  if (ceiling === undefined) return wanted;
  return Math.max(Math.min(wanted, ceiling), configured);
}

export function clearReasoningBudgetMemory(): void {
  blankCompletionModels.clear();
  budgetCeilings.clear();
}
