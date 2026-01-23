import { useState, useCallback } from 'react'
import { llmManager } from '@/services/llm'
import { AnalysisResult } from '@/types/llm'

interface UseLLMState {
  loading: boolean
  error: string | null
  result: AnalysisResult | null
}

export function useLLM() {
  const [state, setState] = useState<UseLLMState>({
    loading: false,
    error: null,
    result: null,
  })

  const analyze = useCallback(
    async (prompt: string, type: 'project' | 'quickstart' | 'sourcemap') => {
      setState({ loading: true, error: null, result: null })

      try {
        const provider = llmManager.getCurrentProvider()
        if (!provider) {
          throw new Error('No LLM provider configured')
        }

        const response = await provider.complete(prompt)

        const result: AnalysisResult = {
          type,
          content: response.content,
          provider: provider.type,
          model: response.model || 'unknown',
          timestamp: Date.now(),
          tokensUsed: response.tokensUsed?.total,
        }

        setState({ loading: false, error: null, result })
        return result
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred'
        setState({ loading: false, error: errorMessage, result: null })
        throw error
      }
    },
    []
  )

  const streamAnalyze = useCallback(
    async (
      prompt: string,
      type: 'project' | 'quickstart' | 'sourcemap',
      onChunk: (chunk: string) => void
    ) => {
      setState({ loading: true, error: null, result: null })

      try {
        const provider = llmManager.getCurrentProvider()
        if (!provider) {
          throw new Error('No LLM provider configured')
        }

        let fullContent = ''
        for await (const chunk of provider.stream(prompt)) {
          fullContent += chunk
          onChunk(chunk)
        }

        const result: AnalysisResult = {
          type,
          content: fullContent,
          provider: provider.type,
          model: 'unknown',
          timestamp: Date.now(),
        }

        setState({ loading: false, error: null, result })
        return result
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred'
        setState({ loading: false, error: errorMessage, result: null })
        throw error
      }
    },
    []
  )

  const isConfigured = useCallback(() => {
    return llmManager.isConfigured()
  }, [])

  return {
    ...state,
    analyze,
    streamAnalyze,
    isConfigured,
  }
}
