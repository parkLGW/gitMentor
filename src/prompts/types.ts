// Prompt 输出类型定义

// 项目上下文 - 传入 prompt 的信息
export interface ProjectContext {
  name: string
  owner: string
  language: string
  projectType: ProjectType
  
  // 结构信息
  directoryTree: string        // 简化目录树（用于快速上手）
  fullDirectoryTree: string    // 完整目录树（用于源码地图）
  
  // 配置文件
  packageJson?: PackageJsonInfo
  scripts?: Record<string, string>
  dependencies?: string[]
  devDependencies?: string[]
  
  // 关键文件
  entryFileContent?: string    // 入口文件前 100 行
  coreFilesPreview?: string    // 核心目录文件列表
  configFiles?: string[]       // 配置文件列表
  
  // README
  readme: string
  readmeSummary: string        // 前 1000 字符
}

export type ProjectType = 
  | 'react' 
  | 'vue' 
  | 'angular'
  | 'nextjs'
  | 'node' 
  | 'express'
  | 'python' 
  | 'django'
  | 'flask'
  | 'library' 
  | 'cli' 
  | 'monorepo'
  | 'unknown'

export interface PackageJsonInfo {
  name?: string
  version?: string
  description?: string
  main?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  bin?: Record<string, string> | string
  engines?: {
    node?: string
    npm?: string
    [key: string]: string | undefined
  }
}

// ============================================
// 快速上手输出类型
// ============================================

export interface QuickStartOutput {
  prerequisites: Prerequisite[]
  installSteps: CommandStep[]
  runSteps: CommandStep[]
  verifySuccess: string
  commonIssues: CommonIssue[]
  tips?: string[]
}

export interface Prerequisite {
  name: string
  version?: string
  required: boolean
  installGuide?: string
}

export interface CommandStep {
  command: string
  description: string
  notes?: string
}

export interface CommonIssue {
  problem: string
  solution: string
  relatedCommand?: string
}

// ============================================
// 源码地图输出类型
// ============================================

export interface SourceMapOutput {
  architectureType: ArchitectureType
  architectureSummary: string
  mermaidDiagram: string
  coreModules: CoreModule[]
  dependencies: ModuleDependency[]
  learningPath: LearningPhase[]
  keyConcepts: KeyConcept[]
}

export type ArchitectureType = 
  | 'mvc'
  | 'component-based'
  | 'layered'
  | 'microservices'
  | 'plugin-based'
  | 'event-driven'
  | 'monolithic'
  | 'other'

export interface CoreModule {
  name: string
  path: string
  responsibility: string
  importance: 'high' | 'medium' | 'low'
  keyFiles: string[]
  description?: string
}

export interface ModuleDependency {
  from: string
  to: string
  type: 'imports' | 'uses' | 'extends' | 'implements' | 'calls'
  description?: string
}

export interface LearningPhase {
  phase: number
  title: string
  goal: string
  files: string[]
  estimatedMinutes: number
  prerequisites?: string[]
}

export interface KeyConcept {
  term: string
  definition: string
  relatedFiles: string[]
  importance: 'essential' | 'important' | 'helpful'
}

// ============================================
// 代码分析输出类型（用于侧边栏）
// ============================================

export interface FileAnalysisOutput {
  summary: string
  purpose: string
  keyFunctions: FunctionInfo[]
  dependencies: string[]
  usedBy?: string[]
  complexity: 'simple' | 'moderate' | 'complex'
  suggestedReadingOrder?: string[]
}

export interface FunctionInfo {
  name: string
  purpose: string
  parameters?: string[]
  returns?: string
  lineNumber?: number
}

// ============================================
// 问答输出类型
// ============================================

export interface QAResponse {
  answer: string
  codeReferences?: CodeReference[]
  relatedFiles?: string[]
  followUpQuestions?: string[]
}

export interface CodeReference {
  file: string
  lineStart: number
  lineEnd: number
  snippet: string
  explanation: string
}
