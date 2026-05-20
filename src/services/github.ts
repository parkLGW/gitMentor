import { STORAGE_KEYS, StorageKeys } from '../constants/storage.js'
import { setJsonCacheWithEviction } from '../utils/local-cache.js'
import { buildRawGithubUrl, normalizeGithubFilePath } from './agent-code-context.js'

declare const chrome: any

export interface RepoInfo {
  name: string
  owner: string
  description: string
  url: string
  defaultBranch: string
  stars: number
  forks: number
  openIssues: number
  language: string
  updatedAt: string
  topics: string[]
  watchers: number
  archived: boolean
}

const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const DEFAULT_TIMEOUT = 10000 // 10 seconds
const GITHUB_RATE_LIMIT_MAX_RETRIES = 2
const GITHUB_RATE_LIMIT_DELAY_CAP_MS = 5000
const GITHUB_RATE_LIMIT_FALLBACK_DELAY_MS = 1000
const GITHUB_WEB_TREE_TIMEOUT_MS = 8000
const FULL_TREE_CACHE_VERSION = 'v2'

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
  return StorageKeys.githubCache(owner, repo, type)
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
    setJsonCacheWithEviction(key, data)
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

async function getGithubToken(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) {
    return ''
  }

  return await new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.githubToken, (data: Record<string, string>) => {
      resolve(String(data?.[STORAGE_KEYS.githubToken] || '').trim())
    })
  })
}

async function mergeGithubHeaders(headers?: HeadersInit): Promise<Headers> {
  const merged = new Headers(headers)
  const githubToken = await getGithubToken()
  if (githubToken) {
    merged.set('Authorization', `Bearer ${githubToken}`)
  }
  return merged
}

function clampGithubRateLimitDelayMs(delayMs: number): number {
  return Math.min(
    GITHUB_RATE_LIMIT_DELAY_CAP_MS,
    Math.max(0, Math.ceil(delayMs)),
  )
}

export function parseGithubRateLimitDelayMs(
  headers: Pick<Headers, 'get'>,
  nowMs: number = Date.now(),
): number | null {
  const retryAfterRaw = headers.get('retry-after') || headers.get('Retry-After')
  if (retryAfterRaw) {
    const retryAfterSeconds = Number(retryAfterRaw)
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return clampGithubRateLimitDelayMs(retryAfterSeconds * 1000)
    }
  }

  const remaining = headers.get('x-ratelimit-remaining') || headers.get('X-RateLimit-Remaining')
  const resetRaw = headers.get('x-ratelimit-reset') || headers.get('X-RateLimit-Reset')
  if (remaining === '0' && resetRaw) {
    const resetSeconds = Number(resetRaw)
    if (Number.isFinite(resetSeconds)) {
      return clampGithubRateLimitDelayMs(resetSeconds * 1000 - nowMs)
    }
  }

  return null
}

function isGithubRateLimitResponse(response: Response): boolean {
  if (response.status === 429) return true
  if (response.status !== 403) return false
  return parseGithubRateLimitDelayMs(response.headers) !== null
}

async function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

async function fetchGithubWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT,
  maxRateLimitRetries: number = GITHUB_RATE_LIMIT_MAX_RETRIES,
): Promise<Response> {
  let lastResponse: Response | null = null
  const headers = await mergeGithubHeaders(options.headers)
  const requestOptions: RequestInit = {
    ...options,
    headers,
  }

  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    const response = await fetchWithTimeout(url, requestOptions, timeoutMs)
    if (!isGithubRateLimitResponse(response)) {
      return response
    }

    lastResponse = response
    if (attempt >= maxRateLimitRetries) {
      return response
    }

    const parsedDelay = parseGithubRateLimitDelayMs(response.headers)
    const fallbackDelay = GITHUB_RATE_LIMIT_FALLBACK_DELAY_MS * (attempt + 1)
    const delayMs = parsedDelay ?? clampGithubRateLimitDelayMs(fallbackDelay)
    console.warn(`[GitHub] Rate limited (${response.status}) for ${url}; retrying in ${delayMs}ms`)
    await sleep(delayMs)
  }

  return lastResponse ?? await fetchWithTimeout(url, requestOptions, timeoutMs)
}

export async function getRepoInfo(
  owner: string,
  repo: string,
  options?: { timeoutMs?: number }
): Promise<RepoInfo> {
  const cacheKey = getCacheKey(owner, repo, 'info')
  const cached = getFromCache<RepoInfo>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchGithubWithRetry(
      `https://api.github.com/repos/${owner}/${repo}`,
      {},
      options?.timeoutMs ?? 5000
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
      defaultBranch: data.default_branch || '',
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

export async function getDefaultBranch(
  owner: string,
  repo: string,
  options?: { timeoutMs?: number }
): Promise<string> {
  const info = await getRepoInfo(owner, repo, options)
  return info.defaultBranch || 'main'
}

export interface RawFileFetchOptions {
  timeoutMs?: number
}

export async function getRawFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  options: RawFileFetchOptions = {}
): Promise<string | null> {
  const normalizedPath = normalizeGithubFilePath(filePath)
  if (!normalizedPath) {
    return null
  }

  const cacheKey = getCacheKey(owner, repo, `raw_${branch}_${normalizedPath}`)
  const cached = getFromCache<string>(cacheKey)
  if (cached) return cached

  try {
    const url = buildRawGithubUrl(owner, repo, branch, normalizedPath)
    if (!url) {
      return null
    }
    const response = await fetchGithubWithRetry(url, {}, options.timeoutMs ?? DEFAULT_TIMEOUT)
    if (!response.ok) {
      return null
    }

    const content = await response.text()
    setCache(cacheKey, content)
    return content
  } catch (error) {
    console.debug(`Failed to fetch raw file ${filePath}:`, error)
    return null
  }
}

export async function getReadme(owner: string, repo: string): Promise<string> {
  const cacheKey = getCacheKey(owner, repo, 'readme')
  const cached = getFromCache<string>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchGithubWithRetry(
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
  path: string = '',
  options?: { maxRateLimitRetries?: number }
): Promise<any> {
  const cacheKey = getCacheKey(owner, repo, `tree_${path || 'root'}`)
  const cached = getFromCache<any>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchGithubWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {},
      10000,
      options?.maxRateLimitRetries,
    )

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    setCache(cacheKey, data)
    return data
  } catch (error) {
    console.debug('Failed to fetch repo tree:', error)
    throw error
  }
}

export async function getPackageJson(owner: string, repo: string): Promise<any> {
  const cacheKey = getCacheKey(owner, repo, 'package.json')
  const cached = getFromCache<any>(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchGithubWithRetry(
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
    const response = await fetchGithubWithRetry(
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

export interface GithubWebTreeEntry extends TreeNode {
  type: 'file' | 'dir'
}

interface GithubRecursiveTreeEntry {
  path?: string
  type?: string
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
const apiLimiter = new ConcurrencyLimiter(3)

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeGithubPath(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

function buildGithubWebTreeUrl(owner: string, repo: string, path: string): string {
  const encodedOwner = encodeURIComponent(owner)
  const encodedRepo = encodeURIComponent(repo)
  const normalizedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return normalizedPath
    ? `https://github.com/${encodedOwner}/${encodedRepo}/tree/HEAD/${normalizedPath}`
    : `https://github.com/${encodedOwner}/${encodedRepo}/tree/HEAD`
}

export function parseGithubWebTreeEntries(
  owner: string,
  repo: string,
  html: string,
): GithubWebTreeEntry[] {
  const escapedOwner = escapeRegExp(owner)
  const escapedRepo = escapeRegExp(repo)
  const hrefPattern = new RegExp(
    `href=["']/${escapedOwner}/${escapedRepo}/(blob|tree)/[^/"']+/([^"'?#]+)["']`,
    'g',
  )
  const entries = new Map<string, GithubWebTreeEntry>()

  for (const match of html.matchAll(hrefPattern)) {
    const type = match[1] === 'tree' ? 'dir' : 'file'
    const path = normalizeGithubFilePath(decodeGithubPath(match[2] || ''))
    if (!path) continue
    const name = path.split('/').pop() || path
    if (shouldIgnore(name)) continue
    const key = `${type}:${path}`
    if (!entries.has(key)) {
      entries.set(key, { name, path, type })
    }
  }

  return Array.from(entries.values())
}

function isIgnoredPath(path: string): boolean {
  return path.split('/').some((segment) => shouldIgnore(segment))
}

function insertFlatTreePath(root: TreeNode[], filePath: string, type: 'file' | 'dir'): void {
  const segments = filePath.split('/').filter(Boolean)
  if (segments.length === 0) return

  let siblings = root
  let currentPath = ''

  segments.forEach((segment, index) => {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment
    const isLeaf = index === segments.length - 1
    const nodeType: TreeNode['type'] = isLeaf ? type : 'dir'
    let node = siblings.find((item) => item.name === segment && item.path === currentPath)

    if (!node) {
      node = {
        name: segment,
        path: currentPath,
        type: nodeType,
        ...(nodeType === 'dir' ? { children: [] } : {}),
      }
      siblings.push(node)
    }

    if (!isLeaf || node.type === 'dir') {
      node.children ||= []
      siblings = node.children
    }
  })
}

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'dir' ? -1 : 1
  })
  nodes.forEach((node) => {
    if (node.children?.length) sortTreeNodes(node.children)
  })
  return nodes
}

export function buildDirectoryTreeFromGithubEntries(
  entries: GithubRecursiveTreeEntry[],
  maxDepth: number,
): TreeNode[] {
  const nodes: TreeNode[] = []
  const maxSegments = Math.max(1, maxDepth + 1)

  for (const entry of entries) {
    const path = normalizeGithubFilePath(entry.path || '')
    if (!path || isIgnoredPath(path)) continue
    if (path.split('/').length > maxSegments) continue

    if (entry.type === 'tree') {
      insertFlatTreePath(nodes, path, 'dir')
      continue
    }
    if (entry.type === 'blob') {
      insertFlatTreePath(nodes, path, 'file')
    }
  }

  return sortTreeNodes(nodes)
}

export async function getGithubWebDirectoryPaths(
  owner: string,
  repo: string,
  path: string,
): Promise<string[]> {
  const normalizedPath = normalizeGithubFilePath(path)
  if (!normalizedPath || isIgnoredPath(normalizedPath)) return []

  try {
    const response = await fetchWithTimeout(
      buildGithubWebTreeUrl(owner, repo, normalizedPath),
      {
        headers: {
          Accept: 'text/html',
        },
      },
      GITHUB_WEB_TREE_TIMEOUT_MS,
    )
    if (!response.ok) return []

    const prefix = `${normalizedPath}/`
    return parseGithubWebTreeEntries(owner, repo, await response.text())
      .filter((entry) => entry.type === 'file' && entry.path.startsWith(prefix))
      .map((entry) => entry.path)
  } catch (error) {
    console.debug(`Failed to fetch GitHub web directory paths at ${normalizedPath}:`, error)
    return []
  }
}

async function getGithubRecursiveDirectoryTree(
  owner: string,
  repo: string,
  maxDepth: number,
): Promise<TreeNode[]> {
  const response = await fetchGithubWithRetry(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {},
    GITHUB_WEB_TREE_TIMEOUT_MS,
    0,
  )
  if (!response.ok) return []

  const data = await response.json()
  const entries = Array.isArray(data?.tree) ? data.tree : []
  return buildDirectoryTreeFromGithubEntries(entries, maxDepth)
}

async function getGithubWebDirectoryTree(
  owner: string,
  repo: string,
  maxDepth: number,
): Promise<TreeNode[]> {
  async function fetchWebTree(path: string, depth: number): Promise<TreeNode[]> {
    if (depth > maxDepth) return []

    try {
      const response = await fetchWithTimeout(
        buildGithubWebTreeUrl(owner, repo, path),
        {
          headers: {
            Accept: 'text/html',
          },
        },
        GITHUB_WEB_TREE_TIMEOUT_MS,
      )
      if (!response.ok) return []

      const entries = parseGithubWebTreeEntries(owner, repo, await response.text())
      const nodes: TreeNode[] = []

      for (const entry of entries) {
        const node: TreeNode = {
          name: entry.name,
          path: entry.path,
          type: entry.type,
        }

        if (entry.type === 'dir' && depth < maxDepth) {
          node.children = await fetchWebTree(entry.path, depth + 1)
        }

        nodes.push(node)
      }

      nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'dir' ? -1 : 1
      })

      return nodes
    } catch (error) {
      console.debug(`Failed to fetch GitHub web tree at ${path || '/'}:`, error)
      return []
    }
  }

  return fetchWebTree('', 0)
}

// Get full directory tree (recursive with concurrency control)
export async function getFullDirectoryTree(
  owner: string,
  repo: string,
  maxDepth: number = 3
): Promise<TreeNode[]> {
  const cacheKey = getCacheKey(owner, repo, `full_tree_${FULL_TREE_CACHE_VERSION}_${maxDepth}`)
  const cached = getFromCache<TreeNode[]>(cacheKey)
  if (cached) return cached

  let tree = await getGithubRecursiveDirectoryTree(owner, repo, maxDepth).catch((error) => {
    console.debug('Failed to fetch recursive repo tree:', error)
    return [] as TreeNode[]
  })
  if (tree.length > 0) {
    setCache(cacheKey, tree)
    return tree
  }

  async function fetchTree(path: string, depth: number): Promise<TreeNode[]> {
    if (depth > maxDepth) return []

    try {
      // Use concurrency limiter for API requests
      const contents = await apiLimiter.run(() =>
        getRepoTree(owner, repo, path, { maxRateLimitRetries: 0 })
      )
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

  tree = await fetchTree('', 0)
  if (tree.length === 0) {
    tree = await getGithubWebDirectoryTree(owner, repo, maxDepth)
  }
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
    const response = await fetchGithubWithRetry(
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
  // Get file lists for root and src directories first
  const rootTree = await getRepoTree(owner, repo, '')
  const srcTree = await getRepoTree(owner, repo, 'src').catch(() => [])

  const allFiles = [
    ...(Array.isArray(rootTree) ? rootTree : []),
    ...(Array.isArray(srcTree) ? srcTree.map((f: any) => ({ ...f, path: `src/${f.name}` })) : [])
  ]

  // Check package.json main field, but only if it points to a source file (not dist/build)
  const packageJson = await getPackageJson(owner, repo)
  if (packageJson?.main) {
    const mainPath = packageJson.main
    // Skip if main points to dist/, build/, or other build output directories
    if (!mainPath.startsWith('dist/') && 
        !mainPath.startsWith('build/') && 
        !mainPath.startsWith('lib/') &&
        !mainPath.includes('/dist/') &&
        !mainPath.includes('/build/')) {
      // Verify the file actually exists in the repo
      const exists = allFiles.some((f: any) => f.path === mainPath || f.name === mainPath)
      if (exists) {
        return mainPath
      }
    }
    
    // If main points to dist/, try to find corresponding source file
    // e.g., dist/index.js -> src/index.ts
    if (mainPath.startsWith('dist/') || mainPath.startsWith('build/')) {
      const baseName = mainPath.replace(/^(dist|build)\//, '').replace(/\.js$/, '')
      const sourcePatterns = [
        `src/${baseName}.ts`,
        `src/${baseName}.tsx`,
        `src/${baseName}.js`,
        `src/${baseName}.jsx`,
        `${baseName}.ts`,
        `${baseName}.tsx`,
      ]
      for (const pattern of sourcePatterns) {
        const found = allFiles.find((f: any) => f.path === pattern)
        if (found) {
          console.log(`[findEntryFile] Mapped ${mainPath} to source file: ${found.path}`)
          return found.path
        }
      }
    }
  }

  // Find entry file by priority patterns
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
