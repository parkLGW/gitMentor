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
        // First, try to get from URL query parameters (from floating widget)
        const urlParams = new URLSearchParams(window.location.search)
        const owner = urlParams.get('owner')
        const repoName = urlParams.get('repo')
        
        if (owner && repoName) {
          setRepo({ owner, name: repoName })
          setLoading(false)
          return
        }

        // Second, try to get from chrome storage (from floating widget)
        try {
          const stored = await new Promise<any>((resolve) => {
            (chrome.storage.local.get as any)('currentRepo', (result: any) => {
              resolve(result.currentRepo || null)
            })
          })

          if (stored?.owner && stored?.repo) {
            setRepo({ owner: stored.owner, name: stored.repo })
            setLoading(false)
            // Clear the stored repo after reading
            ;(chrome.storage.local.remove as any)('currentRepo')
            return
          }
        } catch (e) {
          // Ignore storage errors, fall back to tab detection
        }

        // Third, try to get from active tab (original behavior)
        const response = await (chrome.tabs.query as any)({
          active: true,
          currentWindow: true,
        })
        const tab = response[0]

        if (!tab.url || !tab.url.includes('github.com')) {
          setError('Not on a GitHub page')
          setLoading(false)
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
