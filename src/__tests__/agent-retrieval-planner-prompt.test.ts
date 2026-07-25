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
  assert.match(prompt, /"searchTerms"/)
  assert.match(prompt, /英文.*关键词|关键词.*英文/)
})

test("planner prompt tells the model to prefer code context for repo-internal en questions", () => {
  const prompt = buildAgentRetrievalPlannerPrompt(
    createPayload("Check whether the model provider configuration is wired correctly", "en"),
    "en",
  )

  assert.match(prompt, /configuration, implementation details, call chains, integration points, auth, error diagnosis, or file location/i)
  assert.match(prompt, /prefer needsCodeContext=true/i)
  assert.match(prompt, /even if the README or source map mentions the topic, that does not mean the summaries are sufficient/i)
  assert.match(prompt, /"searchTerms"/)
  assert.match(prompt, /English keywords for matching against file names/i)
})

test("planner prompt treats usage-prerequisite questions as needing code", () => {
  const zh = buildAgentRetrievalPlannerPrompt(
    createPayload("这个项目搜索工作岗位需要先登录平台吗", "zh"),
    "zh",
  )
  const en = buildAgentRetrievalPlannerPrompt(
    createPayload("Do I need to log into the platform to search jobs?", "en"),
    "en",
  )

  assert.match(zh, /需不需要先登录\/注册\/账号/)
  assert.match(en, /whether login\/signup\/an account is required/i)
})

test("planner prompt forbids answering 'unsure' instead of requesting code", () => {
  const zh = buildAgentRetrievalPlannerPrompt(createPayload("需要登录吗", "zh"), "zh")
  const en = buildAgentRetrievalPlannerPrompt(createPayload("Is login required?", "en"), "en")

  // Summaries not answering the question must push toward retrieval, never toward
  // a false + "I'm not sure / go read the README" reply.
  assert.match(zh, /没有明确回答这个问题，这恰恰说明需要读源码/)
  assert.match(zh, /绝对不要“设为 false 然后回答不确定/)
  assert.match(en, /that is precisely the signal that source is needed/i)
  assert.match(en, /Never set it to false and then reply that you are unsure/i)
})
