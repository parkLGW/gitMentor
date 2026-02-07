// Service Worker for GitMentor
declare const chrome: any

console.log('[GitMentor SW] Service worker loaded!')

// Language type
type Language = 'zh' | 'en'

// Translations for analysis results
const translations = {
  zh: {
    fileSummary: '文件摘要',
    type: '类型',
    lines: '行数',
    imports: '导入',
    functions: '函数',
    classes: '类',
    interfacesTypes: '接口/类型',
    todosFound: '发现 $count 个 TODO/FIXME 注释',
    keyFunctions: '关键函数',
    classesLabel: '类',
    aiDeepAnalysis: 'AI 深度分析',
    usesLLM: '使用您配置的 LLM 进行详细分析',
    llmNotConfigured: 'LLM 未配置',
    configureApiKey: '要使用 AI 深度分析，请先配置您的 API 密钥',
    clickExtensionIcon: '点击 GitMentor 扩展图标',
    goToSettings: '进入设置标签页',
    enterApiKey: '输入您的 API 密钥 (OpenAI、Anthropic、DeepSeek 等)',
    saveAndRetry: '保存并重试',
    aiAnalysis: 'AI 分析',
    keyComponents: '关键组件',
    dependencies: '依赖',
    complexity: '复杂度',
    suggestions: '建议',
    askQuestion: '提问',
    askButton: '提问',
    fileType: '文件',
  },
  en: {
    fileSummary: 'File Summary',
    type: 'Type',
    lines: 'Lines',
    imports: 'Imports',
    functions: 'Functions',
    classes: 'Classes',
    interfacesTypes: 'Interfaces/Types',
    todosFound: 'Found $count TODO/FIXME comments',
    keyFunctions: 'Key Functions',
    classesLabel: 'Classes',
    aiDeepAnalysis: 'AI Deep Analysis',
    usesLLM: 'Uses your configured LLM for detailed analysis',
    llmNotConfigured: 'LLM Not Configured',
    configureApiKey: 'To use AI deep analysis, please configure your API key',
    clickExtensionIcon: 'Click the GitMentor extension icon',
    goToSettings: 'Go to Settings tab',
    enterApiKey: 'Enter your API key (OpenAI, Anthropic, DeepSeek, etc.)',
    saveAndRetry: 'Save and try again',
    aiAnalysis: 'AI Analysis',
    keyComponents: 'Key Components',
    dependencies: 'Dependencies',
    complexity: 'Complexity',
    suggestions: 'Suggestions',
    askQuestion: 'Ask a Question',
    askButton: 'Ask',
    fileType: 'file',
  },
}

function getAnalysisText(lang: Language, key: keyof typeof translations.en, vars?: Record<string, string | number>): string {
  let text = translations[lang][key]
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`$${k}`, String(v))
    })
  }
  return text
}

// LLM Configuration stored in chrome.storage
interface LLMConfig {
  provider: 'claude' | 'openai' | 'ollama' | 'deepseek' | 'lmstudio' | 'zhipu' | 'siliconflow'
  apiKey: string
  model?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

// Get LLM config from storage
async function getLLMConfig(): Promise<LLMConfig | null> {
  return new Promise((resolve) => {
    // 使用与 popup 相同的键名
    chrome.storage.local.get(['gitmentor_llm_config'], (result: any) => {
      resolve(result.gitmentor_llm_config || null)
    })
  })
}

// Safe JSON parse - handles markdown code blocks
function safeParseJSON(text: string): any {
  try {
    // Try direct parse first
    return JSON.parse(text)
  } catch {
    // Try to extract from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      let jsonStr = jsonMatch[1].trim()
      
      // Fix common JSON issues
      jsonStr = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      
      // Fix unescaped newlines in strings
      jsonStr = jsonStr.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
        return match
          .replace(/\r\n/g, '\\n')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\n')
          .replace(/\t/g, '\\t')
      })
      
      try {
        return JSON.parse(jsonStr)
      } catch (e) {
        console.error('[GitMentor SW] JSON parse failed after cleanup:', e)
        return null
      }
    }
    return null
  }
}

// Call LLM API
async function callLLM(config: LLMConfig, prompt: string): Promise<string> {
  let apiUrl: string
  let headers: Record<string, string>
  let body: any

  switch (config.provider) {
    case 'openai':
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }
      break

    case 'claude':
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: config.model || 'claude-3-haiku-20240307',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }
      break

    case 'deepseek':
      apiUrl = 'https://api.deepseek.com/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }
      break

    case 'siliconflow':
      apiUrl = 'https://api.siliconflow.cn/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model || 'Qwen/Qwen2.5-72B-Instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }
      break

    case 'zhipu':
      apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model || 'glm-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }
      break

    case 'ollama':
      apiUrl = config.baseUrl || 'http://localhost:11434/api/chat'
      headers = {
        'Content-Type': 'application/json',
      }
      body = {
        model: config.model || 'llama2',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }
      break

    case 'lmstudio':
      apiUrl = config.baseUrl || 'http://localhost:1234/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model || 'local-model',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }
      break

    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()

  // Extract content based on provider
  if (config.provider === 'claude') {
    return data.content?.[0]?.text || ''
  } else {
    return data.choices?.[0]?.message?.content || ''
  }
}

// Quick file analysis (pattern-based, no LLM)
function quickAnalyzeFile(fileName: string, fileContent: string, lang: Language = 'en'): string {
  const lines = fileContent.split('\n')
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  // Detect patterns
  const patterns = {
    imports: lines.filter(l => l.match(/^import\s|^from\s|^require\(/)).length,
    exports: lines.filter(l => l.match(/^export\s/)).length,
    functions: lines.filter(l => l.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(/)).length,
    classes: lines.filter(l => l.match(/^class\s+\w+/)).length,
    interfaces: lines.filter(l => l.match(/^interface\s+\w+|^type\s+\w+/)).length,
    comments: lines.filter(l => l.match(/^\s*\/\/|^\s*\/\*|^\s*\*/)).length,
    todos: lines.filter(l => l.match(/TODO|FIXME|HACK|XXX/i)).length,
  }
  
  // Extract key elements
  const functionNames = lines
    .map(l => l.match(/function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/))
    .filter(Boolean)
    .map(m => m![1] || m![2])
    .slice(0, 10)
  
  const classNames = lines
    .map(l => l.match(/^class\s+(\w+)/))
    .filter(Boolean)
    .map(m => m![1])
  
  // Build HTML response
  let html = `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'fileSummary')}</h3>
      <div style="font-size: 12px; color: #666; line-height: 1.6;">
        <div><strong>${getAnalysisText(lang, 'type')}:</strong> ${ext.toUpperCase()} ${getAnalysisText(lang, 'fileType')}</div>
        <div><strong>${getAnalysisText(lang, 'lines')}:</strong> ${lines.length}</div>
        <div><strong>${getAnalysisText(lang, 'imports')}:</strong> ${patterns.imports}</div>
        <div><strong>${getAnalysisText(lang, 'functions')}:</strong> ${patterns.functions}</div>
        ${patterns.classes > 0 ? `<div><strong>${getAnalysisText(lang, 'classes')}:</strong> ${patterns.classes}</div>` : ''}
        ${patterns.interfaces > 0 ? `<div><strong>${getAnalysisText(lang, 'interfacesTypes')}:</strong> ${patterns.interfaces}</div>` : ''}
      </div>
    </div>
  `
  
  if (functionNames.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'keyFunctions')}</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${functionNames.map(name => `<span style="background: #f0f2f5; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: monospace;">${name}</span>`).join('')}
        </div>
      </div>
    `
  }
  
  if (classNames.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'classesLabel')}</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${classNames.map(name => `<span style="background: #e8f4fd; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: monospace;">${name}</span>`).join('')}
        </div>
      </div>
    `
  }
  
  if (patterns.todos > 0) {
    html += `
      <div style="margin-bottom: 16px; padding: 8px; background: #fff8e6; border-radius: 4px;">
        <span style="font-size: 12px; color: #856404;">${getAnalysisText(lang, 'todosFound', { count: patterns.todos })}</span>
      </div>
    `
  }
  
  // Add deep analysis button
  html += `
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e1e4e8;">
      <button id="gitmentor-deep-analysis-btn" style="
        width: 100%;
        padding: 10px 16px;
        background: #24292e;
        color: white;
        border: 1px solid rgba(27, 31, 35, 0.15);
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      ">
        ${getAnalysisText(lang, 'aiDeepAnalysis')}
      </button>
      <p style="font-size: 11px; color: #666; margin-top: 8px; text-align: center;">
        ${getAnalysisText(lang, 'usesLLM')}
      </p>
    </div>
  `
  
  return html
}

// Deep file analysis with LLM
async function deepAnalyzeFile(config: LLMConfig, fileName: string, fileContent: string, lang: Language = 'en'): Promise<string> {
  const languageInstruction = lang === 'zh' 
    ? '请用中文回答，所有字段都应该是中文。' 
    : 'Please answer in English.'
  
  const prompt = `Analyze this source code file and provide a detailed explanation.

File: ${fileName}

\`\`\`
${fileContent.slice(0, 15000)}
\`\`\`

${languageInstruction}

Please provide analysis in the following JSON format:
{
  "purpose": "What this file does (1-2 sentences)",
  "keyComponents": [
    {"name": "ComponentName", "type": "function|class|interface|constant", "description": "Brief description"}
  ],
  "dependencies": ["List of key imports/dependencies"],
  "complexity": "low|medium|high",
  "suggestions": ["Any improvement suggestions"],
  "summary": "A brief summary paragraph for developers new to this codebase"
}

Important: Return ONLY the JSON object, no markdown code blocks or extra text.`

  const response = await callLLM(config, prompt)
  const analysis = safeParseJSON(response)
  
  if (!analysis) {
    throw new Error('Failed to parse AI response')
  }
  
  // Build HTML from analysis
  let html = `
    <div style="margin-bottom: 16px;">
      <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'aiAnalysis')}</h3>
      <p style="font-size: 13px; color: #444; line-height: 1.5; margin: 0;">${analysis.purpose || 'No purpose detected'}</p>
    </div>
  `
  
  if (analysis.keyComponents?.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 13px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'keyComponents')}</h4>
        <div style="space-y: 8px;">
          ${analysis.keyComponents.slice(0, 8).map((c: any) => `
            <div style="padding: 8px; background: #f6f8fa; border-radius: 4px; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-family: monospace; font-size: 12px; font-weight: 500; color: #0366d6;">${c.name}</span>
                <span style="font-size: 10px; padding: 1px 6px; background: #e1e4e8; border-radius: 3px; color: #666;">${c.type}</span>
              </div>
              <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">${c.description}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }
  
  if (analysis.dependencies?.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 13px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'dependencies')}</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${analysis.dependencies.slice(0, 10).map((d: string) => `<span style="background: #e8f4fd; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${d}</span>`).join('')}
        </div>
      </div>
    `
  }
  
  if (analysis.complexity) {
    const colors: Record<string, string> = {
      low: '#28a745',
      medium: '#ffc107',
      high: '#dc3545',
    }
    html += `
      <div style="margin-bottom: 16px;">
        <span style="font-size: 12px; color: #666;">${getAnalysisText(lang, 'complexity')}: </span>
        <span style="font-size: 12px; font-weight: 500; color: ${colors[analysis.complexity] || '#666'};">${analysis.complexity.toUpperCase()}</span>
      </div>
    `
  }
  
  if (analysis.summary) {
    html += `
      <div style="margin-bottom: 16px; padding: 12px; background: #f0f7ff; border-radius: 6px; border-left: 3px solid #0366d6;">
        <p style="font-size: 12px; color: #444; line-height: 1.5; margin: 0;">${analysis.summary}</p>
      </div>
    `
  }
  
  if (analysis.suggestions?.length > 0) {
    html += `
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 13px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'suggestions')}</h4>
        <ul style="margin: 0; padding-left: 16px; font-size: 12px; color: #666; line-height: 1.6;">
          ${analysis.suggestions.slice(0, 5).map((s: string) => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    `
  }
  
  // Add Q&A section
  html += `
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e1e4e8;">
      <h4 style="font-size: 13px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${getAnalysisText(lang, 'askQuestion')}</h4>
      <div style="display: flex; gap: 8px;">
        <input 
          type="text" 
          id="gitmentor-question-input"
          placeholder="${lang === 'zh' ? '关于此文件提问...' : 'Ask about this file...'}"
          style="
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            font-size: 12px;
            outline: none;
          "
        />
        <button 
          id="gitmentor-ask-btn"
          style="
            padding: 8px 16px;
            background: #24292e;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
          "
        >${getAnalysisText(lang, 'askButton')}</button>
      </div>
      <div id="gitmentor-qa-response" style="margin-top: 12px;"></div>
    </div>
  `
  
  return html
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
  console.log('[GitMentor SW] Received message:', message.action)
  
  const lang: Language = message.language === 'zh' ? 'zh' : 'en'
  
  if (message.action === 'analyzeFile') {
    // Quick analysis (no LLM)
    try {
      const html = quickAnalyzeFile(message.fileName, message.fileContent, lang)
      sendResponse({ html })
    } catch (error) {
      console.error('[GitMentor SW] Quick analysis error:', error)
      sendResponse({ error: error instanceof Error ? error.message : 'Analysis failed' })
    }
    return true
  }
  
  if (message.action === 'analyzeFileDeep') {
    // Deep analysis with LLM
    (async () => {
      try {
        const config = await getLLMConfig()
        if (!config) {
          sendResponse({ 
            error: 'LLM not configured. Please configure your API key in the GitMentor popup settings.',
            html: `
              <div style="padding: 16px; background: #fff8e6; border-radius: 6px; border: 1px solid #ffc107;">
                <p style="font-size: 13px; color: #856404; margin: 0 0 12px 0; font-weight: 500;">${getAnalysisText(lang, 'llmNotConfigured')}</p>
                <p style="font-size: 12px; color: #666; margin: 0 0 12px 0;">
                  ${getAnalysisText(lang, 'configureApiKey')}:
                </p>
                <ol style="font-size: 12px; color: #666; margin: 0; padding-left: 16px; line-height: 1.6;">
                  <li>${getAnalysisText(lang, 'clickExtensionIcon')}</li>
                  <li>${getAnalysisText(lang, 'goToSettings')}</li>
                  <li>${getAnalysisText(lang, 'enterApiKey')}</li>
                  <li>${getAnalysisText(lang, 'saveAndRetry')}</li>
                </ol>
              </div>
            `
          })
          return
        }
        
        const html = await deepAnalyzeFile(config, message.fileName, message.fileContent, lang)
        sendResponse({ html })
      } catch (error) {
        console.error('[GitMentor SW] Deep analysis error:', error)
        sendResponse({ 
          error: `AI Analysis Failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
        })
      }
    })()
    return true // Keep channel open for async response
  }
  
  if (message.action === 'askQuestion') {
    // Handle Q&A
    (async () => {
      try {
        const config = await getLLMConfig()
        if (!config) {
          sendResponse({ error: 'LLM not configured' })
          return
        }
        
        const prompt = `Based on this source code file, answer the following question.

File: ${message.fileName}

\`\`\`
${message.fileContent.slice(0, 10000)}
\`\`\`

Question: ${message.question}

Please provide a clear, concise answer. If the question cannot be answered from the code, say so.`

        const response = await callLLM(config, prompt)
        sendResponse({ answer: response })
      } catch (error) {
        console.error('[GitMentor SW] Q&A error:', error)
        sendResponse({ error: error instanceof Error ? error.message : 'Failed to get answer' })
      }
    })()
    return true
  }
  
  return false
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GitMentor SW] Extension installed')
})

chrome.tabs.onActivated.addListener(() => {
  console.log('[GitMentor SW] Tab activated')
})
