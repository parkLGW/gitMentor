// Content script for injecting GitMentor floating widget on GitHub pages

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
  
  sendMessageWithRetry({ type: 'openTab', owner, repo }, (response) => {
    console.log('[GitMentor] Got response:', response)
    if (response?.success) {
      showNotification(`✓ GitMentor opened for ${owner}/${repo}`)
    } else {
      showNotification(`Failed to open GitMentor`)
    }
  })
}

function sendMessageWithRetry(message: any, callback: (response: any) => void, retries: number = 3) {
  try {
    console.log('[GitMentor] Sending message (attempt):', message)
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[GitMentor] Chrome error:', chrome.runtime.lastError)
        if (retries > 0) {
          console.log(`[GitMentor] Retrying... (${retries} attempts left)`)
          setTimeout(() => sendMessageWithRetry(message, callback, retries - 1), 100)
        } else {
          callback({ success: false, error: chrome.runtime.lastError?.message })
        }
      } else {
        callback(response)
      }
    })
  } catch (error) {
    console.error('[GitMentor] Exception:', error)
    if (retries > 0) {
      console.log(`[GitMentor] Retrying after exception... (${retries} attempts left)`)
      setTimeout(() => sendMessageWithRetry(message, callback, retries - 1), 100)
    } else {
      callback({ success: false, error: String(error) })
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
  document.addEventListener('DOMContentLoaded', injectWidget)
} else {
  injectWidget()
}

// Reinject if page changes (for SPAs)
const observer = new MutationObserver(() => {
  if (!document.getElementById('gitmentor-widget')) {
    injectWidget()
  }
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})
