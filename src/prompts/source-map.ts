// 源码地图 Prompt 生成器

import { ProjectContext, SourceMapOutput } from './types'

export function createSourceMapPrompt(context: ProjectContext, language: 'zh' | 'en'): string {
  const isZh = language === 'zh'
  
  return `
${isZh ? '你是一个代码架构分析专家。请基于以下信息，分析项目架构并生成详细的源码学习地图。' : 'You are a code architecture analysis expert. Based on the following information, analyze the project architecture and generate a detailed source code learning map.'}

## ${isZh ? '项目信息' : 'Project Information'}
- ${isZh ? '名称' : 'Name'}: ${context.name}
- ${isZh ? '作者' : 'Owner'}: ${context.owner}
- ${isZh ? '主语言' : 'Main Language'}: ${context.language}
- ${isZh ? '项目类型' : 'Project Type'}: ${context.projectType}

## ${isZh ? '完整目录结构' : 'Full Directory Structure'}
${context.fullDirectoryTree}

## ${isZh ? '入口文件内容' : 'Entry File Content'}
${context.entryFileContent || 'Not available'}

## ${isZh ? '核心文件预览' : 'Core Files Preview'}
${context.coreFilesPreview || 'Not available'}

## ${isZh ? '主要依赖' : 'Main Dependencies'}
${context.dependencies?.slice(0, 20).join(', ') || 'Not available'}

## README ${isZh ? '摘要' : 'Summary'}
${context.readmeSummary}

---

${isZh ? '请输出 JSON 格式的源码地图：' : 'Please output a source code map in JSON format:'}

\`\`\`json
{
  "architectureType": "mvc | component-based | layered | microservices | plugin-based | event-driven | monolithic | other",
  "architectureSummary": "${isZh ? '一句话描述项目架构特点' : 'One sentence describing the project architecture'}",
  "mermaidDiagram": "flowchart TB\\n  subgraph ${isZh ? '核心层' : 'Core'}\\n    A[${isZh ? '入口' : 'Entry'}] --> B[${isZh ? '核心模块' : 'Core Module'}]\\n  end\\n  ...",
  "coreModules": [
    {
      "name": "${isZh ? '模块名称' : 'Module name'}",
      "path": "src/xxx",
      "responsibility": "${isZh ? '模块职责描述' : 'Module responsibility description'}",
      "importance": "high | medium | low",
      "keyFiles": ["file1.ts", "file2.ts"],
      "description": "${isZh ? '详细说明' : 'Detailed description'}"
    }
  ],
  "dependencies": [
    {
      "from": "${isZh ? '模块A' : 'Module A'}",
      "to": "${isZh ? '模块B' : 'Module B'}",
      "type": "imports | uses | extends | implements | calls",
      "description": "${isZh ? '依赖关系说明' : 'Dependency description'}"
    }
  ],
  "learningPath": [
    {
      "phase": 1,
      "title": "${isZh ? '阶段标题' : 'Phase title'}",
      "goal": "${isZh ? '学习目标' : 'Learning goal'}",
      "files": ["path/to/file.ts"],
      "estimatedMinutes": 20,
      "prerequisites": ["${isZh ? '前置知识' : 'Prerequisites'}"]
    }
  ],
  "keyConcepts": [
    {
      "term": "${isZh ? '概念名称' : 'Concept name'}",
      "definition": "${isZh ? '概念解释' : 'Concept definition'}",
      "relatedFiles": ["path/to/file.ts"],
      "importance": "essential | important | helpful"
    }
  ]
}
\`\`\`

${isZh ? '要求' : 'Requirements'}:
1. **mermaidDiagram** ${isZh ? '必须是有效的 Mermaid flowchart 语法，使用 TB（从上到下）布局' : 'must be valid Mermaid flowchart syntax, using TB (top to bottom) layout'}
2. ${isZh ? '模块划分必须基于实际目录结构，不要编造不存在的目录' : 'Module division must be based on actual directory structure, do not fabricate non-existent directories'}
3. ${isZh ? '学习路径应该从入口文件开始，由浅入深，每个阶段 3-5 个文件' : 'Learning path should start from entry file, from shallow to deep, 3-5 files per phase'}
4. ${isZh ? '时间估算基于文件数量和复杂度：简单文件 5-10 分钟，复杂文件 15-30 分钟' : 'Time estimation based on file count and complexity: simple files 5-10 min, complex files 15-30 min'}
5. ${isZh ? '关键概念应该包含项目特有的术语和设计模式' : 'Key concepts should include project-specific terminology and design patterns'}
6. ${isZh ? 'importance 评级：high=核心功能，medium=重要辅助，low=工具/配置' : 'Importance rating: high=core functionality, medium=important support, low=tools/config'}
7. ${isZh ? '输出语言必须是中文' : 'Output language must be English'}
8. ${isZh ? '只输出 JSON，不要有其他内容' : 'Output only JSON, no other content'}
9. **IMPORTANT**: ${isZh ? 'mermaidDiagram 中的代码示例不要包含真实的换行符，使用 \\n 代替' : 'Do not include real newlines in code examples within mermaidDiagram, use \\n instead'}

${isZh ? 'Mermaid 图表示例' : 'Mermaid Diagram Example'}:
\`\`\`
flowchart TB
  subgraph Entry["${isZh ? '入口层' : 'Entry Layer'}"]
    A[index.ts]
  end
  subgraph Core["${isZh ? '核心层' : 'Core Layer'}"]
    B[services/]
    C[hooks/]
  end
  subgraph UI["${isZh ? 'UI层' : 'UI Layer'}"]
    D[components/]
  end
  A --> B
  A --> D
  B --> C
  D --> C
\`\`\`
`.trim()
}

// Safe JSON extraction from markdown code block
function extractJSONFromMarkdown(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match && match[1]) {
    return match[1].trim()
  }
  return null
}

// Find JSON boundaries by counting braces
function findJSONBoundaries(text: string): { start: number; end: number } | null {
  let depth = 0
  let inString = false
  let escapeNext = false
  let start = -1

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    
    if (escapeNext) {
      escapeNext = false
      continue
    }
    
    if (char === '\\') {
      escapeNext = true
      continue
    }
    
    if (char === '"' && !inString) {
      inString = true
    } else if (char === '"' && inString) {
      inString = false
    } else if (!inString) {
      if (char === '{') {
        if (depth === 0) {
          start = i
        }
        depth++
      } else if (char === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          return { start, end: i + 1 }
        }
      }
    }
  }
  
  return null
}

// Parse AI response with robust error handling
export function parseSourceMapResponse(response: string): SourceMapOutput | null {
  try {
    // Try to extract from markdown code block first
    let jsonStr = extractJSONFromMarkdown(response)
    
    // If not found, try to find JSON boundaries
    if (!jsonStr) {
      const boundaries = findJSONBoundaries(response)
      if (boundaries) {
        jsonStr = response.slice(boundaries.start, boundaries.end)
      } else {
        jsonStr = response.trim()
      }
    }

    // Attempt 1: Direct parse
    try {
      const parsed = JSON.parse(jsonStr)
      return normalizeSourceMapOutput(parsed)
    } catch (e) {
      console.log('[SourceMap] Direct parse failed, trying fixes...')
    }

    // Attempt 2: Fix common JSON issues
    try {
      let fixed = jsonStr
        // Remove BOM
        .replace(/^\uFEFF/, '')
        // Remove trailing commas
        .replace(/,\s*([}\]])/g, '$1')
        // Fix unescaped newlines in strings (carefully)
        .replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
          return match
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
        })

      const parsed = JSON.parse(fixed)
      return normalizeSourceMapOutput(parsed)
    } catch (e) {
      console.log('[SourceMap] Second attempt failed, trying aggressive fixes...')
    }

    // Attempt 3: Aggressive cleaning
    try {
      let cleaned = jsonStr
        // Remove control characters except newlines and tabs within strings
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Fix multiple consecutive newlines
        .replace(/\n+/g, '\\n')
        // Remove trailing commas more aggressively
        .replace(/,(\s*[}\]])/g, '$1')
        // Fix quotes
        .replace(/"([^"]*)"([^"]*)"([^"]*)"/g, (match, p1, p2, p3) => {
          // If middle part has special chars, escape it
          if (p2.match(/[\n\r\t]/)) {
            return `"${p1}\\${p2.replace(/\n/g, 'n').replace(/\r/g, 'r').replace(/\t/g, 't')}"${p3}"`
          }
          return match
        })

      const parsed = JSON.parse(cleaned)
      return normalizeSourceMapOutput(parsed)
    } catch (e) {
      console.error('[SourceMap] All JSON parse attempts failed')
      console.error('[SourceMap] Raw response (first 1000 chars):', response.slice(0, 1000))
      console.error('[SourceMap] Extracted JSON (first 1000 chars):', jsonStr.slice(0, 1000))
      return null
    }
  } catch (error) {
    console.error('[SourceMap] Failed to parse response:', error)
    return null
  }
}

// Normalize the parsed output to ensure all required fields
function normalizeSourceMapOutput(parsed: any): SourceMapOutput | null {
  if (!parsed || typeof parsed !== 'object') {
    console.warn('[SourceMap] Parsed data is not an object')
    return null
  }

  // Validate required fields
  if (!parsed.architectureType || !parsed.coreModules || !parsed.learningPath) {
    console.warn('[SourceMap] Missing required fields:', {
      hasArchitectureType: !!parsed.architectureType,
      hasCoreModules: !!parsed.coreModules,
      hasLearningPath: !!parsed.learningPath
    })
    return null
  }

  // Clean mermaid diagram
  let mermaidDiagram = parsed.mermaidDiagram || ''
  
  // Handle escaped newlines
  mermaidDiagram = mermaidDiagram
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .trim()

  // Basic validation of mermaid syntax
  if (mermaidDiagram && !mermaidDiagram.includes('flowchart') && !mermaidDiagram.includes('graph')) {
    console.warn('[SourceMap] Mermaid diagram missing flowchart/graph declaration')
    // Try to wrap it in flowchart
    if (mermaidDiagram.includes('-->')) {
      mermaidDiagram = `flowchart TB\n${mermaidDiagram}`
    }
  }

  return {
    architectureType: parsed.architectureType,
    architectureSummary: parsed.architectureSummary || '',
    mermaidDiagram,
    coreModules: Array.isArray(parsed.coreModules) ? parsed.coreModules : [],
    dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
    learningPath: Array.isArray(parsed.learningPath) ? parsed.learningPath : [],
    keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : []
  }
}

// 生成 fallback 数据（当 AI 分析失败时使用）
export function createSourceMapFallback(context: ProjectContext, language: 'zh' | 'en'): SourceMapOutput {
  const isZh = language === 'zh'
  
  // 基于项目类型生成通用架构图
  const mermaidDiagram = generateFallbackDiagram(context.projectType, isZh)
  
  return {
    architectureType: detectArchitectureType(context.projectType),
    architectureSummary: isZh 
      ? `${context.name} 项目采用 ${context.projectType} 架构` 
      : `${context.name} project uses ${context.projectType} architecture`,
    mermaidDiagram,
    coreModules: generateFallbackModules(context, isZh),
    dependencies: [],
    learningPath: [
      {
        phase: 1,
        title: isZh ? '了解项目结构' : 'Understand Project Structure',
        goal: isZh ? '熟悉项目的目录结构和主要文件' : 'Familiarize with directory structure and main files',
        files: ['README.md', 'package.json'],
        estimatedMinutes: 15,
        prerequisites: []
      },
      {
        phase: 2,
        title: isZh ? '阅读入口文件' : 'Read Entry Files',
        goal: isZh ? '理解项目的启动流程' : 'Understand the project startup flow',
        files: ['src/index.ts', 'src/main.ts', 'src/app.ts'].filter(f => 
          context.directoryTree.includes(f.split('/').pop() || '')
        ).slice(0, 2),
        estimatedMinutes: 30,
        prerequisites: []
      },
      {
        phase: 3,
        title: isZh ? '深入核心逻辑' : 'Dive into Core Logic',
        goal: isZh ? '理解核心业务逻辑和数据流' : 'Understand core business logic and data flow',
        files: ['src/core/', 'src/services/', 'src/lib/'].filter(f => 
          context.directoryTree.includes(f.replace('/', ''))
        ),
        estimatedMinutes: 60,
        prerequisites: []
      }
    ],
    keyConcepts: [
      {
        term: isZh ? '入口点' : 'Entry Point',
        definition: isZh ? '应用程序的启动文件' : 'The application startup file',
        relatedFiles: ['src/index.ts'],
        importance: 'essential'
      }
    ]
  }
}

function detectArchitectureType(projectType: string): SourceMapOutput['architectureType'] {
  switch (projectType) {
    case 'react':
    case 'vue':
    case 'angular':
      return 'component-based'
    case 'express':
    case 'node':
    case 'django':
    case 'flask':
      return 'layered'
    case 'nextjs':
      return 'component-based'
    case 'library':
    case 'cli':
      return 'monolithic'
    default:
      return 'other'
  }
}

function generateFallbackDiagram(projectType: string, isZh: boolean): string {
  const entry = isZh ? '入口' : 'Entry'
  const core = isZh ? '核心' : 'Core'
  const ui = isZh ? 'UI层' : 'UI Layer'
  const services = isZh ? '服务层' : 'Services'
  const utils = isZh ? '工具层' : 'Utils'
  
  if (['react', 'vue', 'angular', 'nextjs'].includes(projectType)) {
    return `flowchart TB
  subgraph Entry["${entry}"]
    A[App/Main]
  end
  subgraph UI["${ui}"]
    B[Components]
    C[Pages/Views]
  end
  subgraph Logic["${services}"]
    D[Hooks/Composables]
    E[Services/API]
  end
  subgraph Utils["${utils}"]
    F[Utils/Helpers]
  end
  A --> C
  C --> B
  C --> D
  D --> E
  E --> F`
  }
  
  if (['express', 'node', 'django', 'flask'].includes(projectType)) {
    return `flowchart TB
  subgraph Entry["${entry}"]
    A[Server/App]
  end
  subgraph Routes["Routes"]
    B[API Routes]
  end
  subgraph Controllers["Controllers"]
    C[Request Handlers]
  end
  subgraph Services["${services}"]
    D[Business Logic]
  end
  subgraph Data["Data"]
    E[Models/DB]
  end
  A --> B
  B --> C
  C --> D
  D --> E`
  }
  
  // 通用架构
  return `flowchart TB
  subgraph Entry["${entry}"]
    A[Main Entry]
  end
  subgraph Core["${core}"]
    B[Core Logic]
  end
  subgraph Utils["${utils}"]
    C[Utilities]
  end
  A --> B
  B --> C`
}

function generateFallbackModules(context: ProjectContext, isZh: boolean): SourceMapOutput['coreModules'] {
  const modules: SourceMapOutput['coreModules'] = []
  const tree = context.directoryTree.toLowerCase()
  
  // 检测常见目录
  if (tree.includes('src')) {
    modules.push({
      name: 'src',
      path: 'src/',
      responsibility: isZh ? '源代码目录' : 'Source code directory',
      importance: 'high',
      keyFiles: []
    })
  }
  
  if (tree.includes('components')) {
    modules.push({
      name: isZh ? '组件' : 'Components',
      path: 'src/components/',
      responsibility: isZh ? 'UI 组件' : 'UI Components',
      importance: 'high',
      keyFiles: []
    })
  }
  
  if (tree.includes('services')) {
    modules.push({
      name: isZh ? '服务' : 'Services',
      path: 'src/services/',
      responsibility: isZh ? '业务逻辑和 API 调用' : 'Business logic and API calls',
      importance: 'high',
      keyFiles: []
    })
  }
  
  if (tree.includes('hooks')) {
    modules.push({
      name: 'Hooks',
      path: 'src/hooks/',
      responsibility: isZh ? '自定义 React Hooks' : 'Custom React Hooks',
      importance: 'medium',
      keyFiles: []
    })
  }
  
  if (tree.includes('utils') || tree.includes('lib')) {
    modules.push({
      name: isZh ? '工具' : 'Utils',
      path: 'src/utils/',
      responsibility: isZh ? '通用工具函数' : 'Utility functions',
      importance: 'low',
      keyFiles: []
    })
  }
  
  if (tree.includes('types')) {
    modules.push({
      name: isZh ? '类型' : 'Types',
      path: 'src/types/',
      responsibility: isZh ? 'TypeScript 类型定义' : 'TypeScript type definitions',
      importance: 'medium',
      keyFiles: []
    })
  }
  
  return modules.length > 0 ? modules : [
    {
      name: isZh ? '主模块' : 'Main Module',
      path: './',
      responsibility: isZh ? '项目主要代码' : 'Main project code',
      importance: 'high',
      keyFiles: []
    }
  ]
}
