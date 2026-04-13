# Agent On-Demand Code Context Design

Date: 2026-04-13
Project: GitMentor
Status: Draft approved in chat, pending user review of written spec

## Goal

Upgrade the conversation assistant so it can answer repository questions with code-level grounding instead of relying only on README summary, source map summary, and session summary.

When the current lightweight context is not enough, the assistant should:

1. decide whether code retrieval is needed
2. choose the most relevant files
3. fetch source code from GitHub in the background
4. analyze that code
5. return a final answer with the analyzed files attached as evidence

The user experience should remain simple: ask one question, receive one final answer.

## Non-Goals

- No full repository indexing in this iteration
- No embedding/vector search pipeline
- No background crawling of the whole repository before every question
- No arbitrary branch selector in the UI
- No inline code browser inside the chat message

## Current Problem

The current assistant in [AgentTab.tsx](D:/projects/products/gitMentor/src/components/AgentTab.tsx) streams a response using:

- README summary
- source map summary
- session summary
- recent messages

This works for orientation questions, but fails on implementation-detail questions because the model often does not have the concrete code needed to answer accurately.

The current behavior encourages guesses such as "likely in X file" rather than grounded answers based on real file content.

## User Experience

The upgraded assistant should behave like this:

1. user asks a question
2. assistant silently decides whether repository code is required
3. if code is needed, assistant fetches a small set of relevant files from GitHub
4. assistant answers directly
5. assistant shows which files were analyzed

Expected UX properties:

- no extra user step is required to trigger code retrieval
- answers remain concise and beginner-friendly
- the final message includes "analyzed files" as clickable evidence
- if code retrieval fails, the assistant still answers using existing summary context and explicitly lowers confidence

## High-Level Architecture

Introduce a two-stage answering pipeline for `chatWithAgent` in [service-worker.ts](D:/projects/products/gitMentor/src/background/service-worker.ts).

### Stage 1: Retrieval Planning

Input:

- repo owner/name
- README summary
- source map summary
- session summary
- recent messages
- user question

Output:

```ts
interface AgentRetrievalPlan {
  needsCodeContext: boolean
  targetFiles: string[]
  reason: string
  confidence: 'low' | 'medium' | 'high'
}
```

Responsibilities:

- determine whether the question can be answered from summaries alone
- choose up to 5 candidate files when code is needed
- prefer precise file paths over vague module names

### Stage 2: Code Retrieval and Grounded Answering

If `needsCodeContext` is `true`, fetch repository files from GitHub raw endpoints and build a grounded answer prompt using:

- user question
- repository summaries
- selected file paths
- truncated file contents
- session summary

The assistant then returns a final answer plus structured evidence for the files it actually analyzed.

If `needsCodeContext` is `false`, reuse the current lightweight answering path.

## GitHub File Retrieval

Create a dedicated service, for example:

- [repo-code-context.ts](D:/projects/products/gitMentor/src/services/repo-code-context.ts)

Responsibilities:

- normalize and validate candidate file paths
- resolve repository default branch
- fetch raw file content from GitHub
- apply file filtering and truncation rules
- return structured retrieval results for prompting and UI display

### Branch Resolution

Preferred order:

1. repository default branch if already known in local context
2. remote default branch if it can be resolved cheaply
3. fallback to `main`
4. fallback to `master`

This prevents the assistant from hardcoding the wrong branch when constructing raw URLs.

### Retrieval Limits

To keep latency and token use bounded:

- target 3 files by default
- hard cap at 5 files
- skip obviously irrelevant/generated files where possible
- enforce per-file content budget
- enforce total content budget across all retrieved files

Suggested priorities:

- application entry files
- files named in source map modules
- files explicitly mentioned in recent conversation
- files selected by the retrieval planner

Suggested de-priorities:

- lockfiles
- minified bundles
- generated assets
- very large JSON snapshots
- vendor directories

## Prompting Strategy

### Retrieval Planning Prompt

Purpose:

- classification plus file selection only

Rules:

- do not answer the user question yet
- output structured JSON only
- cap `targetFiles` at 5
- choose concrete repo-relative paths when possible
- return `needsCodeContext = false` when summaries are enough

### Final Answer Prompt

Purpose:

- answer the actual user question with grounded code context

Rules:

- answer directly in 2-6 sentences by default
- use beginner-friendly language
- cite evidence files structurally, not as path spam in the answer body
- explicitly mention uncertainty if retrieval failed or the code is still insufficient

## Data Model Changes

Extend chat message metadata in [agent.ts](D:/projects/products/gitMentor/src/types/agent.ts) so the assistant can persist and render retrieval results.

Suggested additions:

```ts
interface RetrievedFileContext {
  filePath: string
  branch?: string
  status: 'fetched' | 'failed' | 'skipped'
  snippet?: string
  reason?: string
}

interface AgentMessage {
  // existing fields
  retrievedFiles?: RetrievedFileContext[]
  retrievalMode?: 'summary-only' | 'github-code'
}
```

This allows the UI to distinguish:

- files inferred from summary-only answers
- files actually fetched and analyzed

## UI Changes

Update [AgentTab.tsx](D:/projects/products/gitMentor/src/components/AgentTab.tsx) so assistant replies can show:

- final answer body
- analyzed files section
- optional retrieval failure notice

Behavior:

- analyzed files appear below the answer
- file pills link to GitHub blob URLs
- fetched files should be preferred over heuristic "related files"
- when retrieval partially fails, show a short note instead of failing the entire turn

Footer text should also be updated to reflect the new behavior. The current "README + source map + session summary" wording becomes inaccurate once background code retrieval is enabled.

## Failure Handling

The pipeline must degrade gracefully.

### Retrieval Planning Failure

If the retrieval planning prompt fails:

- fallback to current summary-only answer path
- set low confidence
- do not block the user

### GitHub Fetch Failure

If some file fetches fail:

- keep successfully fetched files
- continue to final answer if at least one useful file was retrieved
- if all fetches fail, fallback to summary-only answer path
- surface a short failure note in message metadata

### Final Answer Failure

If grounded answering fails after retrieval:

- fallback to the current lightweight answer path if possible
- otherwise preserve the explicit request failure message

## Performance Constraints

This feature adds a second LLM call and GitHub fetches, so the design should keep latency bounded.

Constraints:

- retrieval planning prompt should be short and structured
- file count should remain small
- file contents should be truncated before final answering
- timeout budgets should be stage-specific

Suggested timeout shape:

- planner timeout shorter than answer timeout
- GitHub file fetch timeout per file
- final answer timeout similar to current agent timeout

## Testing Strategy

### Unit Tests

Required coverage:

- retrieval plan parsing
- repo-relative path normalization
- GitHub raw URL construction
- branch fallback logic
- per-file and total-budget truncation
- retrieval result shaping for UI

### Integration Tests

Required coverage:

- `chatWithAgent` chooses summary-only path when code is not needed
- `chatWithAgent` chooses GitHub-code path when code is needed
- partial file fetch failures still produce final answers
- total fetch failure falls back to summary-only mode

### UI Verification

Required coverage:

- analyzed files render as clickable pills
- retrieval metadata survives session persistence
- fallback answers do not show fake analyzed files

Verification commands during implementation:

- targeted node-based tests for pure helpers
- `npm run type-check`
- `npm run build`

## Risks and Mitigations

Risk: the planner chooses the wrong files.
Mitigation: cap file count, combine source map hints with planner output, and preserve low-confidence fallback behavior.

Risk: GitHub raw fetches fail due to missing branch assumptions or rate limits.
Mitigation: branch fallback order, per-file failure handling, and summary-only fallback.

Risk: very large files overwhelm prompt budget.
Mitigation: apply strict per-file and total-budget truncation before final answering.

Risk: UI implies certainty when code was not actually fetched.
Mitigation: keep `retrievalMode` explicit and only show analyzed files from real retrieval results.

## Implementation Boundary

This iteration includes:

- on-demand retrieval planning for assistant questions
- background GitHub file fetches
- grounded final answering with fetched code
- analyzed-files evidence rendering in chat UI

This iteration does not include:

- semantic search index
- precomputed whole-repo code cache
- branch picker UI
- per-file diff or inline code viewer in chat

## Open Questions Resolved

- Retrieval should be on-demand, not unconditional.
- File content should come directly from GitHub rather than local cache first.
- The assistant should show analyzed files together with the final answer.
