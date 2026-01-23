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
    if (message.type === 'openPopupWindow') {
      const { owner, repo } = message
      
      // Create a new window to display the popup
      const popupUrl = chrome.runtime.getURL(
        `src/popup/index.html?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
      )

      ;(chrome.windows.create as any)(
        {
          url: popupUrl,
          type: 'popup',
          width: 500,
          height: 700,
        },
        (window: any) => {
          sendResponse({ success: !!window })
        }
      )
      
      return true
    }
  }
)
