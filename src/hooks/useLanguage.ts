import { useState, useEffect } from 'react'

// 检测浏览器语言
function detectBrowserLanguage(): 'zh' | 'en' {
  const lang = navigator.language || (navigator as any).userLanguage || 'en'
  return lang.startsWith('zh') ? 'zh' : 'en'
}

export function useLanguage() {
  const [language, setLanguageState] = useState<'zh' | 'en'>(detectBrowserLanguage)

  useEffect(() => {
    // Load from storage, fallback to browser detection
    (chrome.storage.local.get as any)(['language'], (result: any) => {
      if (result.language) {
        setLanguageState(result.language)
      }
      // 如果没有保存的语言设置，保存当前检测到的语言
      else {
        const detected = detectBrowserLanguage()
        setLanguageState(detected);
        (chrome as any).storage?.local?.set({ language: detected })
      }
    })
  }, [])

  const setLanguage = (lang: 'zh' | 'en') => {
    setLanguageState(lang);
    (chrome as any).storage?.local?.set({ language: lang })
  }

  return { language, setLanguage }
}
