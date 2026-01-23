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
        // Get from URL query parameters (from floating widget or new window)
        const urlParams = new URLSearchParams(window.location.search)
        const owner = urlParams.get('owner')
        const repoName = urlParams.get('repo')
        
        if (owner && repoName) {
          setRepo({ owner, name: repoName })
        } else {
          setError('Missing repository information')
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
