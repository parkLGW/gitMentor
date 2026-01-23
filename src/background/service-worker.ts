// Service Worker for GitMentor
declare const chrome: any

console.log('[GitMentor SW] Service worker loaded!')

(chrome.runtime.onInstalled as any).addListener(() => {
  console.log('[GitMentor SW] Extension installed')
})

(chrome.tabs.onActivated as any).addListener(() => {
  console.log('[GitMentor SW] Tab activated')
})

// Handle messages from content script
(chrome.runtime.onMessage as any).addListener(
  (
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ) => {
    console.log('[GitMentor SW] Received message:', message)
    if (message.type === 'openTab') {
      try {
        const { owner, repo } = message
        console.log(`[GitMentor SW] Opening tab for ${owner}/${repo}`)
        // Build the extension URL
        const url = chrome.runtime.getURL(
          `src/popup/index.html?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
        )
        console.log('[GitMentor SW] URL:', url)
        
        // Open URL in new tab
        (chrome.tabs.create as any)(
          { url },
          (tab: any) => {
            console.log('[GitMentor SW] Tab created:', tab)
            sendResponse({ success: !!tab })
          }
        )
      } catch (error) {
        console.error('[GitMentor SW] Error opening tab:', error)
        sendResponse({ success: false })
      }
      return true
    }
  }
)
