// Service Worker for GitMentor
declare const chrome: any

(chrome.runtime.onInstalled as any).addListener(() => {
  console.log('GitMentor extension installed')
})

(chrome.tabs.onActivated as any).addListener(() => {
  console.log('Tab activated')
})

// Handle messages from content script
(chrome.runtime.onMessage as any).addListener(
  (
    message: any,
    sender: any,
    sendResponse: (response?: any) => void
  ) => {
    if (message.type === 'openTab') {
      try {
        const { owner, repo } = message
        // Build the extension URL
        const url = chrome.runtime.getURL(
          `src/popup/index.html?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
        )
        
        // Open URL in new tab
        (chrome.tabs.create as any)(
          { url },
          (tab: any) => {
            sendResponse({ success: !!tab })
          }
        )
      } catch (error) {
        console.error('Error opening tab:', error)
        sendResponse({ success: false })
      }
      return true
    }
  }
)
