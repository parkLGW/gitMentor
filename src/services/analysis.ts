export interface OverviewData {
  coreValue: string
  problems: string[]
  useCases: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  language: 'zh' | 'en'
}

export interface QuickStartData {
  prerequisites: string[]
  installSteps: string[]
  basicExample: string
  commonIssues: Array<{ error: string; solution: string }>
}

export interface SourceMapData {
  architecture: string
  keyFiles: Array<{
    path: string
    priority: 1 | 2 | 3
    description: string
  }>
  readingOrder: string[]
  keyConcepts: Array<{ term: string; description: string }>
}

// Detect if text is Chinese or English
export function detectLanguage(text: string): 'zh' | 'en' {
  const chineseRegex = /[\u4E00-\u9FA5\u3040-\u309F\u30A0-\u30FF]/g
  const englishRegex = /[a-zA-Z]/g
  
  const chineseMatches = text.match(chineseRegex) || []
  const englishMatches = text.match(englishRegex) || []
  
  return chineseMatches.length > englishMatches.length ? 'zh' : 'en'
}

// Extract text from first N characters (README usually starts with core info)
function extractIntro(readme: string, chars: number = 500): string {
  return readme.slice(0, chars).trim()
}

// Parse README to extract structured information
export function analyzeReadme(readme: string): OverviewData {
  const language = detectLanguage(readme)
  const intro = extractIntro(readme)
  
  // Extract core value from the first paragraph or heading
  const lines = readme.split('\n').filter(line => line.trim())
  const coreValue = lines
    .find(line => !line.startsWith('#') && line.length > 20) || 
    intro.split('.')[0] ||
    'A GitHub project'
  
  // Extract problems (look for common patterns)
  const problems: string[] = []
  if (language === 'zh') {
    const problemPatterns = [
      /解决(.+?)问题/g,
      /用于(.+?)的/g,
      /处理(.+?)的/g,
    ]
    problemPatterns.forEach(pattern => {
      const matches = readme.match(pattern)
      if (matches) problems.push(...matches.slice(0, 3).map(m => m.replace(pattern, '$1')))
    })
  } else {
    const problemPatterns = [
      /solves? (.+?)\./gi,
      /solve[s]? (.+?) problem/gi,
      /helps? you (.+?)\./gi,
    ]
    problemPatterns.forEach(pattern => {
      const matches = readme.match(pattern)
      if (matches) problems.push(...matches.slice(0, 3).map(m => m.replace(pattern, '$1')))
    })
  }
  
  // Default problems if extraction failed
  if (problems.length === 0) {
    problems.push(
      language === 'zh' ? '简化开发流程' : 'Simplify development workflow',
      language === 'zh' ? '提高代码效率' : 'Improve code efficiency',
      language === 'zh' ? '提供通用解决方案' : 'Provide common solutions'
    )
  }
  
  // Extract use cases
  const useCases: string[] = []
  if (language === 'zh') {
    const usePatterns = [
      /适用于(.+?)场景/g,
      /用于(.+?)\s/g,
      /场景[\s：](.+?)[\n\.]?/g,
    ]
    usePatterns.forEach(pattern => {
      const matches = readme.match(pattern)
      if (matches) useCases.push(...matches.slice(0, 2).map(m => m.replace(pattern, '$1')))
    })
  } else {
    const usePatterns = [
      /use (this|it) for (.+?)\./gi,
      /use case[s]?[\s：](.+?)[\n\.]/gi,
      /works? (great|well|best) with (.+?)\./gi,
    ]
    usePatterns.forEach(pattern => {
      const matches = readme.match(pattern)
      if (matches) useCases.push(...matches.slice(0, 2).map(m => m.replace(pattern, '$2')))
    })
  }
  
  // Default use cases
  if (useCases.length === 0) {
    useCases.push(
      language === 'zh' ? '生产环境' : 'Production environment',
      language === 'zh' ? '开发测试' : 'Development and testing',
      language === 'zh' ? '学习研究' : 'Learning and research'
    )
  }
  
  // Estimate difficulty based on README length and keywords
  let difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
  const readmeLength = readme.length
  const complexKeywords = ['architecture', 'advanced', 'configuration', 'plugin', 'middleware', 'extension']
  const complexCount = complexKeywords.filter(kw => readme.toLowerCase().includes(kw)).length
  
  if (readmeLength < 2000) difficulty = 'beginner'
  else if (complexCount > 3) difficulty = 'advanced'
  
  return {
    coreValue,
    problems: problems.slice(0, 3),
    useCases: useCases.slice(0, 3),
    difficulty,
    language,
  }
}

// Extract quick start from README
export function generateQuickStart(readme: string, language: 'zh' | 'en'): QuickStartData {
  const prerequisites: string[] = []
  const installSteps: string[] = []
  
  // Find prerequisites section
  const preqPattern = language === 'zh' 
    ? /前置条件|前置知识|requirements?|requirements\s*(?:\n|：|:)([\s\S]*?)(?:\n##|\n\n|installation)/i
    : /prerequisite|requirements?|(requirements|Dependencies|Setup)\s*(?:\n|：|:)([\s\S]*?)(?:\n##|\n\n|installation)/i
  
  const preqMatch = readme.match(preqPattern)
  if (preqMatch?.[1]) {
    const preqText = preqMatch[1]
    const items = preqText.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
    prerequisites.push(...items.map(item => item.replace(/^[\s\-\*]+/, '').trim()).slice(0, 5))
  }
  
  if (prerequisites.length === 0) {
    prerequisites.push(
      language === 'zh' ? 'Node.js 14+' : 'Node.js 14+',
      language === 'zh' ? 'npm 或 yarn' : 'npm or yarn'
    )
  }
  
  // Find installation section
  const installPattern = language === 'zh'
    ? /安装|installation\s*(?:\n|：|:)([\s\S]*?)(?:\n##|\n\n|usage|使用)/i
    : /installation\s*(?:\n|：|:)([\s\S]*?)(?:\n##|\n\n|usage|quick start)/i
  
  const installMatch = readme.match(installPattern)
  if (installMatch?.[1]) {
    const installText = installMatch[1]
    const codeBlocks = installText.match(/```[\s\S]*?```/g) || []
    if (codeBlocks.length > 0) {
      codeBlocks.slice(0, 3).forEach(block => {
        const code = block.replace(/```.*?\n?/, '').replace(/```$/, '')
        if (code.trim()) installSteps.push(code.trim())
      })
    } else {
      const lines = installText.split('\n').filter(line => line.includes('npm') || line.includes('yarn') || line.includes('git'))
      installSteps.push(...lines.slice(0, 3))
    }
  }
  
  if (installSteps.length === 0) {
    installSteps.push(
      language === 'zh' ? 'npm install <package-name>' : 'npm install <package-name>',
      language === 'zh' ? 'npm run build' : 'npm run build',
      language === 'zh' ? 'npm start' : 'npm start'
    )
  }
  
  // Find basic example
  const examplePattern = language === 'zh'
    ? /例子|example|示例\s*(?:\n|：|:)([\s\S]*?)(?:\n##|\n\n|api|advanced)/i
    : /example|quick start\s*(?:\n|：|:)([\s\S]*?)(?:\n##|\n\n|api|advanced)/i
  
  const exampleMatch = readme.match(examplePattern)
  let basicExample = ''
  if (exampleMatch?.[1]) {
    const exampleText = exampleMatch[1]
    const codeBlock = exampleText.match(/```[\s\S]*?```/)?.[0]
    if (codeBlock) {
      basicExample = codeBlock.replace(/```.*?\n?/, '').replace(/```$/, '').trim()
    }
  }
  
  if (!basicExample) {
    basicExample = language === 'zh'
      ? 'const pkg = require("package");\npkg.init();'
      : 'const pkg = require("package");\npkg.init();'
  }
  
  // Common issues
  const commonIssues: Array<{ error: string; solution: string }> = [
    {
      error: language === 'zh' ? '模块未找到' : 'Module not found',
      solution: language === 'zh' ? '检查Node版本和npm安装' : 'Check Node version and npm installation'
    },
    {
      error: language === 'zh' ? '权限错误' : 'Permission denied',
      solution: language === 'zh' ? '使用sudo或修改npm配置' : 'Use sudo or modify npm config'
    }
  ]
  
  return {
    prerequisites,
    installSteps,
    basicExample,
    commonIssues,
  }
}

// Generate source map from repository structure
export function generateSourceMap(language: 'zh' | 'en'): SourceMapData {
  const architecture = language === 'zh'
    ? '该项目采用模块化架构，核心逻辑与插件系统分离。'
    : 'This project uses a modular architecture with separated core logic and plugin system.'
  
  const keyFiles = [
    {
      path: 'src/index.ts',
      priority: 3 as const,
      description: language === 'zh' ? '应用入口点，初始化应用' : 'Application entry point, initializes the app'
    },
    {
      path: 'src/core/',
      priority: 3 as const,
      description: language === 'zh' ? '核心业务逻辑' : 'Core business logic'
    },
    {
      path: 'src/utils/',
      priority: 2 as const,
      description: language === 'zh' ? '通用工具函数' : 'Utility functions'
    },
    {
      path: 'src/plugins/',
      priority: 1 as const,
      description: language === 'zh' ? '扩展插件系统' : 'Plugin system'
    }
  ]
  
  const readingOrder = [
    language === 'zh' ? '阶段1: 理解入口和整体初始化' : 'Phase 1: Understand entry and initialization',
    language === 'zh' ? '阶段2: 学习核心逻辑' : 'Phase 2: Learn core logic',
    language === 'zh' ? '阶段3: 研究插件系统' : 'Phase 3: Study plugin system'
  ]
  
  const keyConcepts = [
    {
      term: 'Module',
      description: language === 'zh' ? '独立功能单元' : 'Independent functional unit'
    },
    {
      term: 'Hook',
      description: language === 'zh' ? '扩展点' : 'Extension point'
    },
    {
      term: 'Plugin',
      description: language === 'zh' ? '插件系统' : 'Plugin system'
    }
  ]
  
  return {
    architecture,
    keyFiles,
    readingOrder,
    keyConcepts,
  }
}
