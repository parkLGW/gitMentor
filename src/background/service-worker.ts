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
    if (message.type === 'openPopup') {
      // Store repo info for popup to access
      const { owner, repo } = message
      chrome.storage.local.set(
        {
          currentRepo: { owner, repo },
        },
        () => {
          // Open the popup
          chrome.action.openPopup()
          sendResponse({ success: true })
        }
      )
      return true
    }
  }
)
