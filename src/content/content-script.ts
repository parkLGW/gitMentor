// Content script for injecting GitMentor floating widget on GitHub pages

function injectWidget() {
  // Only run on GitHub repo pages
  const pathMatch = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)(\/.*)?$/)
  if (!pathMatch) return

  const [, owner, repo] = pathMatch

  // Check if widget already exists
  if (document.getElementById('gitmentor-widget')) {
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
  // Check if panel already exists
  let panel = document.getElementById('gitmentor-panel')
  if (panel) {
    // Toggle visibility
    const isHidden = panel.style.display === 'none'
    panel.style.display = isHidden ? 'flex' : 'none'
    return
  }

  // Create panel
  panel = document.createElement('div')
  panel.id = 'gitmentor-panel'
  panel.style.cssText = `
    position: fixed;
    right: 20px;
    top: 20px;
    width: 450px;
    height: 600px;
    z-index: 9999;
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    padding: 16px;
    border-bottom: 1px solid #e1e4e8;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 20px;">📚</span>
      <span style="font-weight: 600; font-size: 14px;">GitMentor</span>
    </div>
    <button id="gitmentor-close" style="
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
    ">×</button>
  `

  // Content iframe
  const iframe = document.createElement('iframe')
  iframe.id = 'gitmentor-iframe'
  iframe.style.cssText = `
    flex: 1;
    border: none;
    background: white;
  `
  // Use the popup page with owner/repo as params
  iframe.src = chrome.runtime.getURL(
    `src/popup/index.html?owner=${owner}&repo=${repo}`
  )

  panel.appendChild(header)
  panel.appendChild(iframe)
  document.body.appendChild(panel)

  // Close button handler
  const closeBtn = header.querySelector('#gitmentor-close') as HTMLElement
  closeBtn?.addEventListener('click', () => {
    panel!.remove()
  })

  // Close on Escape
  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      panel!.remove()
      document.removeEventListener('keydown', escapeHandler)
    }
  }
  document.addEventListener('keydown', escapeHandler)

  // Make panel draggable
  makePanelDraggable(header, panel)
}

function makePanelDraggable(header: HTMLElement, panel: HTMLElement) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0

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

      const newTop = panel.offsetTop - pos2
      const newLeft = panel.offsetLeft - pos1

      // Keep panel within viewport
      if (newTop >= 0 && newTop + panel.offsetHeight <= window.innerHeight) {
        panel.style.top = newTop + 'px'
      }
      if (newLeft >= 0 && newLeft + panel.offsetWidth <= window.innerWidth) {
        panel.style.left = newLeft + 'px'
      }
    }
  }
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
