// Service Worker for GitMentor
declare const chrome: any

console.log('[GitMentor SW] Service worker loaded!')

(chrome.runtime.onInstalled as any).addListener(() => {
  console.log('[GitMentor SW] Extension installed')
})

(chrome.tabs.onActivated as any).addListener(() => {
  console.log('[GitMentor SW] Tab activated')
})
