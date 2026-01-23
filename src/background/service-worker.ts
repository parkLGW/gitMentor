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
      // Open URL in new tab
      (chrome.tabs.create as any)(
        { url: message.url },
        (tab: any) => {
          sendResponse({ success: !!tab })
        }
      )
      return true
    }
  }
)
