import assert from "node:assert"
import test from "node:test"

import { buildAgentRetrievalPlannerPrompt } from "../services/agent-retrieval-planner-prompt.js"

import type { AgentChatRequestPayload } from "../types/agent.js"

function createPayload(question: string, language: "zh" | "en"): AgentChatRequestPayload {
  return {
    repo: { owner: "acme", name: "widgets" },
    language,
    question,
    sourceMapSummary: "Source map summary",
    readmeSummary: "README summary",
    sessionSummary: null,
    recentMessages: [],
  }
}

test("planner prompt tells the model to prefer code context for repo-internal zh questions", () => {
  const prompt = buildAgentRetrievalPlannerPrompt(
    createPayload("帮我检查一下这个项目的模型配置是不是有问题", "zh"),
    "zh",
  )

  assert.match(prompt, /配置、实现、调用链、集成方式、鉴权、报错原因、文件定位/)
  assert.match(prompt, /优先把 needsCodeContext 设为 true/)
  assert.match(prompt, /即使 README 或源码地图提到了相关概念，也不代表信息已经足够/)
})

test("planner prompt tells the model to prefer code context for repo-internal en questions", () => {
  const prompt = buildAgentRetrievalPlannerPrompt(
    createPayload("Check whether the model provider configuration is wired correctly", "en"),
    "en",
  )

  assert.match(prompt, /configuration, implementation details, call chains, integration points, auth, error diagnosis, or file location/i)
  assert.match(prompt, /prefer needsCodeContext=true/i)
  assert.match(prompt, /even if the README or source map mentions the topic, that does not mean the summaries are sufficient/i)
})
