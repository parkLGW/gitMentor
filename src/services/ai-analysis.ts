// AI Analysis Service - Prompt design and analysis logic

import { llmManager } from './llm'
import { AnalysisResult } from '@/types/llm'

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
You are an expert software engineer and technical writer. Analyze this GitHub project and provide structured insights.

PROJECT INFORMATION:
${projectInfo}

README CONTENT:
${readme}

Please analyze this project and provide a JSON response with the following structure:
{
  "coreValue": "A one-sentence description of what this project does and its main value",
  "problems": ["Problem 1", "Problem 2", "Problem 3"],
  "useCases": ["Use case 1", "Use case 2", "Use case 3"],
  "difficulty": "beginner|intermediate|advanced (justify your choice)",
  "targetAudience": "Who should learn this (frontend dev, backend dev, full-stack, etc.)",
  "keyFeatures": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"]
}

Be concise and practical. Focus on what developers actually need to know.
`,

  projectAnalysisCN: (projectInfo: string, readme: string) => `
你是一名资深软件工程师和技术文档专家。分析这个GitHub项目并提供结构化的见解。

项目信息：
${projectInfo}

README 内容：
${readme}

请分析这个项目，并以JSON格式返回以下结构：
{
  "coreValue": "用一句话描述这个项目做什么、有什么价值",
  "problems": ["解决的问题1", "解决的问题2", "解决的问题3"],
  "useCases": ["适用场景1", "适用场景2", "适用场景3"],
  "difficulty": "beginner|intermediate|advanced (说明理由)",
  "targetAudience": "适合什么人学习 (前端开发、后端开发、全栈、etc)",
  "keyFeatures": ["关键特性1", "关键特性2", "关键特性3", "关键特性4", "关键特性5"]
}

请保持简洁、实用。关注开发者真正需要了解的内容。
`,

  quickStart: (projectInfo: string, readme: string, packageJson?: string) => `
You are a technical teacher. Create a "getting started" guide for this project that goes from 0 to 1.

PROJECT INFO:
${projectInfo}

README:
${readme}

${packageJson ? `PACKAGE.JSON:\n${packageJson}` : ''}

Create a JSON response with this structure:
{
  "prerequisites": ["Requirement 1", "Requirement 2", "..."],
  "steps": [
    {
      "title": "Step 1: Install",
      "description": "Clear explanation of what to do",
      "commands": ["npm install xxx", "yarn add xxx"]
    },
    {
      "title": "Step 2: Setup",
      "description": "Configuration needed",
      "commands": ["configuration commands if any"]
    }
  ],
  "firstExample": {
    "title": "Your first working code",
    "code": "const example = require('xxx');\\nexample.doSomething();",
    "explanation": "Explain what this code does and why it works"
  },
  "commonMistakes": [
    {
      "issue": "Common error message or problem",
      "solution": "How to fix it"
    }
  ],
  "nextSteps": "What to learn next after getting it working"
}

Make it practical and actionable. Include actual commands users can copy-paste.
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
You are a code architect. Analyze the project structure and create a learning roadmap.

PROJECT INFO:
${projectInfo}

FILE STRUCTURE:
${fileTree}

${keyFiles ? `KEY FILES:\n${keyFiles}` : ''}

Return JSON with this structure:
{
  "architecture": "One paragraph explaining the overall architecture and design patterns",
  "files": [
    {
      "path": "src/core/engine.js",
      "priority": "critical|important|optional",
      "description": "What this file does and why it matters"
    }
  ],
  "learningPhases": [
    {
      "phase": 1,
      "title": "Understanding the Core",
      "description": "What you'll learn in this phase",
      "files": ["src/index.js", "src/core/engine.js"],
      "objectives": ["Understand how initialization works", "Learn the main concepts"]
    }
  ],
  "keyConcepts": [
    {
      "term": "Event Loop",
      "explanation": "Brief explanation of this concept in the context of this project"
    }
  ],
  "architectureMermaid": "graph TD; A[Entry] --> B[Core]; B --> C[Utils];"
}

Focus on learning efficiency. Make it clear why you recommend reading files in a certain order.
`,

  sourceMapCN: (projectInfo: string, fileTree: string, keyFiles?: string) => `
你是代码架构师。分析项目结构并创建学习路线图。

项目信息：
${projectInfo}

文件结构：
${fileTree}

${keyFiles ? `关键文件：\n${keyFiles}` : ''}

返回JSON格式：
{
  "architecture": "一段解释总体架构和设计模式的文字",
  "files": [
    {
      "path": "src/core/engine.js",
      "priority": "critical|important|optional",
      "description": "这个文件做什么、为什么重要"
    }
  ],
  "learningPhases": [
    {
      "phase": 1,
      "title": "理解核心",
      "description": "这个阶段你会学到什么",
      "files": ["src/index.js", "src/core/engine.js"],
      "objectives": ["理解初始化如何工作", "学习主要概念"]
    }
  ],
  "keyConcepts": [
    {
      "term": "事件循环",
      "explanation": "这个概念在这个项目中的简要说明"
    }
  ],
  "architectureMermaid": "graph TD; A[入口] --> B[核心]; B --> C[工具];"
}

专注于学习效率。说清楚为什么按这个顺序读文件。
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
    return JSON.parse(response.content)
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
    return JSON.parse(response.content)
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
    return JSON.parse(response.content)
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
