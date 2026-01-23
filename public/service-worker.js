// Background service worker for GitMentor

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeFile') {
    analyzeFile(message.fileName, message.fileContent)
      .then((result) => {
        sendResponse({ html: result })
      })
      .catch((error) => {
        sendResponse({ error: error.message })
      })
    return true // Keep channel open for async response
  }
})

async function analyzeFile(fileName, fileContent) {
  try {
    // Get language from Chrome storage
    let language = 'en'
    
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get('gitmentor_language', (data) => {
          resolve(data.gitmentor_language || 'en')
        })
      })
      language = result
    } catch (e) {
      console.error('[GitMentor] Failed to get language:', e)
      language = 'en'
    }
    
    // Try AI analysis first
    try {
      const aiResult = await performAIAnalysis(fileName, fileContent, language)
      if (aiResult) {
        return aiResult
      }
    } catch (aiError) {
      console.warn('[GitMentor] AI analysis failed, falling back to basic:', aiError)
    }
    
    // Fallback to basic analysis
    return generateBasicAnalysis(fileName, fileContent, language)
  } catch (error) {
    console.error('[GitMentor] Analysis error:', error)
    return generateBasicAnalysis(fileName, fileContent, 'en')
  }
}

async function performAIAnalysis(fileName, fileContent, language) {
  // Get saved LLM config from storage
  const config = await new Promise((resolve) => {
    chrome.storage.local.get('gitmentor_llm_config', (data) => {
      resolve(data.gitmentor_llm_config)
    })
  })
  
  if (!config || !config.apiKey || !config.provider) {
    console.log('[GitMentor] No AI provider configured')
    return null
  }
  
  // Prepare the AI prompt
  const prompt = language === 'zh' 
    ? `你是代码专家。分析这个真实的文件并提供详细理解。

文件：${fileName}

内容：
${fileContent.substring(0, 10000)}

提供简洁、可操作的分析：
- 一句话：这个文件做什么
- 列出所有函数/类/导出及说明
- 识别导入/依赖
- 评估每个函数的复杂度
- 建议理解难度
- 给出学习要点

JSON：
{
  "fileOverview": "一句话：这个文件做什么",
  "functions": [
    {
      "name": "函数名或类名",
      "type": "function|class|export|constant",
      "description": "它做什么（一句话）",
      "complexity": "simple|moderate|complex",
      "parameters": ["参数1", "参数2"],
      "returns": "返回类型或描述"
    }
  ],
  "dependencies": ["./其他文件", "外部库"],
  "exports": ["导出1", "导出2"],
  "difficulty": "beginner|intermediate|advanced",
  "keyTakeaway": "关于这个文件最重要的理解"
}`
    : `You are a code expert. Analyze THIS ACTUAL file and provide detailed understanding.

FILE: ${fileName}

CONTENT:
${fileContent.substring(0, 10000)}

Provide concise, actionable analysis:
- One-liner overview of what this file does
- List all functions/classes/exports with descriptions
- Identify imports/dependencies
- Rate complexity for each function
- Suggest difficulty level for understanding
- Give key takeaway for learning

JSON:
{
  "fileOverview": "One sentence: what this file does",
  "functions": [
    {
      "name": "functionName or ClassName",
      "type": "function|class|export|constant",
      "description": "What it does in one sentence",
      "complexity": "simple|moderate|complex",
      "parameters": ["param1", "param2"],
      "returns": "return type or description"
    }
  ],
  "dependencies": ["./other-file", "external-lib"],
  "exports": ["exported1", "exported2"],
  "difficulty": "beginner|intermediate|advanced",
  "keyTakeaway": "The most important thing to understand about this file"
}`
  
  // Call the appropriate LLM provider
  try {
    let response
    
    if (config.provider === 'openai') {
      response = await callOpenAI(prompt, config.apiKey, config.model)
    } else if (config.provider === 'claude') {
      response = await callClaude(prompt, config.apiKey, config.model)
    } else if (config.provider === 'deepseek') {
      response = await callDeepSeek(prompt, config.apiKey, config.model)
    } else {
      console.log('[GitMentor] Unsupported provider:', config.provider)
      return null
    }
    
    if (!response) {
      return null
    }
    
    // Parse and generate HTML
    const analysis = JSON.parse(extractJSON(response))
    return generateAnalysisHTML(analysis, language)
  } catch (error) {
    console.error('[GitMentor] AI API error:', error)
    return null
  }
}

async function callOpenAI(prompt, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.choices[0]?.message?.content || null
}

async function callClaude(prompt, apiKey, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.content[0]?.text || null
}

async function callDeepSeek(prompt, apiKey, model) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.choices[0]?.message?.content || null
}

function extractJSON(text) {
  // Try to extract JSON from markdown code block or plain text
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    return jsonMatch[1].trim()
  }
  
  // Try to find JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    return objectMatch[0]
  }
  
  return text.trim()
}

function generateBasicAnalysis(fileName, fileContent, language) {
  // Extract functions/classes from content using regex
  const functions = []
  const seen = new Set()
  
  // Simple regex patterns for common patterns
  const functionPatterns = [
    /^(export\s+)?(async\s+)?function\s+(\w+)/gm,
    /^(export\s+)?class\s+(\w+)/gm,
    /^(export\s+)?(const|let|var)\s+(\w+)\s*=/gm,
  ]
  
  for (const pattern of functionPatterns) {
    let match
    while ((match = pattern.exec(fileContent)) !== null) {
      const name = match[3] || match[2] || match[1]
      if (name && !seen.has(name) && functions.length < 20) {
        seen.add(name)
        functions.push({
          name: name,
          type: pattern.source.includes('class') ? 'class' : 'function',
          description: 'Function or variable',
          complexity: 'moderate',
        })
      }
    }
  }
  
  const labels = language === 'zh' ? {
    overview: '文件概览',
    functions: '函数和类',
    difficulty: '难度',
    noFunctions: '未检测到函数',
    basicMode: 'ℹ️ 基础分析模式（AI 未配置）',
  } : {
    overview: 'File Overview',
    functions: 'Functions & Classes',
    difficulty: 'Difficulty',
    noFunctions: 'No functions detected',
    basicMode: 'ℹ️ Basic analysis mode (AI not configured)',
  }
  
  let html = `<div style="padding: 12px; background: #f0f2f5; border-radius: 4px; margin-bottom: 12px;"><p style="margin: 0; font-size: 11px; color: #666; margin-bottom: 4px;">📄 ${labels.overview}</p><code style="font-size: 11px; color: #24292e; word-break: break-all;">${escapeHtml(fileName)}</code></div>`
  
  if (functions.length === 0) {
    html += `<p style="color: #666; font-size: 12px;">${labels.noFunctions}</p>`
  } else {
    html += `<div style="margin-bottom: 12px;"><p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0;">${labels.functions}</p><div>`
    
    for (const func of functions.slice(0, 15)) {
      html += `<div style="padding: 8px; background: #f6f8fa; border-radius: 4px; margin-bottom: 4px; border-left: 2px solid #0366d6;"><code style="font-size: 11px; color: #0366d6; font-weight: 500;">${escapeHtml(func.name)}</code><div style="font-size: 11px; color: #666; margin-top: 2px;">${escapeHtml(func.description)}</div></div>`
    }
    
    html += `</div></div>`
  }
  
  html += `<div style="padding: 8px; background: #fff3cd; border-radius: 4px; border-left: 2px solid #ffc107;"><p style="margin: 0; font-size: 11px; color: #856404;">${labels.basicMode}</p></div>`
  
  return html
}

function generateAnalysisHTML(analysis, language) {
  let html = ''
  
  // File overview
  if (analysis.fileOverview) {
    html += `
      <div style="padding: 12px; background: #f0f2f5; border-radius: 4px; margin-bottom: 12px;">
        <p style="margin: 0; font-size: 12px; font-weight: 600; color: #24292e;">${analysis.fileOverview}</p>
      </div>
    `
  }
  
  // Difficulty
  if (analysis.difficulty) {
    const diffColor = analysis.difficulty === 'beginner' ? '#28a745' : 
                     analysis.difficulty === 'intermediate' ? '#ffc107' : '#dc3545'
    html += `
      <div style="padding: 8px; background: ${diffColor}20; border-radius: 4px; margin-bottom: 12px; border-left: 2px solid ${diffColor};">
        <p style="margin: 0; font-size: 11px; color: ${diffColor};">
          Difficulty: <strong>${analysis.difficulty}</strong>
        </p>
      </div>
    `
  }
  
  // Functions
  if (analysis.functions && analysis.functions.length > 0) {
    html += `
      <div style="margin-bottom: 12px;">
        <p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0;">Functions & Classes</p>
        <div style="space-y: 4px;">
    `
    
    for (const func of analysis.functions.slice(0, 15)) {
      const complexColor = func.complexity === 'simple' ? '#28a745' : 
                          func.complexity === 'moderate' ? '#ffc107' : '#dc3545'
      html += `
        <div style="padding: 8px; background: #f6f8fa; border-radius: 4px; margin-bottom: 4px; border-left: 2px solid #0366d6;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <code style="font-size: 11px; color: #0366d6; font-weight: 500;">${escapeHtml(func.name)}</code>
            <span style="font-size: 10px; padding: 2px 6px; background: ${complexColor}20; color: ${complexColor}; border-radius: 3px;">
              ${func.complexity}
            </span>
          </div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">${escapeHtml(func.description)}</div>
        </div>
      `
    }
    
    html += `</div></div>`
  }
  
  return html
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}
