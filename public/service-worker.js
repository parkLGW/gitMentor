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
    // Get language from Chrome storage or default to English
    // (Service Worker doesn't have navigator object)
    let language = 'en'
    
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get('gitmentor_language', (data) => {
          resolve(data.gitmentor_language || 'en')
        })
      })
      language = result
    } catch (e) {
      // Fallback to English if storage not available
      language = 'en'
    }
    
    // For now, just use basic analysis
    // AI analysis requires the llmManager which needs the popup context
    return generateBasicAnalysis(fileName, fileContent, language)
  } catch (error) {
    console.error('[GitMentor] Analysis error:', error)
    return generateBasicAnalysis(fileName, fileContent, 'en')
  }
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
