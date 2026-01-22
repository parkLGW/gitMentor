export interface RepoInfo {
  name: string
  owner: string
  description: string
  url: string
  stars: number
  forks: number
  openIssues: number
  language: string
  updatedAt: string
  topics: string[]
  watchers: number
  archived: boolean
}

const CACHE_KEY_PREFIX = 'gitmentor_cache_'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

function getCacheKey(owner: string, repo: string, type: string): string {
  return `${CACHE_KEY_PREFIX}${owner}/${repo}/${type}`
}

function getFromCache<T>(key: string): T | null {
  const cached = localStorage.getItem(key)
  if (!cached) return null
  
  try {
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(key)
      return null
    }
    return data as T
  } catch {
    return null
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }))
  } catch (error) {
    console.warn('Failed to cache data:', error)
  }
}

export async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const cacheKey = getCacheKey(owner, repo, 'info')
  const cached = getFromCache<RepoInfo>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      timeout: 5000,
    } as any)
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()

    const info: RepoInfo = {
      name: data.name,
      owner: data.owner.login,
      description: data.description || '',
      url: data.html_url,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      language: data.language || 'Unknown',
      updatedAt: data.updated_at,
      topics: data.topics || [],
      watchers: data.watchers_count,
      archived: data.archived,
    }

    setCache(cacheKey, info)
    return info
  } catch (error) {
    console.error('Failed to fetch repo info:', error)
    throw error
  }
}

export async function getReadme(owner: string, repo: string): Promise<string> {
  const cacheKey = getCacheKey(owner, repo, 'readme')
  const cached = getFromCache<string>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const content = await response.text()
    setCache(cacheKey, content)
    return content
  } catch (error) {
    console.error('Failed to fetch README:', error)
    throw error
  }
}

export async function getRepoTree(
  owner: string,
  repo: string,
  path: string = ''
): Promise<any> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch repo tree:', error)
    throw error
  }
}
