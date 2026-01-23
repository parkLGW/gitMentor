// Background service worker for GitMentor

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeFile') {
    analyzeFile(message.fileName, message.fileContent, false)
      .then((result) => {
        sendResponse({ html: result })
      })
      .catch((error) => {
        sendResponse({ error: error.message })
      })
    return true // Keep channel open for async response
  }
  
  if (message.action === 'analyzeFileDeep') {
    analyzeFile(message.fileName, message.fileContent, true)
      .then((result) => {
        sendResponse({ html: result })
      })
      .catch((error) => {
        sendResponse({ error: error.message })
      })
    return true // Keep channel open for async response
  }
})

async function analyzeFile(fileName, fileContent, forceDeepAnalysis = false) {
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
    
    // Try AI analysis first (or force if requested)
    let aiAnalysisError = null
    try {
      console.log('[GitMentor] Attempting AI analysis...', forceDeepAnalysis ? '(forced)' : '')
      const aiResult = await performAIAnalysis(fileName, fileContent, language)
      if (aiResult) {
        console.log('[GitMentor] AI analysis succeeded!')
        return aiResult
      }
      console.log('[GitMentor] AI analysis returned null (no config)')
      
      // If deep analysis was forced and AI returned null, show error
      if (forceDeepAnalysis) {
        throw new Error('AI provider not configured. Please set up an API key in Settings.')
      }
    } catch (aiError) {
      console.warn('[GitMentor] AI analysis failed:', aiError)
      aiAnalysisError = aiError
      
      // If deep analysis was forced, show the error
      if (forceDeepAnalysis) {
        throw aiError
      }
      console.log('[GitMentor] Falling back to basic analysis due to:', aiError instanceof Error ? aiError.message : aiError)
    }
    
    // Fallback to basic analysis (only if not forcing deep)
    if (forceDeepAnalysis) {
      throw new Error('Deep analysis requires AI configuration')
    }
    return generateBasicAnalysis(fileName, fileContent, language)
  } catch (error) {
    console.error('[GitMentor] Analysis error:', error)
    
    // If forcing deep analysis, return error message
    if (forceDeepAnalysis) {
      return `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">${escapeHtml(error.message)}</div>`
    }
    
    return generateBasicAnalysis(fileName, fileContent, 'en')
  }
}

async function performAIAnalysis(fileName, fileContent, language) {
  // Get saved LLM config from storage
  let config
  try {
    config = await new Promise((resolve, reject) => {
      chrome.storage.local.get('gitmentor_llm_config', (data) => {
        if (chrome.runtime.lastError) {
          console.error('[GitMentor] Storage error:', chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          console.log('[GitMentor] Storage data:', data)
          resolve(data.gitmentor_llm_config)
        }
      })
    })
  } catch (storageError) {
    console.error('[GitMentor] Failed to read from storage:', storageError)
    return null
  }
  
  console.log('[GitMentor] Config loaded:', config)
  
  if (!config) {
    console.log('[GitMentor] No config in storage at all')
    return null
  }
  
  if (!config.apiKey) {
    console.log('[GitMentor] Config exists but no apiKey:', config)
    return null
  }
  
  if (!config.provider) {
    console.log('[GitMentor] Config exists but no provider:', config)
    return null
  }
  
  console.log('[GitMentor] Using provider:', config.provider, 'with model:', config.model)
  
  // Prepare the AI prompt
  const prompt = language === 'zh' 
    ? `你是代码专家。分析这个真实的文件并提供详细理解，用于学习。

文件：${fileName}

内容：
${fileContent.substring(0, 10000)}

重要：包含行号（如需要可估计），专注于代码的理解和学习价值。

JSON：
{
  "fileOverview": "一句话：这个文件做什么",
  "difficulty": "beginner|intermediate|advanced",
  "keyTakeaway": "学习这段代码的关键洞察",
  "coreConcepts": [
    {
      "concept": "设计模式或关键概念名称",
      "explanation": "为什么这个概念在这个文件中很重要",
      "relatedLines": [10, 25, 30]
    }
  ],
  "codeFlow": [
    {
      "step": 1,
      "description": "首先发生什么",
      "lineNumber": 15,
      "functionName": "entryPoint"
    },
    {
      "step": 2,
      "description": "接下来发生什么",
      "lineNumber": 25,
      "functionName": "processData"
    }
  ],
  "functions": [
    {
      "name": "函数名或类名",
      "type": "function|class|export|constant",
      "lineNumber": 15,
      "description": "一句话描述",
      "complexity": "simple|moderate|complex",
      "purpose": "为什么存在，解决什么问题",
      "parameters": ["参数1: 类型", "参数2: 类型"],
      "returns": "返回类型和含义",
      "calls": ["helperFunction", "otherFunction"],
      "calledBy": ["mainFunction", "setup"]
    }
  ],
  "dependencies": ["./其他文件", "外部库"],
  "exports": ["导出1", "导出2"]
}`
    : `You are a code expert. Analyze THIS ACTUAL file and provide detailed understanding for learning.

FILE: ${fileName}

CONTENT:
${fileContent.substring(0, 10000)}

IMPORTANT: Include line numbers (estimate if needed) and focus on UNDERSTANDING and LEARNING, not just listing.

JSON:
{
  "fileOverview": "One sentence: what this file does",
  "difficulty": "beginner|intermediate|advanced",
  "keyTakeaway": "One key insight for someone learning this code",
  "coreConcepts": [
    {
      "concept": "Design pattern or key concept name",
      "explanation": "Why this concept matters in this file",
      "relatedLines": [10, 25, 30]
    }
  ],
  "codeFlow": [
    {
      "step": 1,
      "description": "What happens first",
      "lineNumber": 15,
      "functionName": "entryPoint"
    },
    {
      "step": 2,
      "description": "What happens next",
      "lineNumber": 25,
      "functionName": "processData"
    }
  ],
  "functions": [
    {
      "name": "functionName or ClassName",
      "type": "function|class|export|constant",
      "lineNumber": 15,
      "description": "One sentence description",
      "complexity": "simple|moderate|complex",
      "purpose": "Why this exists and what problem it solves",
      "parameters": ["param1: type", "param2: type"],
      "returns": "return type and what it means",
      "calls": ["helperFunction", "otherFunction"],
      "calledBy": ["mainFunction", "setup"]
    }
  ],
  "dependencies": ["./other-file", "external-lib"],
  "exports": ["exported1", "exported2"]
}`
  
  // Call the appropriate LLM provider
  try {
    let response
    
    console.log('[GitMentor] Calling provider:', config.provider)
    
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
      console.log('[GitMentor] Empty response from provider')
      return null
    }
    
    console.log('[GitMentor] Got response, parsing...')
    
    // Parse and generate HTML
    const jsonStr = extractJSON(response)
    console.log('[GitMentor] Extracted JSON length:', jsonStr.length)
    
    const analysis = JSON.parse(jsonStr)
    console.log('[GitMentor] Parsed analysis, generating HTML...')
    
    const html = generateAnalysisHTML(analysis, language)
    console.log('[GitMentor] Analysis complete!')
    return html
  } catch (error) {
    console.error('[GitMentor] AI API error:', error)
    console.error('[GitMentor] Error stack:', error.stack)
    console.error('[GitMentor] Full error:', error.toString())
    
    // Return error message to user instead of null
    const errorMsg = error instanceof Error ? error.message : String(error)
    throw new Error(`AI Analysis Failed: ${errorMsg}`)
  }
}

async function callOpenAI(prompt, apiKey, model) {
  try {
    console.log('[GitMentor] OpenAI: Calling API with model:', model || 'gpt-3.5-turbo')
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
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
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    console.log('[GitMentor] OpenAI: Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[GitMentor] OpenAI API error:', response.status, errorText.substring(0, 500))
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    console.log('[GitMentor] OpenAI: Got response, length:', content?.length)
    if (!content) {
      console.error('[GitMentor] OpenAI: Empty content in response:', data)
      throw new Error('OpenAI returned empty response')
    }
    return content
  } catch (error) {
    console.error('[GitMentor] OpenAI call failed:', error.message)
    throw error
  }
}

async function callClaude(prompt, apiKey, model) {
  try {
    console.log('[GitMentor] Claude: Calling API with model:', model || 'claude-3-sonnet-20240229')
    console.log('[GitMentor] Claude: API Key starts with:', apiKey.substring(0, 10) + '...')
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
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
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    console.log('[GitMentor] Claude: Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[GitMentor] Claude API error:', response.status)
      console.error('[GitMentor] Claude error response:', errorText.substring(0, 1000))
      
      // Parse error message
      let errorMsg = `HTTP ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) errorMsg = errorJson.error.message
        else if (errorJson.message) errorMsg = errorJson.message
      } catch (e) {
        errorMsg = errorText.substring(0, 200)
      }
      
      throw new Error(`Claude: ${errorMsg}`)
    }
    
    const data = await response.json()
    const content = data.content?.[0]?.text
    console.log('[GitMentor] Claude: Got response, length:', content?.length)
    if (!content) {
      console.error('[GitMentor] Claude: Empty content in response:', data)
      throw new Error('Claude returned empty response')
    }
    return content
  } catch (error) {
    console.error('[GitMentor] Claude call failed:', error.message)
    throw error
  }
}

async function callDeepSeek(prompt, apiKey, model) {
  try {
    console.log('[GitMentor] DeepSeek: Calling API with model:', model || 'deepseek-chat')
    console.log('[GitMentor] DeepSeek: API Key starts with:', apiKey.substring(0, 10) + '...')
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
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
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    console.log('[GitMentor] DeepSeek: Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[GitMentor] DeepSeek API error:', response.status)
      console.error('[GitMentor] DeepSeek error response:', errorText.substring(0, 1000))
      
      // Parse error message
      let errorMsg = `HTTP ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.detail) errorMsg = errorJson.detail
        else if (errorJson.message) errorMsg = errorJson.message
        else if (errorJson.error) errorMsg = errorJson.error
      } catch (e) {
        errorMsg = errorText.substring(0, 200)
      }
      
      throw new Error(`DeepSeek: ${errorMsg}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    console.log('[GitMentor] DeepSeek: Got response, length:', content?.length)
    if (!content) {
      console.error('[GitMentor] DeepSeek: Empty content in response:', data)
      throw new Error('DeepSeek returned empty response')
    }
    return content
  } catch (error) {
    console.error('[GitMentor] DeepSeek call failed:', error.message)
    throw error
  }
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
  console.log('[GitMentor] Using basic analysis mode for:', fileName)
  
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
    quickAnalysis: '⚡ 快速分析',
    deepAnalysis: '🤖 深度分析',
  } : {
    overview: 'File Overview',
    functions: 'Functions & Classes',
    difficulty: 'Difficulty',
    noFunctions: 'No functions detected',
    quickAnalysis: '⚡ Quick Analysis',
    deepAnalysis: '🤖 Deep Analysis',
  }
  
  let html = `<div style="padding: 8px; background: #f0f2f5; border-radius: 4px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;"><p style="margin: 0; font-size: 10px; color: #666; font-weight: 600;">${labels.quickAnalysis}</p><button id="gitmentor-deep-analysis-btn" style="padding: 4px 8px; font-size: 10px; background: #0366d6; color: white; border: none; border-radius: 3px; cursor: pointer;">${labels.deepAnalysis}</button></div>`
  
  html += `<div style="padding: 8px; background: #f6f8fa; border-radius: 4px; margin-bottom: 12px;"><p style="margin: 0; font-size: 11px; color: #666; word-break: break-word;">📄 ${escapeHtml(fileName)}</p></div>`
  
  if (functions.length === 0) {
    html += `<p style="color: #999; font-size: 11px;">${labels.noFunctions}</p>`
  } else {
    html += `<div style="margin-bottom: 12px;"><p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">${labels.functions} (${functions.length})</p><div style="space-y: 4px;">`
    
    for (const func of functions.slice(0, 15)) {
      html += `<div style="padding: 6px; background: #f6f8fa; border-radius: 3px; margin-bottom: 4px; border-left: 2px solid #0366d6;"><code style="font-size: 11px; color: #0366d6; font-weight: 500;">${escapeHtml(func.name)}</code></div>`
    }
    
    html += `</div></div>`
  }
  
  return html
}

function generateAnalysisHTML(analysis, language) {
  let html = ''
  const labels = language === 'zh' ? {
    overview: '文件概览',
    difficulty: '难度',
    keyTakeaway: '关键要点',
    coreConcepts: '核心概念',
    codeFlow: '代码执行流',
    functions: '函数和类',
    clickToHighlight: '点击可定位到代码行',
    lineNumber: '行',
    calls: '调用',
    calledBy: '被调用',
    deepAnalysis: '🔍 深度分析',
    backToQuick: '⚡ 快速分析',
  } : {
    overview: 'File Overview',
    difficulty: 'Difficulty',
    keyTakeaway: 'Key Takeaway',
    coreConcepts: 'Core Concepts',
    codeFlow: 'Code Execution Flow',
    functions: 'Functions & Classes',
    clickToHighlight: 'Click to highlight in code',
    lineNumber: 'line',
    calls: 'calls',
    calledBy: 'called by',
    deepAnalysis: '🔍 Deep Analysis',
    backToQuick: '⚡ Quick Analysis',
  }
  
  // Header with back button
  html += `<div style="padding: 8px; background: #f0f2f5; border-radius: 4px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;"><p style="margin: 0; font-size: 10px; color: #666; font-weight: 600;">${labels.deepAnalysis}</p><button id="gitmentor-back-to-quick-btn" style="padding: 4px 8px; font-size: 10px; background: #6f42c1; color: white; border: none; border-radius: 3px; cursor: pointer;">${labels.backToQuick}</button></div>`
  
  // File overview
  if (analysis.fileOverview) {
    html += `<div style="padding: 12px; background: #f0f2f5; border-radius: 4px; margin-bottom: 12px;"><p style="margin: 0; font-size: 12px; font-weight: 600; color: #24292e;">${escapeHtml(analysis.fileOverview)}</p></div>`
  }
  
  // Difficulty & Key Takeaway
  if (analysis.difficulty || analysis.keyTakeaway) {
    const diffColor = analysis.difficulty === 'beginner' ? '#28a745' : 
                     analysis.difficulty === 'intermediate' ? '#ffc107' : '#dc3545'
    html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">`
    
    if (analysis.difficulty) {
      html += `<div style="padding: 8px; background: ${diffColor}20; border-radius: 4px; border-left: 2px solid ${diffColor};"><p style="margin: 0; font-size: 11px; color: ${diffColor};"><strong>${labels.difficulty}:</strong> ${analysis.difficulty}</p></div>`
    }
    
    if (analysis.keyTakeaway) {
      html += `<div style="padding: 8px; background: #e7f5ff; border-radius: 4px; border-left: 2px solid #0366d6;"><p style="margin: 0; font-size: 11px; color: #0366d6;"><strong>💡:</strong> ${escapeHtml(analysis.keyTakeaway)}</p></div>`
    }
    
    html += `</div>`
  }
  
  // Core Concepts (Learning Guide - C)
  if (analysis.coreConcepts && analysis.coreConcepts.length > 0) {
    html += `<div style="border-bottom: 1px solid #e1e4e8; margin-bottom: 12px; padding-bottom: 12px;"><p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">📚 ${labels.coreConcepts}</p><div style="space-y: 6px;">`
    
    for (const concept of analysis.coreConcepts.slice(0, 3)) {
      html += `<div style="padding: 8px; background: #fff8e1; border-left: 2px solid #ffc107; border-radius: 3px; margin-bottom: 6px;"><p style="margin: 0; font-size: 11px; font-weight: 600; color: #664d03;">${escapeHtml(concept.concept)}</p><p style="margin: 4px 0 0 0; font-size: 11px; color: #856404;">${escapeHtml(concept.explanation)}</p>${concept.relatedLines ? `<p style="margin: 4px 0 0 0; font-size: 10px; color: #999;">📍 ${labels.lineNumber}: ${concept.relatedLines.join(', ')}</p>` : ''}</div>`
    }
    
    html += `</div></div>`
  }
  
  // Code Flow (Interactive Code Map - B)
  if (analysis.codeFlow && analysis.codeFlow.length > 0) {
    html += `<div style="border-bottom: 1px solid #e1e4e8; margin-bottom: 12px; padding-bottom: 12px;"><p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">🔄 ${labels.codeFlow} <span style="font-size: 10px; color: #999;">(${labels.clickToHighlight})</span></p><div style="space-y: 4px;">`
    
    for (const step of analysis.codeFlow) {
      html += `<div style="padding: 8px; background: #f6f8fa; border-left: 3px solid #0366d6; border-radius: 3px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" onclick="console.log('Line: ${step.lineNumber}')"><div style="display: flex; align-items: baseline; gap: 8px;"><span style="font-size: 11px; font-weight: 600; color: #0366d6; min-width: 20px;">${step.step}.</span><div style="flex: 1;"><p style="margin: 0; font-size: 11px; color: #24292e;">${escapeHtml(step.description)}</p><p style="margin: 2px 0 0 0; font-size: 10px; color: #666;"><code>${escapeHtml(step.functionName)}</code> <span style="color: #999;">${labels.lineNumber} ${step.lineNumber}</span></p></div></div></div>`
    }
    
    html += `</div></div>`
  }
  
  // Functions (Interactive Map - B)
  if (analysis.functions && analysis.functions.length > 0) {
    html += `<div><p style="font-size: 12px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">⚙️ ${labels.functions}</p><div style="space-y: 4px;">`
    
    for (const func of analysis.functions.slice(0, 12)) {
      const complexColor = func.complexity === 'simple' ? '#28a745' : 
                          func.complexity === 'moderate' ? '#ffc107' : '#dc3545'
      html += `<div style="padding: 8px; background: #f6f8fa; border-left: 2px solid #0366d6; border-radius: 3px; margin-bottom: 6px; cursor: pointer;" onclick="console.log('Jump to: ${func.name} line ${func.lineNumber}')"><div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;"><div style="flex: 1; min-width: 0;"><code style="font-size: 11px; color: #0366d6; font-weight: 500; word-break: break-word;">${escapeHtml(func.name)}</code><p style="margin: 2px 0 0 0; font-size: 10px; color: #999;">${labels.lineNumber} ${func.lineNumber} • ${func.complexity}</p><p style="margin: 3px 0 0 0; font-size: 11px; color: #24292e;">${escapeHtml(func.purpose || func.description)}</p>${func.calls && func.calls.length > 0 ? `<p style="margin: 3px 0 0 0; font-size: 10px; color: #666;">↳ ${labels.calls}: ${escapeHtml(func.calls.join(', '))}</p>` : ''}${func.calledBy && func.calledBy.length > 0 ? `<p style="margin: 1px 0 0 0; font-size: 10px; color: #666;">↤ ${labels.calledBy}: ${escapeHtml(func.calledBy.join(', '))}</p>` : ''}</div><span style="font-size: 10px; padding: 2px 6px; background: ${complexColor}20; color: ${complexColor}; border-radius: 3px; white-space: nowrap;">${func.complexity}</span></div></div>`
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
