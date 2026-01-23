// AI Analysis Service - Prompt design and analysis logic

import { llmManager } from './llm'

// Helper function to extract JSON from markdown code blocks
function extractJSON(text: string): string {
  // Try to extract JSON from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    return jsonMatch[1].trim()
  }
  // If no markdown block, return as-is
  return text.trim()
}

export interface ProjectAnalysis {
  coreValue: string
  problems: string[]
  useCases: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  targetAudience: string
  keyFeatures: string[]
}

export interface QuickStartGuide {
  prerequisites: string[]
  steps: Array<{
    title: string
    description: string
    commands?: string[]
  }>
  firstExample: {
    title: string
    code: string
    explanation: string
  }
  commonMistakes: Array<{
    issue: string
    solution: string
  }>
  nextSteps: string
}

export interface SourceCodeMap {
  architecture: string
  files: Array<{
    path: string
    priority: 'critical' | 'important' | 'optional'
    description: string
  }>
  learningPhases: Array<{
    phase: number
    title: string
    description: string
    files: string[]
    objectives: string[]
  }>
  keyConcepts: Array<{
    term: string
    explanation: string
  }>
  architectureMermaid?: string
}

// Prompt Templates
const PROMPTS = {
  projectAnalysis: (projectInfo: string, readme: string) => `
You are an expert software engineer. Analyze this ACTUAL GitHub project (not a template) and provide SPECIFIC, REAL insights.

PROJECT DETAILS:
${projectInfo}

README:
${readme}

IMPORTANT: Generate REAL analysis for THIS project, not generic placeholders.
- Look at what the project ACTUALLY does based on the README
- Identify REAL problems it solves
- Describe REAL use cases from the context
- Assess REAL difficulty based on the code/documentation

Return JSON:
{
  "coreValue": "Concise one-liner about what THIS project actually does",
  "problems": ["Real problem 1", "Real problem 2", "Real problem 3"],
  "useCases": ["Actual use case 1", "Actual use case 2", "Actual use case 3"],
  "difficulty": "beginner|intermediate|advanced with reason",
  "targetAudience": "Specific developer roles",
  "keyFeatures": ["Real feature 1", "Real feature 2", "Real feature 3"]
}
`,

  projectAnalysisCN: (projectInfo: string, readme: string) => `
你是一名资深软件工程师。分析这个真实的GitHub项目（不是模板），提供具体、真实的见解。

项目详情：
${projectInfo}

README：
${readme}

重要：为这个项目生成真实分析，不是通用占位符。
- 根据README看这个项目真正做什么
- 找出它真正解决的问题
- 描述实际应用场景
- 根据代码/文档评估真实难度

返回JSON：
{
  "coreValue": "这个项目真正做什么，一句话总结",
  "problems": ["真实问题1", "真实问题2", "真实问题3"],
  "useCases": ["实际场景1", "实际场景2", "实际场景3"],
  "difficulty": "beginner|intermediate|advanced 加上理由",
  "targetAudience": "具体的开发者角色",
  "keyFeatures": ["真实特性1", "真实特性2", "真实特性3"]
}
`,

  quickStart: (projectInfo: string, readme: string, packageJson?: string) => `
You are a technical teacher. Create a REAL "getting started" guide for THIS specific project (not generic).

PROJECT:
${projectInfo}

README:
${readme}

${packageJson ? `PACKAGE.JSON:\n${packageJson}` : ''}

Create REAL setup steps based on the ACTUAL project:
- What dependencies are ACTUALLY needed
- Real installation commands for THIS project
- Real configuration THIS project requires
- Real working example with THIS project's API
- Real common mistakes people make with THIS project

JSON response:
{
  "prerequisites": ["Node.js", "git", "...actual dependencies"],
  "steps": [
    {
      "title": "Step 1: Clone and Install",
      "description": "Real steps for this project",
      "commands": ["git clone...", "npm install", "...]
    }
  ],
  "firstExample": {
    "title": "First working example",
    "code": "Real code for THIS project, not placeholder",
    "explanation": "Why this works with this project"
  },
  "commonMistakes": [
    {
      "issue": "Real mistakes people make",
      "solution": "How to fix for this project"
    }
  ],
  "nextSteps": "Real next steps after setup"
}
`,

  quickStartCN: (projectInfo: string, readme: string, packageJson?: string) => `
你是一名技术教师。为这个项目创建一份"从0到1"的入门指南。

项目信息：
${projectInfo}

README：
${readme}

${packageJson ? `PACKAGE.JSON:\n${packageJson}` : ''}

返回JSON格式：
{
  "prerequisites": ["前置条件1", "前置条件2"],
  "steps": [
    {
      "title": "步骤1：安装",
      "description": "清楚的操作说明",
      "commands": ["npm install xxx"]
    }
  ],
  "firstExample": {
    "title": "你的第一个有效代码",
    "code": "const example = require('xxx');\\nexample.doSomething();",
    "explanation": "这段代码做什么、为什么能工作"
  },
  "commonMistakes": [
    {
      "issue": "常见错误或问题",
      "solution": "如何修复"
    }
  ],
  "nextSteps": "运行起来后学什么"
}

使用实际的、可执行的代码和命令。
`,

  sourceMap: (projectInfo: string, fileTree: string, keyFiles?: string) => `
You are a code architect. Analyze THIS project's ACTUAL structure and create a REAL learning roadmap.

PROJECT:
${projectInfo}

FILE STRUCTURE:
${fileTree}

${keyFiles ? `KEY FILES:\n${keyFiles}` : ''}

Create REAL learning path for THIS project (not generic):
- Analyze ACTUAL file structure
- Identify REAL entry points and key files
- Create REAL learning phases based on THIS project's complexity
- Explain REAL design patterns used

JSON:
{
  "architecture": "Real architecture explanation for THIS project",
  "files": [
    {
      "path": "real/file/path.js",
      "priority": "critical|important|optional",
      "description": "What THIS file actually does"
    }
  ],
  "learningPhases": [
    {
      "phase": 1,
      "title": "Start here - real entry point",
      "description": "Real setup for this project",
      "files": ["actual files for this project"],
      "objectives": ["Real objectives for this project"]
    }
  ],
  "keyConcepts": [
    {
      "term": "Real concept from this project",
      "explanation": "Real explanation in context"
    }
  ],
  "architectureMermaid": "Real diagram for this architecture"
}
`,

  sourceMapCN: (projectInfo: string, fileTree: string, keyFiles?: string) => `
你是代码架构师。分析这个项目的真实结构，创建真实的学习路线。

项目：
${projectInfo}

文件结构：
${fileTree}

${keyFiles ? `关键文件：\n${keyFiles}` : ''}

为这个项目创建真实学习路径（不是通用的）：
- 分析真实的文件结构
- 找出真实的入口点和关键文件
- 根据这个项目的复杂度创建真实的学习阶段
- 解释这个项目用的真实设计模式

JSON：
{
  "architecture": "这个项目真实的架构说明",
  "files": [
    {
      "path": "真实/文件/路径.js",
      "priority": "critical|important|optional",
      "description": "这个文件真正做什么"
    }
  ],
  "learningPhases": [
    {
      "phase": 1,
      "title": "从这里开始 - 真实入口点",
      "description": "这个项目的真实配置",
      "files": ["这个项目的真实文件"],
      "objectives": ["这个项目的真实学习目标"]
    }
  ],
  "keyConcepts": [
    {
      "term": "这个项目的真实概念",
      "explanation": "在项目背景下的真实解释"
    }
  ],
  "architectureMermaid": "这个架构的真实图表"
}
`,
}

export class AIAnalysisService {
  /**
   * Analyze a GitHub project
   */
  static async analyzeProject(
    projectInfo: string,
    readme: string,
    language: 'zh' | 'en' = 'en'
  ): Promise<ProjectAnalysis> {
    const provider = llmManager.getCurrentProvider()
    if (!provider) throw new Error('No LLM provider configured')

    const prompt =
      language === 'zh'
        ? PROMPTS.projectAnalysisCN(projectInfo, readme)
        : PROMPTS.projectAnalysis(projectInfo, readme)

    const response = await provider.complete(prompt)
    const jsonText = extractJSON(response.content)
    return JSON.parse(jsonText)
  }

  /**
   * Generate quick start guide
   */
  static async generateQuickStart(
    projectInfo: string,
    readme: string,
    packageJson: string | undefined,
    language: 'zh' | 'en' = 'en'
  ): Promise<QuickStartGuide> {
    const provider = llmManager.getCurrentProvider()
    if (!provider) throw new Error('No LLM provider configured')

    const prompt =
      language === 'zh'
        ? PROMPTS.quickStartCN(projectInfo, readme, packageJson)
        : PROMPTS.quickStart(projectInfo, readme, packageJson)

    const response = await provider.complete(prompt)
    const jsonText = extractJSON(response.content)
    return JSON.parse(jsonText)
  }

  /**
   * Generate source code learning map
   */
  static async generateSourceMap(
    projectInfo: string,
    fileTree: string,
    keyFiles: string | undefined,
    language: 'zh' | 'en' = 'en'
  ): Promise<SourceCodeMap> {
    const provider = llmManager.getCurrentProvider()
    if (!provider) throw new Error('No LLM provider configured')

    const prompt =
      language === 'zh'
        ? PROMPTS.sourceMapCN(projectInfo, fileTree, keyFiles)
        : PROMPTS.sourceMap(projectInfo, fileTree, keyFiles)

    const response = await provider.complete(prompt)
    const jsonText = extractJSON(response.content)
    return JSON.parse(jsonText)
  }

  /**
   * Stream analysis for long responses
   */
  static async *streamAnalyze(
    prompt: string
  ): AsyncGenerator<string> {
    const provider = llmManager.getCurrentProvider()
    if (!provider) throw new Error('No LLM provider configured')

    yield* provider.stream(prompt)
  }
}
