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
}

export async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()

    return {
      name: data.name,
      owner: data.owner.login,
      description: data.description || 'No description',
      url: data.html_url,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      language: data.language || 'Unknown',
      updatedAt: data.updated_at,
      topics: data.topics || [],
    }
  } catch (error) {
    console.error('Failed to fetch repo info:', error)
    throw error
  }
}

export async function getReadme(owner: string, repo: string): Promise<string> {
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

    return await response.text()
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
