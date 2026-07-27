# Quick Start Truncation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop reporting token-limited quick-start responses as malformed JSON and recover once with a bounded compact retry.

**Architecture:** Carry provider completion reasons through `LLMResponse`, then keep recovery policy inside the quick-start analysis service. A truncated first response is never parsed or cached; it is retried once with a compact-output instruction, while a second truncation produces a specific user-facing error. Existing output limits remain bounded.

**Tech Stack:** TypeScript, React 18, Chrome Manifest V3, Node test runner with `tsx`.

---

### Task 1: Preserve provider completion reasons

**Files:**
- Modify: `src/types/llm.ts`
- Modify: `src/services/llm-base.ts`
- Test: `src/__tests__/llm-completion-reason.test.ts`

- [x] Write failing tests proving OpenAI-compatible `finish_reason` and Claude `stop_reason` are normalized to `finishReason`.
- [x] Run the focused test and confirm it fails because `finishReason` is absent.
- [x] Add the optional normalized field to `LLMResponse` and map both protocol responses.
- [x] Run the focused test and confirm it passes.

### Task 2: Recover truncated quick-start output once

**Files:**
- Modify: `src/services/ai-analysis.ts`
- Test: `src/__tests__/quick-start-recovery.test.ts`

- [x] Write failing tests for normal completion, first-response truncation followed by success, and repeated truncation.
- [x] Run the focused test and confirm the truncation cases fail for the expected missing behavior.
- [x] Add a compact retry prompt with strict item limits and a single retry.
- [x] Return a language-specific truncation error after the second truncated response.
- [x] Route quick-start JSON parsing through the shared loose parser and validate the required output shape.
- [x] Run the focused test and confirm it passes.

### Task 3: Correct the prompt and document behavior

**Files:**
- Modify: `src/services/ai-analysis.ts`
- Modify: `README.md`

- [x] Correct the invalid English JSON example.
- [x] Add explicit size constraints to both language prompts.
- [x] Document bounded retry and truncation behavior in troubleshooting.

### Task 4: Verify the complete change

- [x] Run focused quick-start and provider tests.
- [x] Run `pnpm type-check`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build`.
- [x] Inspect `git diff` and confirm unrelated untracked user files remain untouched.
