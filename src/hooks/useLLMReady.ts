// Shared reactive LLM-configured state, driven by config change events
import { useEffect, useState } from 'react'
import { llmManager } from '@/services/llm'
import { eventBus, EVENTS } from '@/utils/eventBus'

export function useLLMReady(): boolean {
  const [ready, setReady] = useState(() => llmManager.isConfigured())

  useEffect(() => {
    const check = () => setReady(llmManager.isConfigured())
    check()
    const unsubscribe = eventBus.on(EVENTS.LLM_CONFIG_CHANGED, check)
    const unsubscribeClear = eventBus.on(EVENTS.LLM_CONFIG_CLEARED, () => setReady(false))
    return () => {
      unsubscribe()
      unsubscribeClear()
    }
  }, [])

  return ready
}
