// Service Worker for GitMentor

chrome.runtime.onInstalled.addListener(() => {
  console.log('GitMentor extension installed')
})

chrome.tabs.onActivated.addListener(() => {
  console.log('Tab activated')
})
