export const AGENT_LLM_TIMEOUT_MS = 60000;
export const AGENT_LLM_RETRY_TIMEOUT_MS = 25000;
export const AGENT_FINAL_ANSWER_TIMEOUT_MS = 25000;
export const AGENT_FINAL_ANSWER_RETRY_TIMEOUT_MS = 12000;
export const AGENT_SUMMARY_TIMEOUT_MS = 90000;
export const AGENT_PLANNER_TIMEOUT_MS = 25000;
export const AGENT_PLANNER_RETRY_TIMEOUT_MS = 12000;
export const AGENT_CODE_FETCH_TIMEOUT_MS = 15000;
/**
 * Budget for the single recursive repo-tree request used by file discovery.
 * Keep in sync with RECURSIVE_TREE_TIMEOUT_MS in services/github.ts (kept
 * separate so this constants module stays importable from the popup bundle).
 */
export const AGENT_REPO_TREE_TIMEOUT_MS = 15000;

const AGENT_RUNTIME_MESSAGE_BUFFER_MS = 30000;
/** The pipeline fetches twice: the planned files, then one-hop import expansion. */
const AGENT_CODE_FETCH_ROUNDS = 2;

/**
 * Worst-case wall time for one agent chat request, following the actual
 * pipeline: plan (+retry) -> discover -> fetch (+one-hop) -> answer (+retry).
 */
export function getAgentWorstCaseRuntimeTimeoutMs(): number {
  return (
    AGENT_PLANNER_TIMEOUT_MS +
    AGENT_PLANNER_RETRY_TIMEOUT_MS +
    AGENT_REPO_TREE_TIMEOUT_MS +
    AGENT_CODE_FETCH_ROUNDS * AGENT_CODE_FETCH_TIMEOUT_MS +
    AGENT_FINAL_ANSWER_TIMEOUT_MS +
    AGENT_FINAL_ANSWER_RETRY_TIMEOUT_MS
  );
}

export const AGENT_CHAT_REQUEST_TIMEOUT_MS = Math.max(
  180000,
  getAgentWorstCaseRuntimeTimeoutMs() + AGENT_RUNTIME_MESSAGE_BUFFER_MS
);
