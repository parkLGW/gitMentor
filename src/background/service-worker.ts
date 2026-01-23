// Service Worker for GitMentor
declare const chrome: any

(chrome.runtime.onInstalled as any).addListener(() => {
  console.log('GitMentor extension installed')
})

(chrome.tabs.onActivated as any).addListener(() => {
  console.log('Tab activated')
})
