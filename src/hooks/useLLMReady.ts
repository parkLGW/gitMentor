// Shared reactive LLM-configured state, driven by config change events
import { useEffect, useState } from 'react'
import { llmManager } from '@/services/llm'
import { eventBus, EVENTS } from '@/utils/eventBus'

interface LLMReadySource {
  isConfigured: () => boolean
  onChanged: (handler: () => void) => () => void
  onCleared: (handler: () => void) => () => void
}

const defaultReadySource: LLMReadySource = {
  isConfigured: () => llmManager.isConfigured(),
  onChanged: (handler) => eventBus.on(EVENTS.LLM_CONFIG_CHANGED, handler),
  onCleared: (handler) => eventBus.on(EVENTS.LLM_CONFIG_CLEARED, handler),
}

export function subscribeToLLMReady(
  onReadyChange: (ready: boolean) => void,
  source: LLMReadySource = defaultReadySource,
): () => void {
  const check = () => onReadyChange(source.isConfigured())
  const unsubscribeChanged = source.onChanged(check)
  const unsubscribeCleared = source.onCleared(() => onReadyChange(false))
  check()

  return () => {
    unsubscribeChanged()
    unsubscribeCleared()
  }
}

export function useLLMReady(): boolean {
  const [ready, setReady] = useState(() => llmManager.isConfigured())

  useEffect(() => subscribeToLLMReady(setReady), [])

  return ready
}
