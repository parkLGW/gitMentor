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
const DEFAULT_TIMEOUT = 10000 // 10 seconds

// Check if localStorage is available
function isLocalStorageAvailable(): boolean {
  try {
    const test = '__test__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

function getCacheKey(owner: string, repo: string, type: string): string {
  return `${CACHE_KEY_PREFIX}${owner}/${repo}/${type}`
}

function getFromCache<T>(key: string): T | null {
  if (!isLocalStorageAvailable()) return null

  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null

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
  if (!isLocalStorageAvailable()) return

  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now(),
    }))
  } catch (error) {
    console.warn('Failed to cache data:', error)
  }
}

// Fetch with timeout using AbortController
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw error
  }
}

export async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const cacheKey = getCacheKey(owner, repo, 'info')
  const cached = getFromCache<RepoInfo>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}`,
      {},
      5000
    )

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
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
        },
      },
      10000
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
  const cacheKey = getCacheKey(owner, repo, `tree_${path || 'root'}`)
  const cached = getFromCache<any>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {},
      10000
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    setCache(cacheKey, data)
    return data
  } catch (error) {
    console.error('Failed to fetch repo tree:', error)
    throw error
  }
}

export async function getPackageJson(owner: string, repo: string): Promise<any> {
  const cacheKey = getCacheKey(owner, repo, 'package.json')
  const cached = getFromCache<any>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
        },
      },
      5000
    )

    if (!response.ok) {
      return null
    }

    const content = await response.text()
    const json = JSON.parse(content)
    setCache(cacheKey, json)
    return json
  } catch (error) {
    console.debug('Failed to fetch package.json:', error)
    return null
  }
}

export async function getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
  const cacheKey = getCacheKey(owner, repo, 'languages')
  const cached = getFromCache<Record<string, number>>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/languages`,
      {},
      5000
    )

    if (!response.ok) {
      return {}
    }

    const data = await response.json()
    setCache(cacheKey, data)
    return data
  } catch (error) {
    console.debug('Failed to fetch languages:', error)
    return {}
  }
}

export async function getProjectStructure(owner: string, repo: string): Promise<string> {
  try {
    const contents = await getRepoTree(owner, repo, '')

    if (!Array.isArray(contents)) {
      return ''
    }

    const structure = contents
      .filter((item: any) => {
        // Skip common non-essential directories
        const name = item.name
        return !['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(name)
      })
      .map((item: any) => {
        const prefix = item.type === 'dir' ? '📁' : '📄'
        return `${prefix} ${item.name}`
      })
      .join('\n')

    return structure
  } catch (error) {
    console.debug('Failed to get project structure:', error)
    return ''
  }
}

// ============================================
// TreeNode and directory tree functions
// ============================================

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
}

// Ignored directories and files
const IGNORED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  '.DS_Store',
  'Thumbs.db',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]

function shouldIgnore(name: string): boolean {
  return IGNORED_PATHS.some(pattern => {
    if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1))
    }
    return name === pattern
  })
}

// Concurrency limiter for API requests
class ConcurrencyLimiter {
  private queue: (() => Promise<void>)[] = []
  private running = 0
  private limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.running++
        try {
          const result = await fn()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.running--
          this.processQueue()
        }
      }

      if (this.running < this.limit) {
        task()
      } else {
        this.queue.push(task)
      }
    })
  }

  private processQueue() {
    if (this.queue.length > 0 && this.running < this.limit) {
      const next = this.queue.shift()
      next?.()
    }
  }
}

// Global limiter: max 5 concurrent requests to avoid rate limiting
const apiLimiter = new ConcurrencyLimiter(5)

// Get full directory tree (recursive with concurrency control)
export async function getFullDirectoryTree(
  owner: string,
  repo: string,
  maxDepth: number = 3
): Promise<TreeNode[]> {
  const cacheKey = getCacheKey(owner, repo, `full_tree_${maxDepth}`)
  const cached = getFromCache<TreeNode[]>(cacheKey)
  if (cached) return cached

  async function fetchTree(path: string, depth: number): Promise<TreeNode[]> {
    if (depth > maxDepth) return []

    try {
      // Use concurrency limiter for API requests
      const contents = await apiLimiter.run(() => getRepoTree(owner, repo, path))
      if (!Array.isArray(contents)) return []

      const nodes: TreeNode[] = []

      for (const item of contents) {
        if (shouldIgnore(item.name)) continue

        const node: TreeNode = {
          name: item.name,
          path: item.path,
          type: item.type === 'dir' ? 'dir' : 'file'
        }

        // Recursively get subdirectories
        if (item.type === 'dir' && depth < maxDepth) {
          node.children = await fetchTree(item.path, depth + 1)
        }

        nodes.push(node)
      }

      // Sort: directories first, then files
      nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'dir' ? -1 : 1
      })

      return nodes
    } catch (error) {
      console.debug(`Failed to fetch tree at ${path}:`, error)
      return []
    }
  }

  const tree = await fetchTree('', 0)
  setCache(cacheKey, tree)
  return tree
}

// Format directory tree as string (for prompts)
export function formatDirectoryTree(nodes: TreeNode[], prefix: string = ''): string {
  let result = ''

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1
    const connector = isLast ? '└── ' : '├── '
    const icon = node.type === 'dir' ? '📁' : '📄'

    result += `${prefix}${connector}${icon} ${node.name}\n`

    if (node.children && node.children.length > 0) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ')
      result += formatDirectoryTree(node.children, newPrefix)
    }
  })

  return result
}

// Simplified directory tree (only one level)
export function formatSimpleDirectoryTree(nodes: TreeNode[]): string {
  return nodes
    .map(node => {
      const icon = node.type === 'dir' ? '📁' : '📄'
      return `${icon} ${node.name}`
    })
    .join('\n')
}

// ============================================
// Get file content
// ============================================

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  maxLines: number = 100
): Promise<string | null> {
  const cacheKey = getCacheKey(owner, repo, `file_${path}_${maxLines}`)
  const cached = getFromCache<string>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
        },
      },
      10000
    )

    if (!response.ok) {
      return null
    }

    const content = await response.text()

    // Limit lines
    const lines = content.split('\n')
    const truncated = lines.slice(0, maxLines).join('\n')
    const result = lines.length > maxLines
      ? `${truncated}\n\n// ... (${lines.length - maxLines} more lines)`
      : truncated

    setCache(cacheKey, result)
    return result
  } catch (error) {
    console.debug(`Failed to fetch file ${path}:`, error)
    return null
  }
}

// ============================================
// Get config files
// ============================================

export interface ConfigFiles {
  packageJson?: any
  tsconfig?: any
  viteConfig?: string
  webpackConfig?: string
  eslintConfig?: any
  prettierConfig?: any
}

export async function getConfigFiles(owner: string, repo: string): Promise<ConfigFiles> {
  const cacheKey = getCacheKey(owner, repo, 'config_files')
  const cached = getFromCache<ConfigFiles>(cacheKey)
  if (cached) return cached

  const configs: ConfigFiles = {}

  // Fetch multiple config files in parallel
  const [packageJson, tsconfig, viteConfig] = await Promise.all([
    getPackageJson(owner, repo),
    getFileContent(owner, repo, 'tsconfig.json', 50),
    getFileContent(owner, repo, 'vite.config.js', 50)
      .then(c => c || getFileContent(owner, repo, 'vite.config.ts', 50)),
  ])

  configs.packageJson = packageJson
  if (tsconfig) {
    try {
      configs.tsconfig = JSON.parse(tsconfig.replace(/\/\/.*/g, '')) // Remove comments
    } catch {
      configs.tsconfig = tsconfig
    }
  }
  configs.viteConfig = viteConfig || undefined

  setCache(cacheKey, configs)
  return configs
}

// ============================================
// Smart entry file detection
// ============================================

const ENTRY_FILE_PATTERNS = [
  // JavaScript/TypeScript
  'src/index.ts',
  'src/index.tsx',
  'src/main.ts',
  'src/main.tsx',
  'src/app.ts',
  'src/app.tsx',
  'src/App.tsx',
  'src/App.ts',
  'index.ts',
  'index.js',
  'main.ts',
  'main.js',
  'app.ts',
  'app.js',
  // Python
  'main.py',
  'app.py',
  '__main__.py',
  'src/main.py',
  // Go
  'main.go',
  'cmd/main.go',
]

export async function findEntryFile(owner: string, repo: string): Promise<string | null> {
  // Check package.json main field first
  const packageJson = await getPackageJson(owner, repo)
  if (packageJson?.main) {
    return packageJson.main
  }

  // Get file lists for root and src directories
  const rootTree = await getRepoTree(owner, repo, '')
  const srcTree = await getRepoTree(owner, repo, 'src').catch(() => [])

  const allFiles = [
    ...(Array.isArray(rootTree) ? rootTree : []),
    ...(Array.isArray(srcTree) ? srcTree.map((f: any) => ({ ...f, path: `src/${f.name}` })) : [])
  ]

  // Find entry file by priority
  for (const pattern of ENTRY_FILE_PATTERNS) {
    const found = allFiles.find((f: any) => f.path === pattern || f.name === pattern)
    if (found) {
      return found.path
    }
  }

  return null
}

// ============================================
// Get core directory file lists
// ============================================

const CORE_DIRECTORIES = [
  'src',
  'lib',
  'app',
  'pages',
  'components',
  'services',
  'hooks',
  'utils',
  'core',
  'api',
]

export async function getCoreFilesPreview(
  owner: string,
  repo: string
): Promise<string> {
  const cacheKey = getCacheKey(owner, repo, 'core_files_preview')
  const cached = getFromCache<string>(cacheKey)
  if (cached) return cached

  const previews: string[] = []

  for (const dir of CORE_DIRECTORIES) {
    try {
      const contents = await getRepoTree(owner, repo, dir)
      if (Array.isArray(contents) && contents.length > 0) {
        const files = contents
          .filter((f: any) => f.type === 'file' && !shouldIgnore(f.name))
          .slice(0, 5)
          .map((f: any) => `  - ${f.name}`)
          .join('\n')

        if (files) {
          previews.push(`📁 ${dir}/\n${files}`)
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  const result = previews.join('\n\n')
  setCache(cacheKey, result)
  return result
}
