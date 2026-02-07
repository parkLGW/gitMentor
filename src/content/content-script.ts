// Content script for injecting GitMentor floating widget on GitHub pages

// Track current file path to detect changes
let currentFilePath: string | null = null
let currentLanguage: 'zh' | 'en' = 'en'

// Get current language from storage
async function getLanguage(): Promise<'zh' | 'en'> {
  try {
    if (!isExtensionContextValid()) return 'en'
    const result = await chrome.storage.local.get(['gitmentor_language'])
    return result.gitmentor_language || 'en'
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
    chrome.storage.local.set({ gitmentor_language: language })
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
    if (response?.error && !response?.html) {
      contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">${getText('deepAnalysisFailed')}: ${response.error}</div>`
    } else if (response?.html) {
      contentDiv.innerHTML = response.html
      
      // Attach Q&A event listeners
      const questionInput = contentDiv.querySelector('#gitmentor-question-input') as HTMLInputElement
      const askBtn = contentDiv.querySelector('#gitmentor-ask-btn')
      const qaResponse = contentDiv.querySelector('#gitmentor-qa-response')
      
      if (questionInput && askBtn && qaResponse) {
        const handleAsk = () => {
          const question = questionInput.value.trim()
          if (!question) return
          
          qaResponse.innerHTML = `<div style="padding: 8px; background: #f0f2f5; border-radius: 4px; font-size: 12px; color: #666;">${getText('thinking')}</div>`
          
          chrome.runtime.sendMessage({
            action: 'askQuestion',
            fileName: fileData.fileName,
            fileContent: fileData.fileContent,
            question,
          }, (qaResult: any) => {
            if (qaResult?.error) {
              qaResponse.innerHTML = `<div style="color: #d73a49; padding: 8px; background: #ffeef0; border-radius: 4px; font-size: 12px;">${qaResult.error}</div>`
            } else if (qaResult?.answer) {
              qaResponse.innerHTML = `<div style="padding: 12px; background: #f6f8fa; border-radius: 6px; font-size: 12px; line-height: 1.6; color: #24292e;">${qaResult.answer.replace(/\n/g, '<br>')}</div>`
            }
          })
        }
        
        askBtn.addEventListener('click', handleAsk)
        questionInput.addEventListener('keypress', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') handleAsk()
        })
      }
      
      // Re-attach event listener for back to quick analysis button if it exists
      const backBtn = contentDiv.querySelector('#gitmentor-back-to-quick-btn')
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          // 返回到开始分析界面
          contentDiv.innerHTML = `
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
          const startBtn = contentDiv.querySelector('#gitmentor-start-analysis-btn')
          startBtn?.addEventListener('click', () => {
            fetchAndAnalyzeFile(
              {
                owner: '',
                repo: '',
                branch: '',
                path: fileData.fileName,
              },
              contentDiv
            )
          })
        })
      }
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

// Reinject if page changes (for SPAs)
const observer = new MutationObserver(() => {
  if (!document.getElementById('gitmentor-widget')) {
    injectWidget()
  }
  // Always call injectFileSidebar to check if file changed
  injectFileSidebar()
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})

// Also listen for URL changes via popstate (back/forward buttons)
window.addEventListener('popstate', () => {
  console.log('[GitMentor] URL changed via popstate')
  injectFileSidebar()
})

// Listen for pushState/replaceState calls (GitHub navigation)
const originalPushState = history.pushState
const originalReplaceState = history.replaceState

history.pushState = function(...args) {
  originalPushState.apply(this, args)
  console.log('[GitMentor] pushState detected')
  setTimeout(injectFileSidebar, 100)
}

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args)
  console.log('[GitMentor] replaceState detected')
  setTimeout(injectFileSidebar, 100)
}
