// Content script for injecting GitMentor floating widget on GitHub pages
import type { DeepFileAnalysisResult } from '@/types/learning'

const STORAGE_KEYS = {
  language: 'gitmentor_language',
  legacyLanguage: 'language',
} as const

// Track current file path to detect changes
let currentFilePath: string | null = null
let currentLanguage: 'zh' | 'en' = 'en'

// Get current language from storage
async function getLanguage(): Promise<'zh' | 'en'> {
  try {
    if (!isExtensionContextValid()) return 'en'
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.language,
      STORAGE_KEYS.legacyLanguage,
    ])
    return result[STORAGE_KEYS.language] || result[STORAGE_KEYS.legacyLanguage] || 'en'
  } catch (e) {
    console.warn('[GitMentor] Could not get language:', e)
    return 'en'
  }
}

// Translations for sidebar UI
const uiTranslations = {
  zh: {
    readyToAnalyze: '准备分析',
    clickToAnalyze: '点击下方按钮开始使用 AI 分析此文件',
    startAnalysis: '开始分析',
    requiresLLMConfig: '需要在设置中配置 LLM',
    analyzingFile: '正在分析文件...',
    deepAnalysisInProgress: '正在进行 AI 深度分析...',
    mayTakeMoment: '这可能需要一点时间',
    deepAnalysisFailed: '深度分析失败',
    thinking: '思考中...',
  },
  en: {
    readyToAnalyze: 'Ready to Analyze',
    clickToAnalyze: 'Click the button below to start analyzing this file with AI',
    startAnalysis: 'Start Analysis',
    requiresLLMConfig: 'Requires LLM configuration in settings',
    analyzingFile: 'Analyzing file...',
    deepAnalysisInProgress: 'Performing deep analysis with AI...',
    mayTakeMoment: 'This may take a moment',
    deepAnalysisFailed: 'Deep analysis failed',
    thinking: 'Thinking...',
  },
}

type UITranslationKey = keyof typeof uiTranslations.en

function getText(key: UITranslationKey) {
  return uiTranslations[currentLanguage][key]
}

// Save language preference
function detectAndSaveLanguage() {
  try {
    if (!isExtensionContextValid()) return
    const language = navigator.language?.startsWith('zh') ? 'zh' : 'en'
    chrome.storage.local.set({ [STORAGE_KEYS.language]: language })
    currentLanguage = language
  } catch (e) {
    console.warn('[GitMentor] Could not save language preference:', e)
  }
}

interface FileInfo {
  owner: string
  repo: string
  branch: string
  path: string
}

function parseFileUrl(): FileInfo | null {
  // Match: /owner/repo/blob/branch/path/to/file.ext
  const match = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/)
  if (!match) return null
  
  const [, owner, repo, branch, path] = match
  return { owner, repo, branch, path }
}

function isCodeFile(filePath: string): boolean {
  // List of code file extensions
  const codeExtensions = [
    'js', 'ts', 'tsx', 'jsx',
    'py', 'pyc', 'pyw',
    'java', 'class', 'jar',
    'cs', 'cpp', 'c', 'h', 'hpp',
    'go', 'rs', 'rb', 'php',
    'swift', 'kt', 'scala', 'groovy',
    'sql', 'sh', 'bash', 'zsh',
    'html', 'htm', 'xml', 'css', 'scss', 'less',
    'json', 'yaml', 'yml', 'toml', 'ini', 'conf',
    'vue', 'svelte',
    'r', 'R',
    'pl', 'lua',
  ]
  
  // List of non-code file extensions to skip
  const nonCodeExtensions = [
    'md', 'markdown', 'txt', 'text',
    'rst', 'adoc', 'asciidoc',
    'pdf', 'doc', 'docx', 'odt',
    'xls', 'xlsx', 'csv',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
    'mp3', 'mp4', 'webm', 'mov',
    'zip', 'tar', 'gz', 'rar',
  ]
  
  // Get file extension
  const match = filePath.match(/\.([^.]+)$/)
  if (!match) return true // If no extension, assume it's code
  
  const ext = match[1].toLowerCase()
  
  // If explicitly a non-code file, skip
  if (nonCodeExtensions.includes(ext)) {
    console.log('[GitMentor] Skipping non-code file:', filePath, 'extension:', ext)
    return false
  }
  
  // If it's a known code extension, show sidebar
  if (codeExtensions.includes(ext)) {
    return true
  }
  
  // For unknown extensions, be conservative and show sidebar
  return true
}

async function injectFileSidebar() {
  // Load current language
  currentLanguage = await getLanguage()
  
  const fileInfo = parseFileUrl()
  if (!fileInfo) {
    // Not on a file page, remove sidebar if exists
    const existingSidebar = document.getElementById('gitmentor-file-sidebar')
    if (existingSidebar) {
      existingSidebar.remove()
      currentFilePath = null
    }
    return
  }
  
  // Check if this is a code file
  if (!isCodeFile(fileInfo.path)) {
    console.log('[GitMentor] Not a code file, skipping sidebar injection:', fileInfo.path)
    // Remove existing sidebar if switching to non-code file
    const existingSidebar = document.getElementById('gitmentor-file-sidebar')
    if (existingSidebar) {
      existingSidebar.remove()
      currentFilePath = null
    }
    return
  }
  
  console.log('[GitMentor] Detected code file:', fileInfo.path)
  
  // Check if sidebar already exists for the same file
  if (document.getElementById('gitmentor-file-sidebar') && currentFilePath === fileInfo.path) {
    console.log('[GitMentor] File sidebar already exists for:', fileInfo.path)
    return
  }
  
  // If sidebar exists but file changed, remove it
  if (document.getElementById('gitmentor-file-sidebar') && currentFilePath !== fileInfo.path) {
    console.log('[GitMentor] File changed from', currentFilePath, 'to', fileInfo.path, ', updating sidebar')
    document.getElementById('gitmentor-file-sidebar')?.remove()
  }
  
  // Update current file path
  currentFilePath = fileInfo.path
  
  // Create sidebar container
  const sidebar = document.createElement('div')
  sidebar.id = 'gitmentor-file-sidebar'
  sidebar.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 380px;
    height: 100vh;
    background: white;
    border-left: 1px solid #e1e4e8;
    z-index: 5000;
    overflow-y: auto;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  `
  
  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid #e1e4e8;
    position: sticky;
    top: 0;
    background: #f6f8fa;
    z-index: 100;
  `
  header.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="font-size: 14px; font-weight: 600;">📚 GitMentor</div>
      <button id="gitmentor-sidebar-close" style="
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        padding: 0;
      ">×</button>
    </div>
    <div style="font-size: 12px; color: #666; margin-top: 8px; word-break: break-all;">
      ${fileInfo.path}
    </div>
  `
  
  // Content area - 默认显示开始分析按钮
  const content = document.createElement('div')
  content.id = 'gitmentor-file-content'
  content.style.cssText = `
    padding: 16px;
    font-size: 13px;
    color: #24292e;
  `
  
  // 默认显示开始分析界面
  content.innerHTML = `
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
      <h3 style="font-size: 16px; font-weight: 600; margin: 0 0 8px 0; color: #24292e;">
        ${getText('readyToAnalyze')}
      </h3>
      <p style="font-size: 13px; color: #666; margin: 0 0 20px 0; line-height: 1.5;">
        ${getText('clickToAnalyze')}
      </p>
      <button id="gitmentor-start-analysis-btn" style="
        width: 100%;
        padding: 12px 20px;
        background: #24292e;
        color: white;
        border: 1px solid rgba(27, 31, 35, 0.15);
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      ">
        ${getText('startAnalysis')}
      </button>
      <p style="font-size: 11px; color: #999; margin-top: 12px;">
        ${getText('requiresLLMConfig')}
      </p>
    </div>
  `
  
  sidebar.appendChild(header)
  sidebar.appendChild(content)
  document.body.appendChild(sidebar)
  
  // Close button
  const closeBtn = header.querySelector('#gitmentor-sidebar-close')
  closeBtn?.addEventListener('click', () => {
    sidebar.remove()
  })
  
  // Start analysis button
  const startAnalysisBtn = content.querySelector('#gitmentor-start-analysis-btn')
  startAnalysisBtn?.addEventListener('click', () => {
    fetchAndAnalyzeFile(fileInfo, content)
  })
}

function createSectionTitle(text: string): HTMLHeadingElement {
  const title = document.createElement('h4')
  title.style.cssText =
    'font-size:13px;font-weight:600;margin:0 0 8px 0;color:#24292e;'
  title.textContent = text
  return title
}

function createText(text: string, style = ''): HTMLParagraphElement {
  const p = document.createElement('p')
  p.style.cssText = style
  p.textContent = text
  return p
}

function renderDeepAnalysis(
  container: HTMLElement,
  analysis: DeepFileAnalysisResult,
  fileData: { fileName: string; fileContent: string },
) {
  container.replaceChildren()

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;'

  const summaryCard = document.createElement('div')
  summaryCard.style.cssText =
    'padding:12px;background:#f0f7ff;border-radius:6px;border-left:3px solid #0366d6;'
  summaryCard.appendChild(createSectionTitle(currentLanguage === 'zh' ? 'AI 分析' : 'AI Analysis'))
  summaryCard.appendChild(
    createText(analysis.summary, 'font-size:12px;color:#444;line-height:1.5;margin:0;'),
  )
  if (analysis.confidence === 'low') {
    summaryCard.appendChild(
      createText(
        currentLanguage === 'zh'
          ? '提示：当前分析证据不足，请结合代码手动确认。'
          : 'Note: Low confidence due to limited evidence. Please verify with source code.',
        'font-size:11px;color:#b45309;margin-top:8px;',
      ),
    )
  }
  wrapper.appendChild(summaryCard)

  if (analysis.components.length > 0) {
    const section = document.createElement('div')
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '关键组件' : 'Key Components'))
    analysis.components.slice(0, 8).forEach((component) => {
      const row = document.createElement('div')
      row.style.cssText = 'padding:8px;background:#f6f8fa;border-radius:4px;margin-bottom:6px;'
      const heading = document.createElement('div')
      heading.style.cssText = 'display:flex;align-items:center;gap:6px;'
      const name = document.createElement('span')
      name.style.cssText = 'font-family:monospace;font-size:12px;font-weight:500;color:#0366d6;'
      name.textContent = component.name
      const kind = document.createElement('span')
      kind.style.cssText =
        'font-size:10px;padding:1px 6px;background:#e1e4e8;border-radius:3px;color:#666;'
      kind.textContent = component.type
      heading.append(name, kind)
      row.appendChild(heading)
      row.appendChild(
        createText(component.description, 'font-size:11px;color:#666;margin:4px 0 0 0;'),
      )
      section.appendChild(row)
    })
    wrapper.appendChild(section)
  }

  if (analysis.dependencies.length > 0) {
    const section = document.createElement('div')
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '依赖' : 'Dependencies'))
    const tags = document.createElement('div')
    tags.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;'
    analysis.dependencies.slice(0, 10).forEach((dep) => {
      const tag = document.createElement('span')
      tag.style.cssText =
        'background:#e8f4fd;padding:2px 8px;border-radius:4px;font-size:11px;color:#0f172a;'
      tag.textContent = dep
      tags.appendChild(tag)
    })
    section.appendChild(tags)
    wrapper.appendChild(section)
  }

  if (analysis.evidence.length > 0) {
    const section = document.createElement('div')
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '证据' : 'Evidence'))
    analysis.evidence.slice(0, 3).forEach((item) => {
      const box = document.createElement('div')
      box.style.cssText = 'padding:8px;background:#f6f8fa;border-radius:4px;margin-bottom:6px;'
      const fileLine = `${item.filePath || fileData.fileName}${item.lineStart ? `:${item.lineStart}` : ''}`
      box.appendChild(createText(fileLine, 'font-size:11px;color:#374151;font-family:monospace;margin:0 0 4px 0;'))
      box.appendChild(createText(item.reason, 'font-size:11px;color:#4b5563;margin:0 0 4px 0;'))
      const snippet = document.createElement('pre')
      snippet.style.cssText =
        'font-size:11px;color:#334155;background:#fff;padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-word;margin:0;'
      snippet.textContent = item.snippet
      box.appendChild(snippet)
      section.appendChild(box)
    })
    wrapper.appendChild(section)
  }

  if (analysis.suggestions.length > 0) {
    const section = document.createElement('div')
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '建议' : 'Suggestions'))
    const list = document.createElement('ul')
    list.style.cssText = 'margin:0;padding-left:16px;font-size:12px;color:#666;line-height:1.6;'
    analysis.suggestions.slice(0, 5).forEach((suggestion) => {
      const li = document.createElement('li')
      li.textContent = suggestion
      list.appendChild(li)
    })
    section.appendChild(list)
    wrapper.appendChild(section)
  }

  const qaSection = document.createElement('div')
  qaSection.style.cssText = 'margin-top:8px;padding-top:12px;border-top:1px solid #e1e4e8;'
  qaSection.appendChild(createSectionTitle(currentLanguage === 'zh' ? '提问' : 'Ask a Question'))

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;'
  const input = document.createElement('input')
  input.id = 'gitmentor-question-input'
  input.placeholder = currentLanguage === 'zh' ? '关于此文件提问...' : 'Ask about this file...'
  input.style.cssText =
    'flex:1;padding:8px 12px;border:1px solid #e1e4e8;border-radius:6px;font-size:12px;outline:none;'
  const askBtn = document.createElement('button')
  askBtn.id = 'gitmentor-ask-btn'
  askBtn.textContent = currentLanguage === 'zh' ? '提问' : 'Ask'
  askBtn.style.cssText =
    'padding:8px 16px;background:#24292e;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;'
  row.append(input, askBtn)
  qaSection.appendChild(row)

  const qaResponse = document.createElement('div')
  qaResponse.id = 'gitmentor-qa-response'
  qaResponse.style.cssText = 'margin-top:12px;'
  qaSection.appendChild(qaResponse)
  wrapper.appendChild(qaSection)

  const handleAsk = () => {
    const question = input.value.trim()
    if (!question) return
    qaResponse.replaceChildren(
      createText(
        getText('thinking'),
        'padding:8px;background:#f0f2f5;border-radius:4px;font-size:12px;color:#666;margin:0;',
      ),
    )

    chrome.runtime.sendMessage(
      {
        action: 'askQuestion',
        fileName: fileData.fileName,
        fileContent: fileData.fileContent,
        question,
      },
      (qaResult: any) => {
        const errorEl = document.createElement('div')
        if (qaResult?.error) {
          errorEl.style.cssText =
            'color:#d73a49;padding:8px;background:#ffeef0;border-radius:4px;font-size:12px;'
          errorEl.textContent = qaResult.error
          qaResponse.replaceChildren(errorEl)
          return
        }

        const answer = document.createElement('div')
        answer.style.cssText =
          'padding:12px;background:#f6f8fa;border-radius:6px;font-size:12px;line-height:1.6;color:#24292e;white-space:pre-wrap;word-break:break-word;'
        answer.textContent = String(qaResult?.answer || '')
        qaResponse.replaceChildren(answer)
      },
    )
  }

  askBtn.addEventListener('click', handleAsk)
  input.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') handleAsk()
  })

  container.appendChild(wrapper)
}

async function performDeepAnalysis(contentDiv: HTMLElement, fileData: any) {
  console.log('[GitMentor] Requesting deep analysis...')
  
  // Load current language
  currentLanguage = await getLanguage()
  
  // Check extension context
  if (!isExtensionContextValid()) {
    contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">Extension context unavailable. Please refresh the page.</div>`
    showReloadPrompt()
    return
  }
  
  // Show loading state
  contentDiv.innerHTML = `
    <div style="padding: 12px; background: #f0f2f5; border-radius: 4px; text-align: center; font-size: 12px; color: #666;">
      🤖 ${getText('deepAnalysisInProgress')}
      <div style="margin-top: 8px; font-size: 11px;">${getText('mayTakeMoment')}</div>
    </div>
  `
  
    // Request deep analysis from service worker
  chrome.runtime.sendMessage({
    action: 'analyzeFileDeep',
    fileName: fileData.fileName,
    fileContent: fileData.fileContent,
    language: currentLanguage,
  }, (response: any) => {
    if (response?.error && !response?.data) {
      contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">${getText('deepAnalysisFailed')}: ${response.error}</div>`
    } else if (response?.data) {
      renderDeepAnalysis(contentDiv, response.data as DeepFileAnalysisResult, fileData)
    }
  })
}

async function fetchAndAnalyzeFile(fileInfo: FileInfo, contentDiv: HTMLElement) {
  try {
    // Load current language
    currentLanguage = await getLanguage()
    
    // Fetch file content from GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${fileInfo.owner}/${fileInfo.repo}/contents/${fileInfo.path}?ref=${fileInfo.branch}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
        },
      }
    )
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }
    
    const fileContent = await response.text()
    
    // Limit file size for API
    const maxSize = 20000 // 20KB limit
    const truncatedContent = fileContent.length > maxSize 
      ? fileContent.substring(0, maxSize) + '\n... (file truncated)'
      : fileContent
    
    // Store file info for deep analysis
    const fileData = {
      fileName: fileInfo.path,
      fileContent: truncatedContent,
    }
    
    // Check extension context before sending message
    if (!isExtensionContextValid()) {
      contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">Extension context unavailable. Please refresh the page.</div>`
      showReloadPrompt()
      return
    }
    
    // Show loading state
    contentDiv.innerHTML = `
      <div style="padding: 12px; background: #f0f2f5; border-radius: 4px; text-align: center; font-size: 12px; color: #666;">
        <div style="display: inline-block; width: 16px; height: 16px; border: 2px solid #24292e; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; vertical-align: middle;"></div>
        ${getText('analyzingFile')}
      </div>
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `
    
    // Send to background script for AI analysis
    chrome.runtime.sendMessage({
      action: 'analyzeFile',
      ...fileData,
      language: currentLanguage,
    }, (response: any) => {
      if (response?.error) {
        contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">${response.error}</div>`
      } else if (response?.html) {
        contentDiv.innerHTML = response.html
        
        // Attach event listener for deep analysis button
        const deepAnalysisBtn = contentDiv.querySelector('#gitmentor-deep-analysis-btn')
        if (deepAnalysisBtn) {
          deepAnalysisBtn.addEventListener('click', () => {
            performDeepAnalysis(contentDiv, fileData)
          })
        }
      }
    })
  } catch (error) {
    contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">Failed to fetch file: ${error instanceof Error ? error.message : 'Unknown error'}</div>`
  }
}

function injectWidget() {
  // Only run on GitHub repo pages
  const pathMatch = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)(\/.*)?$/)
  console.log('[GitMentor] Checking pathname:', window.location.pathname)
  console.log('[GitMentor] pathMatch result:', pathMatch)
  if (!pathMatch) {
    console.log('[GitMentor] Not a GitHub repo page, skipping injection')
    return
  }

  const [, owner, repo] = pathMatch
  console.log(`[GitMentor] Injecting widget for ${owner}/${repo}`)

  // Check if widget already exists
  if (document.getElementById('gitmentor-widget')) {
    console.log('[GitMentor] Widget already exists, skipping')
    return
  }

  // Create floating widget button
  const widget = document.createElement('div')
  widget.id = 'gitmentor-widget'
  widget.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    z-index: 10000;
    cursor: pointer;
  `

  const button = document.createElement('button')
  button.style.cssText = `
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: none;
    background: white;
    padding: 0;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  `
  
  const img = document.createElement('img')
  img.src = chrome.runtime.getURL('gitmentor.png')
  img.alt = 'GitMentor'
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  `
  button.appendChild(img)
  button.title = 'GitMentor - Learn this project'

  button.onmouseover = () => {
    button.style.transform = 'scale(1.1)'
    button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.6)'
  }

  button.onmouseout = () => {
    button.style.transform = 'scale(1)'
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'
  }

  button.onclick = (e) => {
    console.log('[GitMentor] Button clicked!')
    e.stopPropagation()
    openPanel(owner, repo)
  }

  widget.appendChild(button)
  document.body.appendChild(widget)

  // Make widget draggable
  makeDraggable(widget)
}

function makeDraggable(element: HTMLElement) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0

  element.onmousedown = dragMouseDown

  function dragMouseDown(e: MouseEvent) {
    e.preventDefault()
    pos3 = e.clientX
    pos4 = e.clientY
    document.onmouseup = closeDragElement

    function closeDragElement() {
      document.onmouseup = null
      document.onmousemove = null
    }

    document.onmousemove = elementDrag

    function elementDrag(e: MouseEvent) {
      e.preventDefault()
      pos1 = pos3 - e.clientX
      pos2 = pos4 - e.clientY
      pos3 = e.clientX
      pos4 = e.clientY
      element.style.top = element.offsetTop - pos2 + 'px'
      element.style.left = element.offsetLeft - pos1 + 'px'
    }
  }
}

// Check if extension context is still valid
function isExtensionContextValid(): boolean {
  try {
    // Try to access chrome.runtime.id - this will throw or be undefined if context is invalid
    return !!(chrome?.runtime?.id)
  } catch {
    return false
  }
}

// Show a reload prompt when extension context is invalid
function showReloadPrompt() {
  // Remove existing prompt
  const existing = document.getElementById('gitmentor-reload-prompt')
  if (existing) {
    existing.remove()
  }

  const prompt = document.createElement('div')
  prompt.id = 'gitmentor-reload-prompt'
  prompt.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: #24292e;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    font-size: 13px;
    z-index: 10001;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    max-width: 300px;
  `
  prompt.innerHTML = `
    <div style="margin-bottom: 12px; font-weight: 600;">Extension Updated</div>
    <div style="margin-bottom: 12px; color: #ccc; font-size: 12px;">
      GitMentor was updated or reloaded. Please refresh this page to continue.
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="gitmentor-reload-btn" style="
        background: #24292e;
        color: white;
        border: 1px solid rgba(27, 31, 35, 0.15);
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">Refresh Page</button>
      <button id="gitmentor-dismiss-btn" style="
        background: transparent;
        color: #999;
        border: 1px solid #555;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      ">Dismiss</button>
    </div>
  `

  document.body.appendChild(prompt)

  const reloadBtn = prompt.querySelector('#gitmentor-reload-btn')
  reloadBtn?.addEventListener('click', () => {
    window.location.reload()
  })

  const dismissBtn = prompt.querySelector('#gitmentor-dismiss-btn')
  dismissBtn?.addEventListener('click', () => {
    prompt.remove()
  })
}

function openPanel(owner: string, repo: string) {
  console.log(`[GitMentor] openPanel called with ${owner}/${repo}`)
  
  try {
    // Check if panel already exists
    const existing = document.getElementById('gitmentor-panel')
    if (existing) {
      existing.remove()
      return
    }
    
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      console.error('[GitMentor] Extension context invalidated - extension was likely updated/reloaded')
      showReloadPrompt()
      return
    }
    
    const extensionId = chrome.runtime.id
    const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    console.log('[GitMentor] Panel URL:', popupUrl)
    
    // Create floating panel
    const panel = document.createElement('div')
    panel.id = 'gitmentor-panel'
    panel.style.cssText = `
      position: fixed;
      right: 20px;
      top: 20px;
      width: 500px;
      height: 700px;
      z-index: 9999;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      overflow: hidden;
    `
    
    // Header
    const header = document.createElement('div')
    header.style.cssText = `
      padding: 16px;
      border-bottom: 1px solid #e1e4e8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f6f8fa;
      cursor: move;
      flex-shrink: 0;
    `
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">📚</span>
        <div>
          <span style="font-weight: 600; font-size: 14px; color: #24292e;">GitMentor</span>
          <div style="font-size: 11px; color: #666; margin-top: 2px;">${owner}/${repo}</div>
        </div>
      </div>
      <button id="gitmentor-close" style="
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 24px;
        height: 24px;
      ">×</button>
    `
    
    // Iframe
    const iframe = document.createElement('iframe')
    iframe.style.cssText = `
      flex: 1;
      border: none;
      background: white;
      width: 100%;
    `
    iframe.src = popupUrl
    
    panel.appendChild(header)
    panel.appendChild(iframe)
    document.body.appendChild(panel)
    
    // Close button
    const closeBtn = header.querySelector('#gitmentor-close') as HTMLElement
    closeBtn?.addEventListener('click', () => {
      panel.remove()
    })
    
    // Escape to close
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        panel.remove()
        document.removeEventListener('keydown', escapeHandler)
      }
    }
    document.addEventListener('keydown', escapeHandler)
    
    // Draggable
    makeDraggablePanel(header, panel)
    
    showNotification(`✓ GitMentor opened for ${owner}/${repo}`)
  } catch (error) {
    console.error('[GitMentor] Error creating panel:', error)
    showNotification(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function makeDraggablePanel(header: HTMLElement, panel: HTMLElement) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0
  header.onmousedown = dragMouseDown

  function dragMouseDown(e: MouseEvent) {
    e.preventDefault()
    pos3 = e.clientX
    pos4 = e.clientY
    document.onmouseup = closeDragElement

    function closeDragElement() {
      document.onmouseup = null
      document.onmousemove = null
    }

    document.onmousemove = elementDrag

    function elementDrag(e: MouseEvent) {
      e.preventDefault()
      pos1 = pos3 - e.clientX
      pos2 = pos4 - e.clientY
      pos3 = e.clientX
      pos4 = e.clientY

      const newTop = Math.max(0, panel.offsetTop - pos2)
      const newLeft = Math.max(0, panel.offsetLeft - pos1)
      
      if (newTop + panel.offsetHeight <= window.innerHeight) {
        panel.style.top = newTop + 'px'
      }
      if (newLeft + panel.offsetWidth <= window.innerWidth) {
        panel.style.left = newLeft + 'px'
      }
    }
  }
}

function showNotification(message: string) {
  // Remove existing notification
  const existing = document.getElementById('gitmentor-notification')
  if (existing) {
    existing.remove()
  }

  const notification = document.createElement('div')
  notification.id = 'gitmentor-notification'
  notification.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: #24292e;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  `
  notification.textContent = message

  // Add animation
  const style = document.createElement('style')
  if (!document.getElementById('gitmentor-styles')) {
    style.id = 'gitmentor-styles'
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(20px);
          opacity: 0;
        }
      }
    `
    document.head.appendChild(style)
  }

  document.body.appendChild(notification)

  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out'
    setTimeout(() => {
      notification.remove()
    }, 300)
  }, 3000)
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    detectAndSaveLanguage()
    injectWidget()
    injectFileSidebar()
  })
} else {
  detectAndSaveLanguage()
  injectWidget()
  injectFileSidebar()
}

let injectTimer: ReturnType<typeof setTimeout> | null = null
function scheduleInjection(delay = 120) {
  if (injectTimer) {
    clearTimeout(injectTimer)
  }
  injectTimer = setTimeout(() => {
    injectTimer = null
    if (!document.getElementById('gitmentor-widget')) {
      injectWidget()
    }
    injectFileSidebar()
  }, delay)
}

// Reinject if page changes (for SPAs)
const observer = new MutationObserver(() => {
  scheduleInjection(180)
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})

// Also listen for URL changes via popstate (back/forward buttons)
window.addEventListener('popstate', () => {
  console.log('[GitMentor] URL changed via popstate')
  scheduleInjection(80)
})

// Listen for pushState/replaceState calls (GitHub navigation)
const originalPushState = history.pushState
const originalReplaceState = history.replaceState

history.pushState = function(...args) {
  originalPushState.apply(this, args)
  console.log('[GitMentor] pushState detected')
  scheduleInjection(80)
}

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args)
  console.log('[GitMentor] replaceState detected')
  scheduleInjection(80)
}
