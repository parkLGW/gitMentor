import { useState, useEffect } from 'react'

export interface Repo {
  owner: string
  name: string
}

export function useRepo() {
  const [repo, setRepo] = useState<Repo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function extractRepo() {
      try {
        const response = await (chrome.tabs.query as any)({ active: true, currentWindow: true })
        const tab = response[0]
        
        if (!tab.url || !tab.url.includes('github.com')) {
          setError('Not on a GitHub page')
          return
        }

        const urlMatch = tab.url.match(/github\.com\/([^/]+)\/([^/]+)/)
        if (urlMatch) {
          setRepo({
            owner: urlMatch[1],
            name: urlMatch[2],
          })
        } else {
          setError('Could not extract repo info')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    extractRepo()
  }, [])

  return { repo, loading, error }
}
