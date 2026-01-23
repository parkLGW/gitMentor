import { useState, useEffect } from 'react'

export function useLanguage() {
  const [language, setLanguageState] = useState<'zh' | 'en'>('en')

  useEffect(() => {
    // Load from storage
    (chrome.storage.local.get as any)(['language'], (result: any) => {
      if (result.language) {
        setLanguageState(result.language)
      }
    })
  }, [])

  const setLanguage = (lang: 'zh' | 'en') => {
    setLanguageState(lang);
    (chrome as any).storage?.local?.set({ language: lang })
  }

  return { language, setLanguage }
}
