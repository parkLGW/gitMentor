// 项目上下文收集服务
// 收集项目的各种信息，用于构建 AI 分析的上下文

import {
  getRepoInfo,
  getReadme,
  getPackageJson,
  getFullDirectoryTree,
  formatDirectoryTree,
  formatSimpleDirectoryTree,
  findEntryFile,
  getFileContent,
  getCoreFilesPreview,
  TreeNode,
} from './github'
import { ProjectContext, ProjectType } from '@/prompts/types'

// 项目类型检测
function detectProjectType(
  packageJson: any,
  tree: TreeNode[],
  mainLanguage: string
): ProjectType {
  const deps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  }

  // 检查 JavaScript/TypeScript 项目
  if (deps) {
    // React 生态
    if (deps['next']) return 'nextjs'
    if (deps['react']) return 'react'
    
    // Vue 生态
    if (deps['vue'] || deps['nuxt']) return 'vue'
    
    // Angular
    if (deps['@angular/core']) return 'angular'
    
    // Node.js 后端
    if (deps['express']) return 'express'
    if (deps['fastify'] || deps['koa'] || deps['hapi']) return 'node'
    
    // CLI 工具
    if (packageJson?.bin) return 'cli'
    
    // 纯库
    if (packageJson?.main && !deps['react'] && !deps['vue']) return 'library'
  }

  // 检查 Python 项目
  const treeNames = tree.map(n => n.name.toLowerCase())
  if (treeNames.includes('requirements.txt') || treeNames.includes('setup.py') || treeNames.includes('pyproject.toml')) {
    if (treeNames.includes('manage.py')) return 'django'
    if (deps && (deps['flask'] || treeNames.some(n => n.includes('flask')))) return 'flask'
    return 'python'
  }

  // 检查 monorepo
  if (treeNames.includes('packages') || treeNames.includes('apps') || packageJson?.workspaces) {
    return 'monorepo'
  }

  // 基于主语言推断
  const lang = mainLanguage.toLowerCase()
  if (lang === 'python') return 'python'
  if (lang === 'typescript' || lang === 'javascript') {
    return packageJson ? 'library' : 'unknown'
  }

  return 'unknown'
}

// 提取依赖列表
function extractDependencies(packageJson: any): string[] {
  if (!packageJson?.dependencies) return []
  return Object.keys(packageJson.dependencies)
}

function extractDevDependencies(packageJson: any): string[] {
  if (!packageJson?.devDependencies) return []
  return Object.keys(packageJson.devDependencies)
}

// 收集完整项目上下文
export async function collectProjectContext(
  owner: string,
  repo: string
): Promise<ProjectContext> {
  console.log(`[ContextCollector] Collecting context for ${owner}/${repo}`)

  // 并行获取基础信息
  const [repoInfo, readme, packageJson, tree] = await Promise.all([
    getRepoInfo(owner, repo),
    getReadme(owner, repo).catch(() => ''),
    getPackageJson(owner, repo),
    getFullDirectoryTree(owner, repo, 2),
  ])

  // 检测项目类型
  const projectType = detectProjectType(packageJson, tree, repoInfo.language)
  console.log(`[ContextCollector] Detected project type: ${projectType}`)

  // 获取入口文件内容
  const entryFilePath = await findEntryFile(owner, repo)
  const entryFileContent = entryFilePath
    ? await getFileContent(owner, repo, entryFilePath, 100)
    : null

  // 获取核心文件预览
  const coreFilesPreview = await getCoreFilesPreview(owner, repo)

  // 构建上下文
  const context: ProjectContext = {
    name: repo,
    owner,
    language: repoInfo.language,
    projectType,
    
    // 目录结构
    directoryTree: formatSimpleDirectoryTree(tree),
    fullDirectoryTree: formatDirectoryTree(tree),
    
    // 配置信息 - 保留完整的 packageJson 包括 engines
    packageJson: packageJson ? {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      main: packageJson.main,
      scripts: packageJson.scripts,
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
      bin: packageJson.bin,
      engines: packageJson.engines,
    } : undefined,
    scripts: packageJson?.scripts,
    dependencies: extractDependencies(packageJson),
    devDependencies: extractDevDependencies(packageJson),
    
    // 关键文件
    entryFileContent: entryFileContent || undefined,
    coreFilesPreview: coreFilesPreview || undefined,
    
    // README
    readme,
    readmeSummary: readme.slice(0, 1500), // 前 1500 字符
  }

  console.log(`[ContextCollector] Context collected:`, {
    projectType: context.projectType,
    hasPackageJson: !!context.packageJson,
    hasEntryFile: !!context.entryFileContent,
    readmeLength: context.readme.length,
    dependencyCount: context.dependencies?.length || 0,
  })

  return context
}

// 快速收集（用于快速上手，不需要完整目录树）
export async function collectQuickContext(
  owner: string,
  repo: string
): Promise<ProjectContext> {
  console.log(`[ContextCollector] Collecting quick context for ${owner}/${repo}`)

  const [repoInfo, readme, packageJson, tree] = await Promise.all([
    getRepoInfo(owner, repo),
    getReadme(owner, repo).catch(() => ''),
    getPackageJson(owner, repo),
    getFullDirectoryTree(owner, repo, 1), // 只获取一级目录
  ])

  const projectType = detectProjectType(packageJson, tree, repoInfo.language)

  return {
    name: repo,
    owner,
    language: repoInfo.language,
    projectType,
    directoryTree: formatSimpleDirectoryTree(tree),
    fullDirectoryTree: formatDirectoryTree(tree),
    packageJson: packageJson,
    scripts: packageJson?.scripts,
    dependencies: extractDependencies(packageJson),
    devDependencies: extractDevDependencies(packageJson),
    readme,
    readmeSummary: readme.slice(0, 1000),
  }
}

// 深度收集（用于源码地图，获取更多文件信息）
export async function collectDeepContext(
  owner: string,
  repo: string
): Promise<ProjectContext> {
  console.log(`[ContextCollector] Collecting deep context for ${owner}/${repo}`)

  // 获取更深的目录树
  const [repoInfo, readme, packageJson, tree] = await Promise.all([
    getRepoInfo(owner, repo),
    getReadme(owner, repo).catch(() => ''),
    getPackageJson(owner, repo),
    getFullDirectoryTree(owner, repo, 3), // 获取三级目录
  ])

  const projectType = detectProjectType(packageJson, tree, repoInfo.language)

  // 获取多个关键文件的内容
  const entryFilePath = await findEntryFile(owner, repo)
  const entryFileContent = entryFilePath
    ? await getFileContent(owner, repo, entryFilePath, 150)
    : null

  const coreFilesPreview = await getCoreFilesPreview(owner, repo)

  // 尝试获取更多配置文件列表
  const configFiles: string[] = []
  const configPatterns = [
    'tsconfig.json',
    'vite.config.ts',
    'vite.config.js',
    'webpack.config.js',
    '.eslintrc.js',
    '.prettierrc',
    'jest.config.js',
    'vitest.config.ts',
  ]
  
  tree.forEach(node => {
    if (configPatterns.includes(node.name)) {
      configFiles.push(node.name)
    }
  })

  return {
    name: repo,
    owner,
    language: repoInfo.language,
    projectType,
    directoryTree: formatSimpleDirectoryTree(tree),
    fullDirectoryTree: formatDirectoryTree(tree),
    packageJson: packageJson,
    scripts: packageJson?.scripts,
    dependencies: extractDependencies(packageJson),
    devDependencies: extractDevDependencies(packageJson),
    entryFileContent: entryFileContent || undefined,
    coreFilesPreview,
    configFiles,
    readme,
    readmeSummary: readme.slice(0, 2000), // 更多 README 内容
  }
}
