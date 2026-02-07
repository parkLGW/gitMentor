// 快速上手 Prompt 生成器

import { ProjectContext, QuickStartOutput } from './types'

export function createQuickStartPrompt(context: ProjectContext, language: 'zh' | 'en'): string {
  const isZh = language === 'zh'
  
  return `
${isZh ? '你是一个开源项目分析专家。请基于以下信息，生成准确、具体的快速上手指南。' : 'You are an open source project analysis expert. Based on the following information, generate an accurate and specific quick start guide.'}

## ${isZh ? '项目信息' : 'Project Information'}
- ${isZh ? '名称' : 'Name'}: ${context.name}
- ${isZh ? '作者' : 'Owner'}: ${context.owner}
- ${isZh ? '主语言' : 'Main Language'}: ${context.language}
- ${isZh ? '项目类型' : 'Project Type'}: ${context.projectType}

## package.json scripts
${context.scripts ? JSON.stringify(context.scripts, null, 2) : 'Not available'}

## ${isZh ? '依赖项' : 'Dependencies'}
${context.dependencies?.slice(0, 15).join(', ') || 'Not available'}

## ${isZh ? '开发依赖' : 'Dev Dependencies'}
${context.devDependencies?.slice(0, 10).join(', ') || 'Not available'}

## ${isZh ? '目录结构' : 'Directory Structure'}
${context.directoryTree}

## README ${isZh ? '摘要' : 'Summary'}
${context.readmeSummary}

---

${isZh ? '请输出 JSON 格式的快速上手指南：' : 'Please output a quick start guide in JSON format:'}

\`\`\`json
{
  "prerequisites": [
    {
      "name": "${isZh ? '前置要求名称' : 'Prerequisite name'}",
      "version": "${isZh ? '版本要求' : 'Version requirement'}",
      "required": true,
      "installGuide": "${isZh ? '安装说明（可选）' : 'Installation guide (optional)'}"
    }
  ],
  "installSteps": [
    {
      "command": "${isZh ? '实际命令' : 'Actual command'}",
      "description": "${isZh ? '命令说明' : 'Command description'}",
      "notes": "${isZh ? '注意事项（可选）' : 'Notes (optional)'}"
    }
  ],
  "runSteps": [
    {
      "command": "${isZh ? '运行命令' : 'Run command'}",
      "description": "${isZh ? '命令说明' : 'Command description'}"
    }
  ],
  "verifySuccess": "${isZh ? '如何验证安装成功' : 'How to verify successful installation'}",
  "commonIssues": [
    {
      "problem": "${isZh ? '具体问题描述' : 'Specific problem description'}",
      "solution": "${isZh ? '解决方案' : 'Solution'}",
      "relatedCommand": "${isZh ? '相关命令（可选）' : 'Related command (optional)'}"
    }
  ],
  "tips": ["${isZh ? '额外提示' : 'Additional tips'}"]
}
\`\`\`

${isZh ? '要求' : 'Requirements'}:
1. ${isZh ? '所有命令必须来自 package.json scripts 或标准包管理器命令，不要编造' : 'All commands must come from package.json scripts or standard package manager commands, do not fabricate'}
2. ${isZh ? '前置要求必须具体（包含版本号）' : 'Prerequisites must be specific (include version numbers)'}
3. ${isZh ? '常见问题要基于项目类型和依赖推断真实可能遇到的问题' : 'Common issues should be inferred based on project type and dependencies for real possible problems'}
4. ${isZh ? '如果是 Node.js 项目，检测是使用 npm、yarn 还是 pnpm' : 'If it is a Node.js project, detect whether npm, yarn, or pnpm is used'}
5. ${isZh ? '输出语言必须是' : 'Output language must be'}: ${isZh ? '中文' : 'English'}
6. ${isZh ? '只输出 JSON，不要有其他内容' : 'Output only JSON, no other content'}
`.trim()
}

// 解析 AI 返回的 JSON
export function parseQuickStartResponse(response: string): QuickStartOutput | null {
  try {
    // 尝试从 markdown 代码块中提取 JSON
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim()
    
    const parsed = JSON.parse(jsonStr)
    
    // 验证必要字段
    if (!parsed.prerequisites || !parsed.installSteps || !parsed.runSteps) {
      console.warn('[QuickStart] Missing required fields in response')
      return null
    }
    
    return {
      prerequisites: parsed.prerequisites || [],
      installSteps: parsed.installSteps || [],
      runSteps: parsed.runSteps || [],
      verifySuccess: parsed.verifySuccess || '',
      commonIssues: parsed.commonIssues || [],
      tips: parsed.tips || []
    }
  } catch (error) {
    console.error('[QuickStart] Failed to parse response:', error)
    return null
  }
}

// 检测是否是一个可发布的 npm 包（用户安装使用，而非克隆源码开发）
function isPublishedPackage(context: ProjectContext): boolean {
  const pkg = context.packageJson
  if (!pkg) return false
  
  // 有 main/types/bin 字段，说明是可发布的包
  const hasEntryPoint = !!(pkg.main || pkg.bin)
  // 有 files 字段，说明定义了发布内容
  const hasFiles = !!(pkg as any).files
  // 有版本号且不是 0.0.0
  const hasVersion = !!(pkg.version && pkg.version !== '0.0.0')
  // 有 description
  const hasDescription = !!pkg.description
  
  return hasEntryPoint && hasVersion && (hasFiles || hasDescription)
}

// 从 README 中提取安装说明（暂未使用，保留以备后用）
// function extractInstallFromReadme(readme: string, packageName: string): string | null {
//   const patterns = [
//     new RegExp(`npm install ${packageName}`, 'i'),
//     new RegExp(`yarn add ${packageName}`, 'i'),
//     new RegExp(`pnpm add ${packageName}`, 'i'),
//   ]
//   for (const pattern of patterns) {
//     const match = readme.match(pattern)
//     if (match) return match[0]
//   }
//   return null
// }

// 生成 fallback 数据（基于实际项目信息）
export function createQuickStartFallback(context: ProjectContext, language: 'zh' | 'en'): QuickStartOutput {
  const pkg = context.packageJson
  const packageName = pkg?.name || context.name
  
  // 检测是否是 npm 包（用户安装使用）
  if (isPublishedPackage(context)) {
    return createNpmPackageFallback(context, language, packageName)
  }
  
  // 否则是项目源码（开发者克隆使用）
  return createDevProjectFallback(context, language)
}

// 为 npm 包生成快速上手（用户安装使用）
function createNpmPackageFallback(context: ProjectContext, language: 'zh' | 'en', packageName: string): QuickStartOutput {
  const isZh = language === 'zh'
  const pkg = context.packageJson
  const engines = pkg?.engines
  const nodeVersion = engines?.node || '>= 16.0.0'
  const readme = context.readme || ''
  
  // 检测是否是 CLI 工具
  const isCLI = !!(pkg?.bin)
  
  const installSteps: { command: string; description: string; notes?: string }[] = []
  
  if (isCLI) {
    // CLI 工具 - 全局安装
    installSteps.push({
      command: `npm install -g ${packageName}`,
      description: isZh ? '全局安装' : 'Install globally'
    })
  } else {
    // 库 - 作为依赖安装
    installSteps.push({
      command: `npm install ${packageName}`,
      description: isZh ? '安装到项目' : 'Install to project'
    })
  }
  
  // 尝试从 README 提取使用示例
  const runSteps: { command: string; description: string }[] = []
  
  // 检查 README 中的常见使用模式
  if (readme.includes('import ') || readme.includes('require(')) {
    runSteps.push({
      command: `import { ... } from '${packageName}'`,
      description: isZh ? '在代码中导入使用' : 'Import in your code'
    })
  }
  
  if (isCLI && pkg?.bin) {
    const binName = typeof pkg.bin === 'string' 
      ? packageName 
      : Object.keys(pkg.bin)[0]
    runSteps.push({
      command: `${binName} --help`,
      description: isZh ? '查看帮助' : 'View help'
    })
  }
  
  if (runSteps.length === 0) {
    runSteps.push({
      command: isZh ? '请参考 README 文档' : 'See README for usage',
      description: isZh ? '查看使用说明' : 'View documentation'
    })
  }
  
  return {
    prerequisites: [
      {
        name: 'Node.js',
        version: nodeVersion,
        required: true,
        installGuide: 'https://nodejs.org'
      }
    ],
    installSteps,
    runSteps,
    verifySuccess: isZh 
      ? '安装完成无报错即成功' 
      : 'No errors means success',
    commonIssues: [
      {
        problem: isZh ? '权限错误' : 'Permission error',
        solution: isZh ? '使用 sudo 或修复 npm 权限' : 'Use sudo or fix npm permissions'
      }
    ],
    tips: pkg?.description 
      ? [pkg.description]
      : undefined
  }
}

// 为开发项目生成快速上手（克隆源码开发）
function createDevProjectFallback(context: ProjectContext, language: 'zh' | 'en'): QuickStartOutput {
  const isZh = language === 'zh'
  const isNodeProject = ['react', 'vue', 'angular', 'nextjs', 'node', 'express', 'library', 'cli'].includes(context.projectType)
  const isPythonProject = ['python', 'django', 'flask'].includes(context.projectType)
  
  // 检测包管理器
  const hasYarnLock = context.directoryTree.includes('yarn.lock')
  const hasPnpmLock = context.directoryTree.includes('pnpm-lock')
  const hasBunLock = context.directoryTree.includes('bun.lockb')
  const packageManager = hasBunLock ? 'bun' : hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'npm'
  
  // 从实际 scripts 生成运行步骤
  const scripts = context.scripts || {}
  const runSteps: { command: string; description: string }[] = []
  
  // 智能选择运行命令（按优先级）
  const runScriptPriority = ['dev', 'start', 'serve', 'develop', 'watch']
  const buildScriptPriority = ['build', 'compile', 'dist']
  
  // 找到开发/启动命令
  for (const scriptName of runScriptPriority) {
    if (scripts[scriptName]) {
      const cmd = packageManager === 'npm' ? `npm run ${scriptName}` : `${packageManager} ${scriptName}`
      runSteps.push({
        command: cmd,
        description: isZh ? `启动开发 (${scriptName})` : `Start dev (${scriptName})`
      })
      break
    }
  }
  
  // 如果没找到开发命令，找构建命令
  if (runSteps.length === 0) {
    for (const scriptName of buildScriptPriority) {
      if (scripts[scriptName]) {
        const cmd = packageManager === 'npm' ? `npm run ${scriptName}` : `${packageManager} ${scriptName}`
        runSteps.push({
          command: cmd,
          description: isZh ? `构建 (${scriptName})` : `Build (${scriptName})`
        })
        break
      }
    }
  }
  
  if (isNodeProject) {
    const engines = context.packageJson?.engines
    const nodeVersion = engines?.node || '>= 16.0.0'
    const installCmd = packageManager === 'npm' ? 'npm install' : `${packageManager} install`
    
    return {
      prerequisites: [
        {
          name: 'Node.js',
          version: nodeVersion,
          required: true,
          installGuide: 'https://nodejs.org'
        }
      ],
      installSteps: [
        {
          command: `git clone https://github.com/${context.owner}/${context.name}.git`,
          description: isZh ? '克隆项目' : 'Clone'
        },
        {
          command: `cd ${context.name}`,
          description: isZh ? '进入目录' : 'Enter directory'
        },
        {
          command: installCmd,
          description: isZh ? '安装依赖' : 'Install dependencies'
        }
      ],
      runSteps: runSteps.length > 0 ? runSteps : [{
        command: `${packageManager} start`,
        description: isZh ? '启动' : 'Start'
      }],
      verifySuccess: isZh ? '无错误即成功' : 'No error means success',
      commonIssues: [],
      tips: Object.keys(scripts).length > 0 
        ? [isZh ? `可用脚本: ${Object.keys(scripts).join(', ')}` : `Scripts: ${Object.keys(scripts).join(', ')}`]
        : undefined
    }
  }
  
  if (isPythonProject) {
    return {
      prerequisites: [
        {
          name: 'Python',
          version: '>= 3.8',
          required: true,
          installGuide: 'https://python.org'
        },
        {
          name: 'pip',
          version: 'latest',
          required: true
        }
      ],
      installSteps: [
        {
          command: `git clone https://github.com/${context.owner}/${context.name}.git`,
          description: isZh ? '克隆项目' : 'Clone the project'
        },
        {
          command: `cd ${context.name}`,
          description: isZh ? '进入目录' : 'Enter directory'
        },
        {
          command: 'python -m venv venv && source venv/bin/activate',
          description: isZh ? '创建并激活虚拟环境' : 'Create and activate venv'
        },
        {
          command: 'pip install -r requirements.txt',
          description: isZh ? '安装依赖' : 'Install dependencies'
        }
      ],
      runSteps: [
        {
          command: 'python main.py',
          description: isZh ? '运行项目' : 'Run project'
        }
      ],
      verifySuccess: isZh ? '无错误即成功' : 'No error means success',
      commonIssues: []
    }
  }
  
  // 通用 fallback
  return {
    prerequisites: [
      {
        name: 'Git',
        version: 'latest',
        required: true
      }
    ],
    installSteps: [
      {
        command: `git clone https://github.com/${context.owner}/${context.name}.git`,
        description: isZh ? '克隆项目' : 'Clone the project'
      },
      {
        command: `cd ${context.name}`,
        description: isZh ? '进入目录' : 'Enter directory'
      }
    ],
    runSteps: [
      {
        command: isZh ? '参考 README' : 'See README',
        description: isZh ? '查看说明' : 'Check documentation'
      }
    ],
    verifySuccess: isZh ? '参考 README' : 'See README',
    commonIssues: []
  }
}
