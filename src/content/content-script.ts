// Content script for injecting GitMentor floating widget on GitHub pages

// Save language preference
function detectAndSaveLanguage() {
  const language = navigator.language?.startsWith('zh') ? 'zh' : 'en'
  chrome.storage.local.set({ gitmentor_language: language })
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

function injectFileSidebar() {
  const fileInfo = parseFileUrl()
  if (!fileInfo) return
  
  console.log('[GitMentor] Detected code file:', fileInfo.path)
  
  // Check if sidebar already exists
  if (document.getElementById('gitmentor-file-sidebar')) {
    console.log('[GitMentor] File sidebar already exists')
    return
  }
  
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
    <div id="gitmentor-loading" style="
      margin-top: 12px;
      padding: 8px;
      background: #f0f2f5;
      border-radius: 4px;
      text-align: center;
      font-size: 12px;
      color: #666;
    ">
      Analyzing file...
    </div>
  `
  
  // Content area
  const content = document.createElement('div')
  content.id = 'gitmentor-file-content'
  content.style.cssText = `
    padding: 16px;
    font-size: 13px;
    color: #24292e;
  `
  
  sidebar.appendChild(header)
  sidebar.appendChild(content)
  document.body.appendChild(sidebar)
  
  // Close button
  const closeBtn = header.querySelector('#gitmentor-sidebar-close')
  closeBtn?.addEventListener('click', () => {
    sidebar.remove()
  })
  
  // Fetch and analyze file
  fetchAndAnalyzeFile(fileInfo, content)
}

async function performDeepAnalysis(contentDiv: HTMLElement, fileData: any) {
  console.log('[GitMentor] Requesting deep analysis...')
  
  // Show loading state
  contentDiv.innerHTML = `
    <div style="padding: 12px; background: #f0f2f5; border-radius: 4px; text-align: center; font-size: 12px; color: #666;">
      🤖 Performing deep analysis with AI...
      <div style="margin-top: 8px; font-size: 11px;">This may take a moment</div>
    </div>
  `
  
  // Request deep analysis from service worker
  chrome.runtime.sendMessage({
    action: 'analyzeFileDeep',
    fileName: fileData.fileName,
    fileContent: fileData.fileContent,
  }, (response: any) => {
    if (response?.error) {
      contentDiv.innerHTML = `<div style="color: #d73a49; padding: 12px; background: #ffeef0; border-radius: 4px; font-size: 12px;">Deep analysis failed: ${response.error}</div>`
    } else if (response?.html) {
      contentDiv.innerHTML = response.html
      
      // Re-attach event listener for back to quick analysis button if it exists
      const backBtn = contentDiv.querySelector('#gitmentor-back-to-quick-btn')
      if (backBtn) {
        backBtn.addEventListener('click', () => {
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
      }
    }
  })
}

async function fetchAndAnalyzeFile(fileInfo: FileInfo, contentDiv: HTMLElement) {
  try {
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
    
    // Send to background script for AI analysis
    chrome.runtime.sendMessage({
      action: 'analyzeFile',
      ...fileData,
    }, (response: any) => {
      const loadingDiv = document.getElementById('gitmentor-loading')
      if (loadingDiv) {
        loadingDiv.remove()
      }
      
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
    const loadingDiv = document.getElementById('gitmentor-loading')
    if (loadingDiv) {
      loadingDiv.remove()
    }
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
  `
  button.innerHTML = '📚'
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

function openPanel(owner: string, repo: string) {
  console.log(`[GitMentor] openPanel called with ${owner}/${repo}`)
  
  try {
    // Check if panel already exists
    const existing = document.getElementById('gitmentor-panel')
    if (existing) {
      existing.remove()
      return
    }
    
    // Get the extension ID
    if (!chrome?.runtime?.id) {
      console.error('[GitMentor] chrome.runtime.id not available')
      showNotification('Error: Extension context unavailable')
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
  if (!document.getElementById('gitmentor-file-sidebar')) {
    injectFileSidebar()
  }
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})
