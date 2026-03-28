import { useState, useEffect } from 'react'
import { STORAGE_KEYS } from '@/constants/storage'

// 检测浏览器语言
function detectBrowserLanguage(): 'zh' | 'en' {
  const lang = navigator.language || (navigator as any).userLanguage || 'en'
  return lang.startsWith('zh') ? 'zh' : 'en'
}

export function useLanguage() {
  const [language, setLanguageState] = useState<'zh' | 'en'>(detectBrowserLanguage)

  useEffect(() => {
    // Load from storage, fallback to browser detection
    (chrome.storage.local.get as any)([STORAGE_KEYS.language, STORAGE_KEYS.legacyLanguage], (result: any) => {
      const saved = result[STORAGE_KEYS.language] || result[STORAGE_KEYS.legacyLanguage]
      if (saved) {
        setLanguageState(saved)
        if (result[STORAGE_KEYS.legacyLanguage] && !result[STORAGE_KEYS.language]) {
          (chrome as any).storage?.local?.set({ [STORAGE_KEYS.language]: saved })
        }
      }
      // 如果没有保存的语言设置，保存当前检测到的语言
      else {
        const detected = detectBrowserLanguage()
        setLanguageState(detected);
        (chrome as any).storage?.local?.set({ [STORAGE_KEYS.language]: detected })
      }
    })
  }, [])

  const setLanguage = (lang: 'zh' | 'en') => {
    setLanguageState(lang);
    (chrome as any).storage?.local?.set({ [STORAGE_KEYS.language]: lang })
  }

  return { language, setLanguage }
}
