import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_CHAT_REQUEST_TIMEOUT_MS,
  AGENT_CODE_FETCH_TIMEOUT_MS,
  AGENT_LLM_RETRY_TIMEOUT_MS,
  AGENT_LLM_TIMEOUT_MS,
  AGENT_PLANNER_TIMEOUT_MS,
  getAgentWorstCaseRuntimeTimeoutMs,
} from "../services/agent-timeouts.js";

test("front-end agent timeout covers the worst-case background pipeline budget", () => {
  const worstCase =
    AGENT_PLANNER_TIMEOUT_MS +
    AGENT_CODE_FETCH_TIMEOUT_MS +
    AGENT_LLM_TIMEOUT_MS +
    AGENT_LLM_RETRY_TIMEOUT_MS;
  const minimumBuffer = 30000;
  const minimumChatTimeout = 600000;

  assert.strictEqual(getAgentWorstCaseRuntimeTimeoutMs(), worstCase);
  assert.ok(
    AGENT_CHAT_REQUEST_TIMEOUT_MS >= worstCase + minimumBuffer,
    `expected UI timeout ${AGENT_CHAT_REQUEST_TIMEOUT_MS}ms to exceed runtime budget ${worstCase}ms by at least ${minimumBuffer}ms`,
  );
  assert.ok(
    AGENT_CHAT_REQUEST_TIMEOUT_MS >= minimumChatTimeout,
    `expected UI timeout ${AGENT_CHAT_REQUEST_TIMEOUT_MS}ms to be at least ${minimumChatTimeout}ms`,
  );
});
