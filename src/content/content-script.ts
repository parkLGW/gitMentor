// Content script for injecting GitMentor floating widget on GitHub pages
import type { DeepFileAnalysisResult } from '@/types/learning'
import { buildFileLocalInsight } from '@/services/file-insights'
import type { FileInsightSymbolKind } from '@/services/file-insights'
import { parseGithubBlobPath } from '@/services/github-url'

const STORAGE_KEYS = {
  language: 'gitmentor_language',
  legacyLanguage: 'language',
  llmConfig: 'gitmentor_llm_config',
} as const

// Track the current file (owner/repo/branch/path) to detect changes
let currentFileKey: string | null = null
let currentLanguage: 'zh' | 'en' = 'en'

// Get current language from storage
async function getLanguage(): Promise<'zh' | 'en'> {
  try {
    if (!isExtensionContextValid()) return 'en'
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.language,
      STORAGE_KEYS.legacyLanguage,
    ])
    return result[STORAGE_KEYS.language] || result[STORAGE_KEYS.legacyLanguage] || 'en'
  } catch (e) {
    console.warn('[GitMentor] Could not get language:', e)
    return 'en'
  }
}

// Translations for sidebar UI
const uiTranslations = {
  zh: {
    readingFile: '正在读取当前文件...',
    keySymbols: '结构',
    dependencies: '依赖',
    noSymbols: '未检测到明显的函数、类或类型定义',
    aiAnalysis: 'AI 深度解读这个文件',
    configureLLM: '配置 LLM 后可生成文件解释',
    openSettings: '打开 GitMentor 设置',
    deepAnalysisInProgress: '正在进行 AI 深度分析...',
    mayTakeMoment: '这可能需要一点时间',
    deepAnalysisFailed: '深度分析失败',
    requestFailed: '请求失败，请刷新页面后重试',
    thinking: '思考中...',
    todos: '待办',
    promptTruncated: 'AI 仅读取前 20KB',
    extensionReloaded: 'GitMentor 已更新或重新加载，请刷新页面后继续',
    fetchFileFailed: '读取文件内容失败',
  },
  en: {
    readingFile: 'Reading current file...',
    keySymbols: 'Structure',
    dependencies: 'Dependencies',
    noSymbols: 'No obvious functions, classes, or types detected',
    aiAnalysis: 'Explain this file with AI',
    configureLLM: 'Configure an LLM to generate file explanations',
    openSettings: 'Open GitMentor Settings',
    deepAnalysisInProgress: 'Performing deep analysis with AI...',
    mayTakeMoment: 'This may take a moment',
    deepAnalysisFailed: 'Deep analysis failed',
    requestFailed: 'Request failed. Please refresh the page and try again.',
    thinking: 'Thinking...',
    todos: 'TODOs',
    promptTruncated: 'AI reads first 20KB only',
    extensionReloaded: 'GitMentor was updated or reloaded. Refresh the page to continue.',
    fetchFileFailed: 'Could not read the file',
  },
}

type UITranslationKey = keyof typeof uiTranslations.en

function isGithubDarkMode(): boolean {
  const mode = document.documentElement.getAttribute('data-color-mode')
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Remaps the light-palette inline styles to GitHub dark equivalents.
// Identity in light mode, so the light style strings stay the single source
// of truth and only this table needs updating for new colors.
function themedStyle(style: string): string {
  if (!isGithubDarkMode()) return style
  return style
    .replace(/background:\s*#24292e/gi, 'background:#e6edf3')
    .replace(/color:\s*white/gi, 'color:#0d1117')
    .replace(/background:\s*white\b/gi, 'background:#0d1117')
    .replace(/background:\s*#fff\b/gi, 'background:#161b22')
    .replace(/color:\s*#24292e/gi, 'color:#e6edf3')
    .replace(/#24292f/gi, '#e6edf3')
    .replace(/#f6f8fa/gi, '#21262d')
    .replace(/#f0f2f5/gi, '#21262d')
    .replace(/#d8dee4/gi, '#30363d')
    .replace(/#eaeef2/gi, '#30363d')
    .replace(/#e1e4e8/gi, '#30363d')
    .replace(/#57606a/gi, '#8b949e')
    .replace(/#8c959f/gi, '#6e7681')
    .replace(/#666\b/gi, '#8b949e')
    .replace(/#ffebe9/gi, '#3c1618')
    .replace(/#ffeef0/gi, '#3c1618')
    .replace(/#ffcecb/gi, '#8e1519')
    .replace(/#cf222e/gi, '#ff7b72')
    .replace(/#d73a49/gi, '#ff7b72')
    .replace(/#ddf4ff/gi, '#0c2d6b')
    .replace(/#b6e3ff/gi, '#1f6feb')
    .replace(/#0969da/gi, '#79c0ff')
    .replace(/#fff8c5/gi, '#3b2e00')
    .replace(/#f0d98c/gi, '#9e6a03')
    .replace(/#9a6700/gi, '#e3b341')
    .replace(/#f0f7ff/gi, '#121d2f')
    .replace(/#374151/gi, '#c9d1d9')
    .replace(/#334155/gi, '#c9d1d9')
    .replace(/#4b5563/gi, '#8b949e')
    .replace(/#ccc\b/gi, '#57606a')
}

function getText(key: UITranslationKey) {
  return uiTranslations[currentLanguage][key]
}

// Save language preference
function detectAndSaveLanguage() {
  try {
    if (!isExtensionContextValid()) return
    const language = navigator.language?.startsWith('zh') ? 'zh' : 'en'
    chrome.storage.local.set({ [STORAGE_KEYS.language]: language })
    currentLanguage = language
  } catch (e) {
    console.warn('[GitMentor] Could not save language preference:', e)
  }
}

interface FileInfo {
  owner: string
  repo: string
  branch: string
  path: string
}

// /owner/repo/blob/<ref>/<path> is ambiguous because <ref> may itself contain
// slashes, so the page has to tell us where the ref ends. A hint that does not
// match the URL is simply ignored, which keeps a stale or malformed one harmless.
function collectBranchHints(): string[] {
  const hints: string[] = []
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) hints.push(value.trim())
  }

  try {
    document
      .querySelectorAll('script[type="application/json"][data-target="react-app.embeddedData"]')
      .forEach((node) => {
        try {
          const payload = JSON.parse(node.textContent || '{}')?.payload
          push(payload?.refInfo?.name)
        } catch {
          // Embedded payloads are not part of any contract; ignore unparsable ones
        }
      })
  } catch {
    // querySelectorAll can throw on very old engines only; stay silent
  }

  document
    .querySelectorAll('#branch-picker-repos-header-ref-selector, [data-hotkey="w"]')
    .forEach((node) => push(node.textContent))

  return hints
}

let cachedBlobParse: { pathname: string; fileInfo: FileInfo } | null = null

function parseFileUrl(): FileInfo | null {
  const pathname = window.location.pathname
  if (cachedBlobParse?.pathname === pathname) return cachedBlobParse.fileInfo

  // Cheap shape check first — this runs on every debounced mutation, and on a
  // non-blob page it must not reach the DOM scan below
  const fallback = parseGithubBlobPath(pathname, [])
  if (!fallback) return null

  const hints = collectBranchHints()
  const fileInfo = hints.length > 0 ? parseGithubBlobPath(pathname, hints) : fallback
  // Only memoize a parse the page confirmed. A hintless parse can split a ref
  // containing slashes in the wrong place, and on SPA navigation the page
  // publishes its ref slightly after the URL changes — so keep re-reading until
  // a hint actually matches.
  if (fileInfo && hints.includes(fileInfo.branch)) {
    cachedBlobParse = { pathname, fileInfo }
  }
  return fileInfo
}

// Identifies the file across repos and branches: two different repos can serve
// the same path, and the sidebar must not treat them as the same file.
function getFileKey(fileInfo: FileInfo): string {
  return `${fileInfo.owner}/${fileInfo.repo}@${fileInfo.branch}:${fileInfo.path}`
}

// Dismissal is remembered per tab session rather than per file: closing the
// sidebar on one file only to have it reappear on the next one made the close
// button read as broken.
const DISMISSED_FILE_SIDEBAR_KEY = 'gitmentor:file-sidebar-dismissed'

const SIDEBAR_WIDTH_STORAGE_KEY = 'gitmentor:file-sidebar-width'
const SIDEBAR_MIN_WIDTH = 280
const SIDEBAR_MAX_WIDTH = 560
const SIDEBAR_DEFAULT_WIDTH = 380
// Under this viewport the sidebar floats above the page instead of reserving
// space, because shrinking GitHub's own layout any further breaks it
const SIDEBAR_RESERVE_MIN_VIEWPORT = 1000

let sidebarWidth = SIDEBAR_DEFAULT_WIDTH
let originalBodyPaddingRight: string | null = null
let fileSidebarSuppressed = false

function clampSidebarWidth(width: number): number {
  const viewportCap = Math.max(SIDEBAR_MIN_WIDTH, Math.round(window.innerWidth * 0.5))
  const upperBound = Math.min(SIDEBAR_MAX_WIDTH, viewportCap)
  return Math.round(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), upperBound))
}

function readStoredSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return stored
  } catch {
    // localStorage can be blocked; fall back to the default width
  }
  return SIDEBAR_DEFAULT_WIDTH
}

function persistSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // Width is a nicety, not worth surfacing a failure for
  }
}

// Gives the page back the strip the sidebar occupies, so the file view is
// narrowed rather than covered. Passing null restores the page's own padding.
function reserveLayoutForSidebar(width: number | null) {
  const body = document.body
  if (!body) return

  if (width === null) {
    if (originalBodyPaddingRight !== null) {
      body.style.paddingRight = originalBodyPaddingRight
      originalBodyPaddingRight = null
    }
    return
  }

  if (originalBodyPaddingRight === null) {
    originalBodyPaddingRight = body.style.paddingRight
  }
  body.style.paddingRight = `${width}px`
}

// The floating widget sits at the bottom-right on a higher layer than the
// sidebar, so it would otherwise hover on top of the sidebar's content.
function keepWidgetClearOfSidebar(occupiedWidth: number) {
  const widget = document.getElementById('gitmentor-widget') as HTMLElement | null
  if (!widget || widget.style.display === 'none') return

  const rect = widget.getBoundingClientRect()
  if (rect.width === 0) return

  const limit = window.innerWidth - occupiedWidth - 12
  if (rect.right <= limit) return

  widget.style.right = 'auto'
  widget.style.left = `${Math.max(12, limit - rect.width)}px`
}

function applySidebarLayout() {
  const sidebar = document.getElementById('gitmentor-file-sidebar') as HTMLElement | null
  const resizer = document.getElementById('gitmentor-file-sidebar-resize') as HTMLElement | null

  if (!sidebar || sidebar.style.display === 'none') {
    reserveLayoutForSidebar(null)
    if (resizer) resizer.style.display = 'none'
    return
  }

  const width = clampSidebarWidth(sidebarWidth)
  sidebar.style.width = `${width}px`
  if (resizer) {
    resizer.style.display = ''
    resizer.style.right = `${width - 3}px`
  }
  reserveLayoutForSidebar(window.innerWidth >= SIDEBAR_RESERVE_MIN_VIEWPORT ? width : null)
  keepWidgetClearOfSidebar(width)
}

function createSidebarResizer(): HTMLElement {
  const resizer = document.createElement('div')
  resizer.id = 'gitmentor-file-sidebar-resize'
  resizer.title = currentLanguage === 'zh' ? '拖动调整宽度' : 'Drag to resize'
  resizer.style.cssText = `
    position: fixed;
    top: 0;
    width: 6px;
    height: 100vh;
    z-index: 5001;
    cursor: col-resize;
    background: transparent;
  `

  resizer.addEventListener('mousedown', (event) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = clampSidebarWidth(sidebarWidth)
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    const onMove = (moveEvent: MouseEvent) => {
      sidebarWidth = clampSidebarWidth(startWidth + (startX - moveEvent.clientX))
      applySidebarLayout()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = previousUserSelect
      persistSidebarWidth(sidebarWidth)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  return resizer
}

// The main panel covers the same screen edge as the sidebar, so only one of the
// two is ever on screen.
function setFileSidebarSuppressed(suppressed: boolean) {
  fileSidebarSuppressed = suppressed

  const ids = [
    'gitmentor-file-sidebar',
    'gitmentor-file-sidebar-resize',
    'gitmentor-file-sidebar-collapsed',
  ]
  ids.forEach((id) => {
    const element = document.getElementById(id) as HTMLElement | null
    if (element) element.style.display = suppressed ? 'none' : ''
  })

  applySidebarLayout()
  if (!suppressed) void injectFileSidebar()
}

function removeFileSidebarUi() {
  document.getElementById('gitmentor-file-sidebar')?.remove()
  document.getElementById('gitmentor-file-sidebar-resize')?.remove()
  document.getElementById('gitmentor-file-sidebar-collapsed')?.remove()
  reserveLayoutForSidebar(null)
  currentFileKey = null
}

function showFileSidebarCollapsedHandle(fileInfo: FileInfo) {
  currentFileKey = getFileKey(fileInfo)
  if (document.getElementById('gitmentor-file-sidebar-collapsed')) return

  const handle = document.createElement('button')
  handle.id = 'gitmentor-file-sidebar-collapsed'
  handle.type = 'button'
  handle.textContent = 'GitMentor'
  handle.title = currentLanguage === 'zh' ? '重新打开文件理解侧栏' : 'Reopen file insight sidebar'
  handle.style.cssText = themedStyle(`
    position: fixed;
    right: 0;
    top: 96px;
    z-index: 5000;
    writing-mode: vertical-rl;
    padding: 10px 6px;
    background: #24292e;
    color: white;
    border: 1px solid rgba(27, 31, 35, 0.15);
    border-right: none;
    border-radius: 8px 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.16);
  `)
  handle.addEventListener('click', () => {
    sessionStorage.removeItem(DISMISSED_FILE_SIDEBAR_KEY)
    handle.remove()
    currentFileKey = null
    void injectFileSidebar()
  })
  document.body.appendChild(handle)
}

function isCodeFile(filePath: string): boolean {
  // List of code file extensions
  const codeExtensions = [
    'js', 'ts', 'tsx', 'jsx',
    'py', 'pyc', 'pyw',
    'java', 'class', 'jar',
    'cs', 'cpp', 'c', 'h', 'hpp',
    'go', 'rs', 'rb', 'php',
    'swift', 'kt', 'scala', 'groovy',
    'sql', 'sh', 'bash', 'zsh',
    'html', 'htm', 'xml', 'css', 'scss', 'less',
    'json', 'yaml', 'yml', 'toml', 'ini', 'conf',
    'vue', 'svelte',
    'r', 'R',
    'pl', 'lua',
  ]
  
  // List of non-code file extensions to skip
  const nonCodeExtensions = [
    'md', 'markdown', 'txt', 'text',
    'rst', 'adoc', 'asciidoc',
    'pdf', 'doc', 'docx', 'odt',
    'xls', 'xlsx', 'csv',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
    'mp3', 'mp4', 'webm', 'mov',
    'zip', 'tar', 'gz', 'rar',
  ]
  
  // Get file extension
  const match = filePath.match(/\.([^.]+)$/)
  if (!match) return true // If no extension, assume it's code
  
  const ext = match[1].toLowerCase()
  
  // If explicitly a non-code file, skip
  if (nonCodeExtensions.includes(ext)) {
    console.log('[GitMentor] Skipping non-code file:', filePath, 'extension:', ext)
    return false
  }
  
  // If it's a known code extension, show sidebar
  if (codeExtensions.includes(ext)) {
    return true
  }
  
  // For unknown extensions, be conservative and show sidebar
  return true
}

let fileSidebarInjectionInFlight = false

async function injectFileSidebar() {
  // The main panel owns the screen edge while it is open; the sidebar is
  // restored by setFileSidebarSuppressed(false) when the panel closes
  if (fileSidebarSuppressed) return

  const fileInfo = parseFileUrl()
  if (!fileInfo) {
    removeFileSidebarUi()
    return
  }

  // Check if this is a code file
  if (!isCodeFile(fileInfo.path)) {
    console.log('[GitMentor] Not a code file, skipping sidebar injection:', fileInfo.path)
    removeFileSidebarUi()
    return
  }

  // The duplicate-sidebar check below only works after the async language load,
  // so concurrent calls must be blocked before any await
  if (fileSidebarInjectionInFlight) {
    scheduleInjection(120)
    return
  }
  fileSidebarInjectionInFlight = true
  try {
    await injectFileSidebarForFile(fileInfo)
  } finally {
    fileSidebarInjectionInFlight = false
  }
}

async function injectFileSidebarForFile(fileInfo: FileInfo) {
  // Load current language
  currentLanguage = await getLanguage()

  if (sessionStorage.getItem(DISMISSED_FILE_SIDEBAR_KEY) === '1') {
    document.getElementById('gitmentor-file-sidebar')?.remove()
    document.getElementById('gitmentor-file-sidebar-resize')?.remove()
    reserveLayoutForSidebar(null)
    showFileSidebarCollapsedHandle(fileInfo)
    return
  }
  document.getElementById('gitmentor-file-sidebar-collapsed')?.remove()
  
  console.log('[GitMentor] Detected code file:', fileInfo.path)

  const fileKey = getFileKey(fileInfo)

  // Check if sidebar already exists for the same file
  if (document.getElementById('gitmentor-file-sidebar') && currentFileKey === fileKey) {
    console.log('[GitMentor] File sidebar already exists for:', fileKey)
    return
  }

  // If sidebar exists but file changed, remove it
  if (document.getElementById('gitmentor-file-sidebar') && currentFileKey !== fileKey) {
    console.log('[GitMentor] File changed from', currentFileKey, 'to', fileKey, ', updating sidebar')
    document.getElementById('gitmentor-file-sidebar')?.remove()
  }

  currentFileKey = fileKey
  
  sidebarWidth = clampSidebarWidth(readStoredSidebarWidth())

  // Create sidebar container
  const sidebar = document.createElement('div')
  sidebar.id = 'gitmentor-file-sidebar'
  sidebar.style.cssText = themedStyle(`
    position: fixed;
    right: 0;
    top: 0;
    width: ${sidebarWidth}px;
    height: 100vh;
    background: white;
    border-left: 1px solid #e1e4e8;
    z-index: 5000;
    overflow-y: auto;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  `)

  // Header
  const header = document.createElement('div')
  header.style.cssText = themedStyle(`
    padding: 16px;
    border-bottom: 1px solid #e1e4e8;
    position: sticky;
    top: 0;
    background: #f6f8fa;
    z-index: 100;
  `)
  header.innerHTML = themedStyle(`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <div style="font-size: 14px; font-weight: 600; color: #24292e;">GitMentor</div>
      <button id="gitmentor-sidebar-close" style="
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        padding: 0;
      ">×</button>
    </div>
  `)
  // Decoded repo paths may contain markup characters, so never interpolate them
  // into innerHTML
  const headerPath = document.createElement('div')
  headerPath.style.cssText = themedStyle(
    'font-size: 12px; color: #666; margin-top: 8px; word-break: break-all;')
  headerPath.textContent = fileInfo.path
  header.appendChild(headerPath)

  // Content area
  const content = document.createElement('div')
  content.id = 'gitmentor-file-content'
  content.style.cssText = themedStyle(`
    padding: 16px;
    font-size: 13px;
    color: #24292e;
  `)
  renderFileLoading(content)
  
  sidebar.appendChild(header)
  sidebar.appendChild(content)
  document.body.appendChild(sidebar)

  document.getElementById('gitmentor-file-sidebar-resize')?.remove()
  document.body.appendChild(createSidebarResizer())
  applySidebarLayout()

  // Close button
  const closeBtn = header.querySelector('#gitmentor-sidebar-close')
  closeBtn?.addEventListener('click', () => {
    sessionStorage.setItem(DISMISSED_FILE_SIDEBAR_KEY, '1')
    sidebar.remove()
    document.getElementById('gitmentor-file-sidebar-resize')?.remove()
    reserveLayoutForSidebar(null)
    showFileSidebarCollapsedHandle(fileInfo)
  })

  fetchAndAnalyzeFile(fileInfo, content)
}

function createSectionTitle(text: string): HTMLHeadingElement {
  const title = document.createElement('h4')
  title.style.cssText = themedStyle(
    'font-size:13px;font-weight:600;margin:0 0 8px 0;color:#24292e;')
  title.textContent = text
  return title
}

function createText(text: string, style = ''): HTMLParagraphElement {
  const p = document.createElement('p')
  p.style.cssText = themedStyle(style)
  p.textContent = text
  return p
}

// Cap on what is sent to the model, not on what the sidebar reads
const PROMPT_CONTENT_MAX_CHARS = 20000

interface FileData {
  fileName: string
  // The file exactly as fetched. Local metrics must be derived from this, never
  // from the capped copy below, or every file over the cap reports short counts.
  fileContent: string
  // Size-capped copy for the model
  promptContent: string
  promptTruncated: boolean
}

async function isLLMConfigured(): Promise<boolean> {
  try {
    if (!isExtensionContextValid()) return false
    const result = await chrome.storage.local.get([STORAGE_KEYS.llmConfig])
    return Boolean(result[STORAGE_KEYS.llmConfig])
  } catch (error) {
    console.warn('[GitMentor] Could not read LLM config:', error)
    return false
  }
}

function renderFileLoading(container: HTMLElement) {
  container.innerHTML = themedStyle(`
    <div style="padding:16px;background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;text-align:center;color:#57606a;font-size:12px;">
      <div style="display:inline-block;width:16px;height:16px;border:2px solid #57606a;border-top-color:transparent;border-radius:50%;animation:gitmentor-spin 1s linear infinite;margin-right:8px;vertical-align:middle;"></div>
      ${getText('readingFile')}
    </div>
    <style>@keyframes gitmentor-spin { to { transform: rotate(360deg); } }</style>
  `)
}

function createCard(accent = false): HTMLDivElement {
  const card = document.createElement('div')
  card.style.cssText = themedStyle(
    `padding:12px;background:#fff;border:1px solid ${accent ? '#b6e3ff' : '#d8dee4'};border-radius:8px;`)
  return card
}

// themedStyle remaps whole declaration strings; this pulls a single color through
// the same table so individual style properties can use it too.
function themedColor(color: string): string {
  return themedStyle(`color:${color}`).slice('color:'.length)
}

// A single letter costs a fraction of the width of a "function"/"interface"
// chip, which matters at the 280px minimum sidebar width where the symbol name
// is already being ellipsised. The full word lives in the tooltip.
const SYMBOL_KIND_BADGES: Record<FileInsightSymbolKind, string> = {
  function: 'F',
  class: 'C',
  component: 'R',
  hook: 'H',
  type: 'T',
  interface: 'I',
  constant: 'K',
}

const SYMBOL_KIND_LABELS: Record<'zh' | 'en', Record<FileInsightSymbolKind, string>> = {
  zh: {
    function: '函数',
    class: '类',
    component: '组件',
    hook: 'Hook',
    type: '类型',
    interface: '接口',
    constant: '常量',
  },
  en: {
    function: 'function',
    class: 'class',
    component: 'component',
    hook: 'hook',
    type: 'type',
    interface: 'interface',
    constant: 'constant',
  },
}

function createSymbolBadge(kind: FileInsightSymbolKind): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.textContent = SYMBOL_KIND_BADGES[kind]
  badge.title = SYMBOL_KIND_LABELS[currentLanguage][kind]
  badge.style.cssText = themedStyle(
    'flex-shrink:0;width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;background:#eaeef2;color:#57606a;font-family:ui-monospace,SFMono-Regular,SFMono,Consolas,monospace;font-size:10px;font-weight:600;')
  return badge
}

// The classic blob view renders every line, so the element can just be found.
function findFileLineElement(lineNumber: number): Element | null {
  return (
    document.getElementById(`LC${lineNumber}`) ||
    document.getElementById(`L${lineNumber}`) ||
    document.querySelector(`[data-line-number="${lineNumber}"]`)
  )
}

interface BlobLineGeometry {
  topDoc: number
  lineHeight: number
}

// The current blob view virtualises the file: `.react-code-lines` is an empty
// spacer of the file's full height and no line element exists until it scrolls
// into range. What that gives us is an exact line height (spacer height over the
// file's line count), which is enough to compute where any line sits without the
// element ever existing.
function readBlobLineGeometry(fallbackTotalLines: number): BlobLineGeometry | null {
  const spacer = document.querySelector('.react-code-lines') as HTMLElement | null
  const textArea = document.querySelector(
    '#read-only-cursor-text-area',
  ) as HTMLTextAreaElement | null
  const surface = spacer || textArea
  if (!surface) return null

  const rect = surface.getBoundingClientRect()
  // The page's own line count is authoritative for its geometry
  const totalLines = textArea ? textArea.value.split('\n').length : fallbackTotalLines
  if (!(totalLines > 0) || !(rect.height > 0)) return null

  return {
    topDoc: rect.top + window.scrollY,
    lineHeight: rect.height / totalLines,
  }
}

// Never assign location.hash here: GitHub reads #L<n> only during its initial
// render, so after load it scrolls nowhere, and an anchor that matches no element
// makes the browser jump to the top of the document instead. replaceState keeps
// the URL shareable — and correct on reload — without navigating.
function jumpToFileLine(lineNumber: number, totalLines: number) {
  if (!(lineNumber > 0)) return

  const scrollSmoothly = (top: number) => {
    const distance = Math.abs(top - window.scrollY)
    window.scrollTo({
      top: Math.max(0, top),
      // Animating a jump of several thousand pixels just wastes the reader's time
      behavior: distance > window.innerHeight * 3 ? 'auto' : 'smooth',
    })
    history.replaceState(null, '', `#L${lineNumber}`)
  }

  const target = findFileLineElement(lineNumber)
  if (target) {
    const rect = target.getBoundingClientRect()
    scrollSmoothly(rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2)
    return
  }

  const geometry = readBlobLineGeometry(totalLines)
  if (!geometry) return

  scrollSmoothly(
    geometry.topDoc +
      (lineNumber - 1) * geometry.lineHeight -
      window.innerHeight / 2 +
      geometry.lineHeight / 2,
  )
}

function jumpLineTitle(lineNumber: number): string {
  return currentLanguage === 'zh'
    ? `跳转到第 ${lineNumber} 行`
    : `Jump to line ${lineNumber}`
}

// Only relative and alias specifiers point at files in this repo — those are the
// ones worth offering a jump for.
function isLocalDependency(source: string): boolean {
  return /^[./]/.test(source) || /^[@~]\//.test(source)
}

// Inline styles cannot express :hover, so the row states are wired by hand
function applyHoverBackground(element: HTMLElement, hoverColor: string) {
  const base = element.style.background
  const hovered = themedColor(hoverColor)
  element.addEventListener('mouseenter', () => {
    element.style.background = hovered
  })
  element.addEventListener('mouseleave', () => {
    element.style.background = base
  })
}

// interactive chips render as real buttons so they are focusable and respond to
// Enter, not just to a mouse click on a styled span
function createChip(
  text: string,
  tone: 'blue' | 'gray' | 'amber' = 'gray',
  interactive = false,
): HTMLElement {
  const chip = document.createElement(interactive ? 'button' : 'span')
  if (chip instanceof HTMLButtonElement) chip.type = 'button'
  const colors = {
    blue: 'background:#ddf4ff;color:#0969da;border-color:#b6e3ff;',
    gray: 'background:#f6f8fa;color:#57606a;border-color:#d8dee4;',
    amber: 'background:#fff8c5;color:#9a6700;border-color:#f0d98c;',
  }
  chip.style.cssText = themedStyle(
    `display:inline-flex;align-items:center;max-width:100%;padding:3px 8px;border:1px solid;border-radius:999px;font-size:11px;line-height:1.4;word-break:break-word;${
      interactive ? 'font-family:inherit;cursor:pointer;' : ''
    }${colors[tone]}`)
  chip.textContent = text
  return chip
}

const MONO_FONT = 'ui-monospace,SFMono-Regular,SFMono,Consolas,monospace'

// The popup renders Markdown with react-markdown, but the content script is
// bundled without runtime imports, so answers used to be dumped as plain text
// with the ** and backticks still in them. This covers what the model actually
// emits here: fenced code, inline code, bold, italics, headings and lists.
const MD_INLINE_PATTERN =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g

function createInlineMarkdownNode(token: string): Node {
  if (token.startsWith('`')) {
    const code = document.createElement('code')
    code.style.cssText = themedStyle(
      `font-family:${MONO_FONT};font-size:11px;background:#eaeef2;border-radius:4px;padding:1px 4px;`)
    code.textContent = token.slice(1, -1)
    return code
  }

  if (token.startsWith('**')) {
    const strong = document.createElement('strong')
    strong.textContent = token.slice(2, -2)
    return strong
  }

  if (token.startsWith('*') || token.startsWith('_')) {
    const em = document.createElement('em')
    em.textContent = token.slice(1, -1)
    return em
  }

  // Deliberately not an anchor: this is model output, and a live link would let
  // it send the reader anywhere. Show the destination as text instead.
  const closingBracket = token.indexOf('](')
  const label = token.slice(1, closingBracket)
  const url = token.slice(closingBracket + 2, -1)
  return document.createTextNode(`${label} (${url})`)
}

function appendInlineMarkdown(target: HTMLElement, text: string) {
  let lastIndex = 0
  for (const match of text.matchAll(MD_INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, index)))
    }
    target.appendChild(createInlineMarkdownNode(match[0]))
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)))
  }
}

interface MarkdownListMarker {
  ordered: boolean
  text: string
  indent: number
}

function readListMarker(line: string): MarkdownListMarker | null {
  const match = line.match(/^(\s*)(?:(\d+)[.)]|[-*+])\s+(.*)$/)
  if (!match) return null
  return { ordered: Boolean(match[2]), text: match[3], indent: match[1].length }
}

// Models answer with "1. **title**" followed by indented detail lines and
// sub-bullets. Flat line-by-line handling tore those apart, so an item also
// swallows the indented lines and nested lists that belong to it.
function appendMarkdownList(
  container: HTMLElement,
  lines: string[],
  start: number,
): number {
  const first = readListMarker(lines[start])
  if (!first) return start + 1

  const list = document.createElement(first.ordered ? 'ol' : 'ul')
  list.style.cssText = 'margin:0 0 8px 0;padding-left:18px;'
  let index = start

  while (index < lines.length) {
    const marker = readListMarker(lines[index])
    if (
      !marker ||
      marker.indent !== first.indent ||
      marker.ordered !== first.ordered
    ) {
      break
    }

    const li = document.createElement('li')
    li.style.cssText = 'margin:0 0 4px 0;'
    appendInlineMarkdown(li, marker.text)
    index += 1

    while (index < lines.length) {
      const raw = lines[index]
      if (!raw.trim()) break

      const nested = readListMarker(raw)
      if (nested && nested.indent > first.indent) {
        index = appendMarkdownList(li, lines, index)
        continue
      }
      if (nested) break

      const rawIndent = raw.length - raw.trimStart().length
      if (rawIndent <= first.indent) break

      const continuation = document.createElement('div')
      continuation.style.cssText = 'margin-top:2px;'
      appendInlineMarkdown(continuation, raw.trim())
      li.appendChild(continuation)
      index += 1
    }

    list.appendChild(li)
  }

  container.appendChild(list)
  return index
}

function renderMarkdownInto(container: HTMLElement, markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let index = 0
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const p = document.createElement('p')
    p.style.cssText = 'margin:0 0 8px 0;'
    appendInlineMarkdown(p, paragraph.join(' '))
    container.appendChild(p)
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushParagraph()
      const body: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        body.push(lines[index])
        index += 1
      }
      index += 1

      const pre = document.createElement('pre')
      pre.style.cssText = themedStyle(
        `margin:0 0 8px 0;padding:8px;background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;overflow-x:auto;font-family:${MONO_FONT};font-size:11px;line-height:1.5;white-space:pre;`)
      pre.textContent = body.join('\n')
      container.appendChild(pre)
      continue
    }

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      const title = document.createElement('p')
      title.style.cssText = themedStyle(
        'margin:10px 0 6px 0;font-size:12px;font-weight:600;color:#24292f;')
      appendInlineMarkdown(title, heading[2])
      container.appendChild(title)
      index += 1
      continue
    }

    if (readListMarker(line)) {
      flushParagraph()
      index = appendMarkdownList(container, lines, index)
      continue
    }

    paragraph.push(trimmed)
    index += 1
  }

  flushParagraph()
}

function confidenceText(confidence: DeepFileAnalysisResult['confidence']): string {
  if (currentLanguage === 'zh') {
    const labels = {
      high: '高',
      medium: '中',
      low: '低',
    } as const
    return `置信度：${labels[confidence] || confidence}`
  }
  return `Confidence: ${confidence}`
}

function createPrimaryButton(text: string, disabled = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = text
  button.disabled = disabled
  button.style.cssText = themedStyle(`
    width: 100%;
    padding: 10px 14px;
    background: ${disabled ? '#f6f8fa' : '#24292e'};
    color: ${disabled ? '#8c959f' : 'white'};
    border: 1px solid ${disabled ? '#d8dee4' : 'rgba(27, 31, 35, 0.15)'};
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
  `)
  return button
}

function renderInsightError(container: HTMLElement, message: string) {
  container.replaceChildren()
  const error = document.createElement('div')
  error.style.cssText = themedStyle(
    'color:#cf222e;padding:12px;background:#ffebe9;border:1px solid #ffcecb;border-radius:8px;font-size:12px;line-height:1.5;')
  error.textContent = message
  container.appendChild(error)
}

// The sidebar answers one question at a time; the main panel's Agent is the
// place with conversation history and cross-file retrieval, so hand off there
// rather than growing a second, weaker chat here.
function createContinueInAgentButton(
  fileInfo: FileInfo,
  fileData: FileData,
  question: string,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = currentLanguage === 'zh' ? '在 Agent 中继续追问 →' : 'Continue in Agent →'
  button.style.cssText = themedStyle(
    'margin-top:6px;padding:0;background:none;border:none;color:#0969da;font-family:inherit;font-size:11px;cursor:pointer;text-align:left;')
  button.addEventListener('click', () => {
    // Carry the file along, otherwise the Agent has no idea what "this" is
    const seeded = currentLanguage === 'zh'
      ? `关于 ${fileData.fileName}：${question}`
      : `About ${fileData.fileName}: ${question}`
    openPanel(fileInfo.owner, fileInfo.repo, 'agent', seeded)
  })
  return button
}

function renderQuestionAnswer(
  target: HTMLElement,
  fileInfo: FileInfo,
  fileData: FileData,
  question: string,
) {
  // Matches performDeepAnalysis: without this the placeholder below would be the
  // last thing the user ever sees, because sendMessage throws synchronously once
  // the extension has been reloaded
  if (!isExtensionContextValid()) {
    renderInsightError(target, getText('extensionReloaded'))
    showReloadPrompt()
    return
  }

  // Each exchange is appended rather than replacing the last one, and the
  // question is echoed — otherwise a second question silently wiped the first
  // answer and left prose with nothing to attach it to
  const entry = document.createElement('div')
  entry.style.cssText = themedStyle(
    'margin-top:10px;padding-top:10px;border-top:1px solid #eaeef2;')

  const asked = document.createElement('p')
  asked.style.cssText = themedStyle(
    'margin:0 0 6px 0;font-size:12px;font-weight:600;color:#24292f;')
  asked.textContent = question

  const body = document.createElement('div')
  body.appendChild(
    createText(
      getText('thinking'),
      'padding:8px;background:#f6f8fa;border-radius:6px;font-size:12px;color:#57606a;margin:0;',
    ),
  )

  entry.append(asked, body)
  target.appendChild(entry)

  try {
    chrome.runtime.sendMessage(
      {
        action: 'askQuestion',
        fileName: fileData.fileName,
        fileContent: fileData.promptContent,
        question,
      },
      (qaResult: any) => {
        const runtimeError = chrome.runtime.lastError
        if (runtimeError) {
          renderInsightError(body, runtimeError.message || getText('requestFailed'))
          return
        }
        if (qaResult?.error) {
          renderInsightError(body, qaResult.error)
          return
        }
        if (typeof qaResult?.answer !== 'string' || !qaResult.answer.trim()) {
          renderInsightError(body, getText('requestFailed'))
          return
        }

        const answer = document.createElement('div')
        answer.style.cssText = themedStyle(
          'padding:10px;background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;font-size:12px;line-height:1.6;color:#24292f;word-break:break-word;')
        renderMarkdownInto(answer, qaResult.answer)
        body.replaceChildren(answer, createContinueInAgentButton(fileInfo, fileData, question))
      },
    )
  } catch (error) {
    // The context can be invalidated between the check above and this call
    renderInsightError(
      body,
      error instanceof Error ? error.message : getText('requestFailed'),
    )
  }
}

function renderFileInsight(
  container: HTMLElement,
  fileInfo: FileInfo,
  fileData: FileData,
  llmConfigured: boolean,
) {
  const insight = buildFileLocalInsight(fileData.fileName, fileData.fileContent, currentLanguage)
  container.replaceChildren()

  // Two sibling views rather than one that overwrites the other, so switching to
  // the AI analysis keeps the structure — and any answers already asked for
  const localView = document.createElement('div')
  const aiView = document.createElement('div')
  aiView.style.display = 'none'
  container.append(localView, aiView)

  const showLocal = () => {
    aiView.style.display = 'none'
    localView.style.display = ''
  }
  const showAi = () => {
    localView.style.display = 'none'
    aiView.style.display = ''
  }

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;'

  // Vitals only — the sticky header already carries the full path, and repeating
  // it here meant both were on screen at once
  const vitals = document.createElement('div')
  vitals.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'
  vitals.append(
    createChip(insight.languageLabel, 'blue'),
    createChip(
      currentLanguage === 'zh'
        ? `${insight.totalLines} 行 · ${insight.loc} 有效`
        : `${insight.totalLines} lines · ${insight.loc} LOC`,
    ),
  )
  if (insight.todos > 0) {
    vitals.appendChild(createChip(`${getText('todos')}: ${insight.todos}`, 'amber'))
  }
  // The counts above cover the whole file, so say plainly that the model does not
  if (fileData.promptTruncated) {
    vitals.appendChild(createChip(getText('promptTruncated'), 'amber'))
  }
  wrapper.appendChild(vitals)

  if (insight.symbols.length > 0 || insight.imports.length > 0) {
    const structure = createCard()

    if (insight.symbols.length > 0) {
      structure.appendChild(
        createSectionTitle(`${getText('keySymbols')} · ${insight.symbols.length}`),
      )
      const list = document.createElement('div')
      list.style.cssText = 'display:flex;flex-direction:column;'
      insight.symbols.slice(0, 10).forEach((symbol, index, shown) => {
        const row = document.createElement('button')
        row.type = 'button'
        row.title = jumpLineTitle(symbol.lineStart)
        row.style.cssText = themedStyle(
          `display:flex;width:100%;align-items:center;gap:7px;padding:6px 4px;min-width:0;text-align:left;background:transparent;border:none;${
            index === shown.length - 1 ? '' : 'border-bottom:1px solid #eaeef2;'
          }cursor:pointer;`)
        applyHoverBackground(row, '#f6f8fa')

        const name = document.createElement('span')
        name.style.cssText = themedStyle(
          'flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,SFMono,Consolas,monospace;font-size:12px;color:#0969da;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')
        name.textContent = symbol.name

        const line = document.createElement('span')
        line.style.cssText = themedStyle(
          'flex-shrink:0;font-family:ui-monospace,SFMono-Regular,SFMono,Consolas,monospace;font-size:11px;color:#8c959f;')
        line.textContent = String(symbol.lineStart)

        row.append(createSymbolBadge(symbol.kind), name, line)
        row.addEventListener('click', () =>
          jumpToFileLine(symbol.lineStart, insight.totalLines))
        list.appendChild(row)
      })
      structure.appendChild(list)
    }

    if (insight.imports.length > 0) {
      const depTitle = createSectionTitle(
        `${getText('dependencies')} · ${insight.imports.length}`,
      )
      if (insight.symbols.length > 0) depTitle.style.marginTop = '14px'
      structure.appendChild(depTitle)

      const depTags = document.createElement('div')
      depTags.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'
      insight.imports.slice(0, 12).forEach((item) => {
        // Only repo-local imports are somewhere the reader can actually go next,
        // so external packages stay flat and unclickable
        if (!isLocalDependency(item.source)) {
          depTags.appendChild(createChip(item.source, 'gray'))
          return
        }
        const tag = createChip(item.source, 'blue', true)
        tag.title = jumpLineTitle(item.lineStart)
        tag.addEventListener('click', () =>
          jumpToFileLine(item.lineStart, insight.totalLines))
        depTags.appendChild(tag)
      })
      structure.appendChild(depTags)
    }

    wrapper.appendChild(structure)
  } else {
    wrapper.appendChild(
      createText(getText('noSymbols'), 'font-size:12px;color:#57606a;margin:0;'),
    )
  }

  // The one emphasised block on the panel: it is the only thing here that costs
  // the user a model call
  const aiCard = createCard(true)

  if (llmConfigured) {
    const aiButton = createPrimaryButton(getText('aiAnalysis'))
    aiButton.addEventListener('click', () => {
      // Already analysed this file in this sidebar: just switch back to it
      // rather than asking the model again
      if (aiView.childElementCount > 0) {
        showAi()
        return
      }
      showAi()
      void performDeepAnalysis(aiView, fileInfo, fileData, { onBack: showLocal })
    })
    aiCard.appendChild(aiButton)
    aiCard.appendChild(
      createText(
        currentLanguage === 'zh'
          ? '点击后才会调用模型'
          : 'Nothing is sent to the model until you click.',
        'font-size:11px;color:#8c959f;text-align:center;margin:8px 0 0 0;',
      ),
    )

    const response = document.createElement('div')
    response.style.cssText = 'margin-top:10px;'
    const questionList = document.createElement('div')
    questionList.style.cssText = themedStyle(
      'display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid #eaeef2;')

    insight.quickQuestions.forEach((question) => {
      const button = document.createElement('button')
      button.textContent = question
      button.style.cssText = themedStyle(`
        width:100%;
        text-align:left;
        padding:8px 10px;
        border:1px solid #d8dee4;
        border-radius:6px;
        background:#f6f8fa;
        color:#24292f;
        font-size:12px;
        line-height:1.4;
        cursor:pointer;
      `)
      button.addEventListener('click', () =>
        renderQuestionAnswer(response, fileInfo, fileData, question))
      questionList.appendChild(button)
    })
    aiCard.append(questionList, response)
  } else {
    // One control and one sentence: the old layout said the same thing three
    // times, in a disabled button, a caption, and a second button
    aiCard.appendChild(
      createText(
        getText('configureLLM'),
        'font-size:12px;color:#57606a;line-height:1.5;margin:0 0 10px 0;',
      ),
    )
    const settingsButton = createPrimaryButton(getText('openSettings'))
    settingsButton.addEventListener('click', () =>
      openPanel(fileInfo.owner, fileInfo.repo, 'settings'))
    aiCard.appendChild(settingsButton)
  }

  wrapper.appendChild(aiCard)

  localView.appendChild(wrapper)
}

// The AI view used to replace the file structure outright, with no way back
// short of reloading the page — which also threw the analysis away.
function createBackToStructureButton(onBack: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = currentLanguage === 'zh' ? '← 返回文件结构' : '← Back to structure'
  button.style.cssText = themedStyle(
    'margin-bottom:10px;padding:0;background:none;border:none;color:#0969da;font-family:inherit;font-size:12px;cursor:pointer;text-align:left;')
  button.addEventListener('click', onBack)
  return button
}

function createRefreshAnalysisButton(onRefresh: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = currentLanguage === 'zh' ? '重新分析' : 'Re-analyze'
  button.title = currentLanguage === 'zh'
    ? '忽略缓存，重新调用模型'
    : 'Ignore the cached result and call the model again'
  button.style.cssText = themedStyle(
    'padding:0;background:none;border:none;color:#57606a;font-family:inherit;font-size:11px;cursor:pointer;')
  button.addEventListener('click', onRefresh)
  return button
}

function renderDeepAnalysis(
  container: HTMLElement,
  analysis: DeepFileAnalysisResult,
  fileInfo: FileInfo,
  fileData: FileData,
  onBack: () => void,
  onRefresh: () => void,
) {
  container.replaceChildren()

  const controls = document.createElement('div')
  controls.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;'
  const back = createBackToStructureButton(onBack)
  back.style.marginBottom = '0'
  controls.append(back, createRefreshAnalysisButton(onRefresh))
  container.appendChild(controls)

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;'

  const roleCard = document.createElement('div')
  roleCard.style.cssText = themedStyle(
    'padding:14px;background:#f0f7ff;border-radius:8px;border-left:4px solid #0969da;')
  roleCard.appendChild(createSectionTitle(currentLanguage === 'zh' ? '这个文件做什么' : 'What This File Does'))
  roleCard.appendChild(
    createText(
      analysis.role || analysis.summary,
      'font-size:14px;color:#24292f;line-height:1.55;margin:0;font-weight:600;',
    ),
  )
  if (analysis.summary && analysis.summary !== analysis.role) {
    roleCard.appendChild(
      createText(
        analysis.summary,
        'font-size:12px;color:#57606a;line-height:1.5;margin:8px 0 0 0;',
      ),
    )
  }
  const confidenceRow = document.createElement('div')
  confidenceRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:10px;'
  confidenceRow.appendChild(createChip(
    confidenceText(analysis.confidence),
    analysis.confidence === 'low' ? 'amber' : 'blue',
  ))
  roleCard.appendChild(confidenceRow)
  wrapper.appendChild(roleCard)

  if (analysis.workflow && analysis.workflow.length > 0) {
    const section = createCard()
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '工作流程' : 'How It Works'))
    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;'
    analysis.workflow.slice(0, 6).forEach((step) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;'
      const badge = document.createElement('div')
      badge.style.cssText = themedStyle(
        'width:22px;height:22px;border-radius:50%;background:#0969da;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;')
      badge.textContent = String(step.step)
      const body = document.createElement('div')
      body.style.cssText = 'flex:1;min-width:0;'
      if (step.title) {
        body.appendChild(createText(step.title, 'font-size:12px;font-weight:600;color:#24292f;margin:0 0 2px 0;'))
      }
      body.appendChild(createText(step.description, 'font-size:12px;color:#57606a;line-height:1.5;margin:0;'))
      const meta = [step.functionName, step.lineNumber ? `L${step.lineNumber}` : ''].filter(Boolean).join(' · ')
      if (meta) {
        body.appendChild(createText(meta, 'font-size:10px;color:#8c959f;margin:3px 0 0 0;font-family:monospace;'))
      }
      row.append(badge, body)
      list.appendChild(row)
    })
    section.appendChild(list)
    wrapper.appendChild(section)
  }

  if (analysis.components.length > 0) {
    const section = createCard()
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '关键实现' : 'Key Implementation'))
    analysis.components.slice(0, 8).forEach((component) => {
      const row = document.createElement('div')
      row.style.cssText = themedStyle('padding:8px;background:#f6f8fa;border-radius:6px;margin-bottom:6px;')
      const heading = document.createElement('div')
      heading.style.cssText = 'display:flex;align-items:center;gap:6px;'
      const name = document.createElement('span')
      name.style.cssText = themedStyle('font-family:monospace;font-size:12px;font-weight:600;color:#0969da;')
      name.textContent = component.name
      heading.append(name, createChip(component.type, 'gray'))
      row.appendChild(heading)
      if (component.description) {
        row.appendChild(
          createText(component.description, 'font-size:11px;color:#57606a;line-height:1.45;margin:4px 0 0 0;'),
        )
      }
      section.appendChild(row)
    })
    wrapper.appendChild(section)
  }

  if (analysis.designNotes && analysis.designNotes.length > 0) {
    const section = createCard()
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '为什么这样设计' : 'Why This Design'))
    const list = document.createElement('ul')
    list.style.cssText = themedStyle('margin:0;padding-left:16px;font-size:12px;color:#57606a;line-height:1.6;')
    analysis.designNotes.slice(0, 4).forEach((note) => {
      const li = document.createElement('li')
      li.textContent = note
      list.appendChild(li)
    })
    section.appendChild(list)
    wrapper.appendChild(section)
  }

  if (analysis.dependencies.length > 0) {
    const section = createCard()
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '相关依赖' : 'Related Dependencies'))
    const tags = document.createElement('div')
    tags.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'
    analysis.dependencies.slice(0, 10).forEach((dep) => {
      tags.appendChild(createChip(dep, 'blue'))
    })
    section.appendChild(tags)
    wrapper.appendChild(section)
  }

  if (analysis.evidence.length > 0) {
    const section = createCard()
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '支撑证据' : 'Evidence'))
    analysis.evidence.slice(0, 2).forEach((item) => {
      const box = document.createElement('div')
      box.style.cssText = themedStyle('padding:8px;background:#f6f8fa;border-radius:6px;margin-bottom:6px;')
      const fileLine = `${item.filePath || fileData.fileName}${item.lineStart ? `:${item.lineStart}` : ''}`
      box.appendChild(createText(fileLine, 'font-size:11px;color:#374151;font-family:monospace;margin:0 0 4px 0;'))
      box.appendChild(createText(item.reason, 'font-size:11px;color:#4b5563;margin:0 0 4px 0;'))
      const snippet = document.createElement('pre')
      snippet.style.cssText = themedStyle(
        'font-size:11px;color:#334155;background:#fff;padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-word;margin:0;')
      snippet.textContent = item.snippet
      box.appendChild(snippet)
      section.appendChild(box)
    })
    wrapper.appendChild(section)
  }

  if (analysis.suggestions.length > 0) {
    const section = createCard()
    section.appendChild(createSectionTitle(currentLanguage === 'zh' ? '继续看' : 'Next Reading'))
    const list = document.createElement('ul')
    list.style.cssText = themedStyle('margin:0;padding-left:16px;font-size:12px;color:#666;line-height:1.6;')
    analysis.suggestions.slice(0, 5).forEach((suggestion) => {
      const li = document.createElement('li')
      li.textContent = suggestion
      list.appendChild(li)
    })
    section.appendChild(list)
    wrapper.appendChild(section)
  }

  const qaSection = document.createElement('div')
  qaSection.style.cssText = themedStyle('margin-top:8px;padding-top:12px;border-top:1px solid #e1e4e8;')
  qaSection.appendChild(createSectionTitle(currentLanguage === 'zh' ? '提问' : 'Ask a Question'))

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;'
  const input = document.createElement('input')
  input.id = 'gitmentor-question-input'
  input.placeholder = currentLanguage === 'zh' ? '关于此文件提问...' : 'Ask about this file...'
  input.style.cssText = themedStyle(
    'flex:1;padding:8px 12px;border:1px solid #e1e4e8;border-radius:6px;font-size:12px;outline:none;background:#fff;color:#24292e;')
  // Inline styles cannot express :focus, so emulate the focus ring by hand
  input.addEventListener('focus', () => {
    const accent = isGithubDarkMode() ? '#79c0ff' : '#0969da'
    input.style.borderColor = accent
    input.style.boxShadow = `0 0 0 1px ${accent}`
  })
  input.addEventListener('blur', () => {
    input.style.borderColor = isGithubDarkMode() ? '#30363d' : '#e1e4e8'
    input.style.boxShadow = 'none'
  })
  const askBtn = document.createElement('button')
  askBtn.id = 'gitmentor-ask-btn'
  askBtn.textContent = currentLanguage === 'zh' ? '提问' : 'Ask'
  askBtn.style.cssText = themedStyle(
    'padding:8px 16px;background:#24292e;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;')
  row.append(input, askBtn)
  qaSection.appendChild(row)

  const qaResponse = document.createElement('div')
  qaResponse.id = 'gitmentor-qa-response'
  qaResponse.style.cssText = 'margin-top:12px;'
  qaSection.appendChild(qaResponse)
  wrapper.appendChild(qaSection)

  const handleAsk = () => {
    const question = input.value.trim()
    if (!question) return
    renderQuestionAnswer(qaResponse, fileInfo, fileData, question)
  }

  askBtn.addEventListener('click', handleAsk)
  input.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') handleAsk()
  })

  container.appendChild(wrapper)
}

async function performDeepAnalysis(
  contentDiv: HTMLElement,
  fileInfo: FileInfo,
  fileData: FileData,
  options: { onBack: () => void; refresh?: boolean },
) {
  console.log('[GitMentor] Requesting deep analysis...')

  // Load current language
  currentLanguage = await getLanguage()

  // Check extension context
  if (!isExtensionContextValid()) {
    renderInsightError(contentDiv, getText('extensionReloaded'))
    showReloadPrompt()
    return
  }

  const failed = (message: string) => {
    contentDiv.replaceChildren()
    contentDiv.appendChild(createBackToStructureButton(options.onBack))
    const error = document.createElement('div')
    contentDiv.appendChild(error)
    renderInsightError(error, `${getText('deepAnalysisFailed')}: ${message}`)
  }

  contentDiv.replaceChildren()
  contentDiv.appendChild(createBackToStructureButton(options.onBack))
  const loading = document.createElement('div')
  loading.style.cssText = themedStyle(
    'padding:12px;background:#f0f2f5;border-radius:4px;text-align:center;font-size:12px;color:#666;')
  loading.appendChild(createText(getText('deepAnalysisInProgress'), 'margin:0;'))
  loading.appendChild(createText(getText('mayTakeMoment'), 'margin:8px 0 0 0;font-size:11px;'))
  contentDiv.appendChild(loading)

  try {
    chrome.runtime.sendMessage({
      action: 'analyzeFileDeep',
      fileName: fileData.fileName,
      fileContent: fileData.promptContent,
      owner: fileInfo.owner,
      repo: fileInfo.repo,
      branch: fileInfo.branch,
      language: currentLanguage,
      refresh: Boolean(options.refresh),
    }, (response: any) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        failed(runtimeError.message || getText('requestFailed'))
        return
      }
      if (response?.data) {
        renderDeepAnalysis(
          contentDiv,
          response.data as DeepFileAnalysisResult,
          fileInfo,
          fileData,
          options.onBack,
          () => void performDeepAnalysis(contentDiv, fileInfo, fileData, {
            onBack: options.onBack,
            refresh: true,
          }),
        )
        return
      }
      failed(response?.error || getText('requestFailed'))
    })
  } catch (error) {
    failed(error instanceof Error ? error.message : getText('requestFailed'))
  }
}

async function fetchGithubFileContent(fileInfo: FileInfo): Promise<string> {
  if (!isExtensionContextValid()) {
    throw new Error('Extension context unavailable')
  }

  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'fetchGithubFileContent',
      owner: fileInfo.owner,
      repo: fileInfo.repo,
      branch: fileInfo.branch,
      path: fileInfo.path,
    }, (response: any) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      if (response?.error) {
        reject(new Error(response.error))
        return
      }
      if (typeof response?.content !== 'string') {
        reject(new Error('Failed to fetch file content'))
        return
      }
      resolve(response.content)
    })
  })
}

async function fetchAndAnalyzeFile(fileInfo: FileInfo, contentDiv: HTMLElement) {
  try {
    // Load current language
    currentLanguage = await getLanguage()
    const fileContent = await fetchGithubFileContent(fileInfo)

    // Only what the model sees is capped. The full text stays on fileData so the
    // local metrics describe the actual file rather than the first 20KB of it.
    const promptTruncated = fileContent.length > PROMPT_CONTENT_MAX_CHARS
    const fileData: FileData = {
      fileName: fileInfo.path,
      fileContent,
      promptContent: promptTruncated
        ? `${fileContent.substring(0, PROMPT_CONTENT_MAX_CHARS)}\n... (file truncated)`
        : fileContent,
      promptTruncated,
    }

    // Check extension context before sending message
    if (!isExtensionContextValid()) {
      renderInsightError(contentDiv, getText('extensionReloaded'))
      showReloadPrompt()
      return
    }

    const llmConfigured = await isLLMConfigured()
    renderFileInsight(contentDiv, fileInfo, fileData, llmConfigured)
  } catch (error) {
    // An orphaned content script surfaces here first, as a fetch failure. It is
    // the most common failure in this path and the one with a real remedy, so
    // say that rather than passing the raw message through.
    if (!isExtensionContextValid()) {
      renderInsightError(contentDiv, getText('extensionReloaded'))
      showReloadPrompt()
      return
    }
    renderInsightError(
      contentDiv,
      `${getText('fetchFileFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

function injectWidget() {
  // Only run on GitHub repo pages
  const pathMatch = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)(\/.*)?$/)
  console.log('[GitMentor] Checking pathname:', window.location.pathname)
  console.log('[GitMentor] pathMatch result:', pathMatch)
  if (!pathMatch) {
    console.log('[GitMentor] Not a GitHub repo page, skipping injection')
    return
  }

  const [, owner, repo] = pathMatch
  console.log(`[GitMentor] Injecting widget for ${owner}/${repo}`)

  // Check if widget already exists
  if (document.getElementById('gitmentor-widget')) {
    console.log('[GitMentor] Widget already exists, skipping')
    return
  }

  // Create floating widget button
  const widget = document.createElement('div')
  widget.id = 'gitmentor-widget'
  widget.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    z-index: 10000;
    cursor: pointer;
  `

  const button = document.createElement('button')
  button.style.cssText = `
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: none;
    background: white;
    padding: 0;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  `
  
  const img = document.createElement('img')
  img.src = chrome.runtime.getURL('gitmentor.png')
  img.alt = 'GitMentor'
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  `
  button.appendChild(img)
  button.title = 'GitMentor - Learn this project'

  button.onmouseover = () => {
    button.style.transform = 'scale(1.1)'
    button.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)'
  }

  button.onmouseout = () => {
    button.style.transform = 'scale(1)'
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)'
  }

  button.onclick = (e) => {
    console.log('[GitMentor] Button clicked!')
    e.stopPropagation()
    openPanel(owner, repo)
  }

  widget.appendChild(button)
  document.body.appendChild(widget)

  // The widget can be (re)created while the sidebar is already open, so settle
  // it clear of the sidebar right away instead of waiting for the next layout pass
  applySidebarLayout()

  // Make widget draggable
  makeDraggable(widget)
}

function makeDraggable(element: HTMLElement) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0

  element.onmousedown = dragMouseDown

  function dragMouseDown(e: MouseEvent) {
    e.preventDefault()
    pos3 = e.clientX
    pos4 = e.clientY
    document.onmouseup = closeDragElement

    function closeDragElement() {
      document.onmouseup = null
      document.onmousemove = null
    }

    document.onmousemove = elementDrag

    function elementDrag(e: MouseEvent) {
      e.preventDefault()
      pos1 = pos3 - e.clientX
      pos2 = pos4 - e.clientY
      pos3 = e.clientX
      pos4 = e.clientY
      element.style.top = element.offsetTop - pos2 + 'px'
      element.style.left = element.offsetLeft - pos1 + 'px'
    }
  }
}

// Check if extension context is still valid
function isExtensionContextValid(): boolean {
  try {
    // Try to access chrome.runtime.id - this will throw or be undefined if context is invalid
    return !!(chrome?.runtime?.id)
  } catch {
    return false
  }
}

// Show a reload prompt when extension context is invalid
function showReloadPrompt() {
  // Remove existing prompt
  const existing = document.getElementById('gitmentor-reload-prompt')
  if (existing) {
    existing.remove()
  }

  const prompt = document.createElement('div')
  prompt.id = 'gitmentor-reload-prompt'
  prompt.style.cssText = themedStyle(`
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: #24292e;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    font-size: 13px;
    z-index: 10001;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    max-width: 300px;
  `)
  prompt.innerHTML = themedStyle(`
    <div style="margin-bottom: 12px; font-weight: 600;">Extension Updated</div>
    <div style="margin-bottom: 12px; color: #ccc; font-size: 12px;">
      GitMentor was updated or reloaded. Please refresh this page to continue.
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="gitmentor-reload-btn" style="
        background: white;
        color: #24292e;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      ">Refresh Page</button>
      <button id="gitmentor-dismiss-btn" style="
        background: transparent;
        color: #999;
        border: 1px solid #555;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      ">Dismiss</button>
    </div>
  `)

  document.body.appendChild(prompt)

  const reloadBtn = prompt.querySelector('#gitmentor-reload-btn')
  reloadBtn?.addEventListener('click', () => {
    window.location.reload()
  })

  const dismissBtn = prompt.querySelector('#gitmentor-dismiss-btn')
  dismissBtn?.addEventListener('click', () => {
    prompt.remove()
  })
}

function openPanel(
  owner: string,
  repo: string,
  initialTab?: 'settings' | 'agent',
  initialQuestion?: string,
) {
  console.log(`[GitMentor] openPanel called with ${owner}/${repo}`)
  
  try {
    // Check if panel already exists
    const existing = document.getElementById('gitmentor-panel')
    if (existing) {
      existing.remove()
      if (!initialTab) return
    }

    const widget = document.getElementById('gitmentor-widget') as HTMLElement | null
    const showWidget = () => {
      if (widget) {
        widget.style.display = ''
      }
    }
    
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      console.error('[GitMentor] Extension context invalidated - extension was likely updated/reloaded')
      showReloadPrompt()
      return
    }
    
    const extensionId = chrome.runtime.id
    // The question is prefilled, never auto-sent: spending a model call is the
    // reader's decision
    const questionParam = initialQuestion
      ? `&q=${encodeURIComponent(initialQuestion.slice(0, 500))}`
      : ''
    const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${initialTab ? `&tab=${encodeURIComponent(initialTab)}` : ''}${questionParam}`
    console.log('[GitMentor] Panel URL:', popupUrl)
    
    // Create floating panel
    const panel = document.createElement('div')
    panel.id = 'gitmentor-panel'
    panel.style.cssText = themedStyle(`
      position: fixed;
      right: 20px;
      top: 20px;
      width: 500px;
      height: 700px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 40px);
      z-index: 9999;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      overflow: hidden;
    `)

    // Header
    const header = document.createElement('div')
    header.style.cssText = themedStyle(`
      padding: 16px;
      border-bottom: 1px solid #e1e4e8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f6f8fa;
      cursor: move;
      flex-shrink: 0;
    `)
    header.innerHTML = themedStyle(`
      <div style="display: flex; align-items: center; gap: 8px;">
        <img src="${chrome.runtime.getURL('gitmentor.png')}" alt="" style="width: 24px; height: 24px; border-radius: 6px;">
        <div>
          <span style="font-weight: 600; font-size: 14px; color: #24292e;">GitMentor</span>
          <div style="font-size: 11px; color: #666; margin-top: 2px;">${owner}/${repo}</div>
        </div>
      </div>
      <button id="gitmentor-close" style="
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 24px;
        height: 24px;
      ">×</button>
    `)
    
    // Iframe
    const iframe = document.createElement('iframe')
    iframe.style.cssText = `
      flex: 1;
      border: none;
      background: white;
      width: 100%;
    `
    iframe.src = popupUrl
    
    panel.appendChild(header)
    panel.appendChild(iframe)
    document.body.appendChild(panel)
    if (widget) {
      widget.style.display = 'none'
    }
    // The panel and the file sidebar both live on the right edge, so the
    // sidebar steps aside for as long as the panel is open
    setFileSidebarSuppressed(true)
    const panelObserver = new MutationObserver(() => {
      if (!document.body.contains(panel)) {
        showWidget()
        // Reopening with a different tab removes and recreates the panel, so
        // only hand the edge back once no panel is left
        if (!document.getElementById('gitmentor-panel')) {
          setFileSidebarSuppressed(false)
        }
        document.removeEventListener('keydown', escapeHandler)
        panelObserver.disconnect()
      }
    })
    panelObserver.observe(document.body, { childList: true })
    
    // Close button
    const closeBtn = header.querySelector('#gitmentor-close') as HTMLElement
    closeBtn?.addEventListener('click', () => {
      panel.remove()
    })
    
    // Escape to close
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        panel.remove()
      }
    }
    document.addEventListener('keydown', escapeHandler)
    
    // Draggable
    makeDraggablePanel(header, panel)
  } catch (error) {
    console.error('[GitMentor] Error creating panel:', error)
    showNotification(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function makeDraggablePanel(header: HTMLElement, panel: HTMLElement) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0
  header.onmousedown = dragMouseDown

  function dragMouseDown(e: MouseEvent) {
    e.preventDefault()
    pos3 = e.clientX
    pos4 = e.clientY
    document.onmouseup = closeDragElement

    function closeDragElement() {
      document.onmouseup = null
      document.onmousemove = null
    }

    document.onmousemove = elementDrag

    function elementDrag(e: MouseEvent) {
      e.preventDefault()
      pos1 = pos3 - e.clientX
      pos2 = pos4 - e.clientY
      pos3 = e.clientX
      pos4 = e.clientY

      const newTop = Math.max(0, panel.offsetTop - pos2)
      const newLeft = Math.max(0, panel.offsetLeft - pos1)
      
      if (newTop + panel.offsetHeight <= window.innerHeight) {
        panel.style.top = newTop + 'px'
      }
      if (newLeft + panel.offsetWidth <= window.innerWidth) {
        panel.style.left = newLeft + 'px'
      }
    }
  }
}

function showNotification(message: string) {
  // Remove existing notification
  const existing = document.getElementById('gitmentor-notification')
  if (existing) {
    existing.remove()
  }

  const notification = document.createElement('div')
  notification.id = 'gitmentor-notification'
  notification.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 20px;
    background: #24292e;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  `
  notification.textContent = message

  // Add animation
  const style = document.createElement('style')
  if (!document.getElementById('gitmentor-styles')) {
    style.id = 'gitmentor-styles'
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(20px);
          opacity: 0;
        }
      }
    `
    document.head.appendChild(style)
  }

  document.body.appendChild(notification)

  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out'
    setTimeout(() => {
      notification.remove()
    }, 300)
  }, 3000)
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    detectAndSaveLanguage()
    injectWidget()
    injectFileSidebar()
  })
} else {
  detectAndSaveLanguage()
  injectWidget()
  injectFileSidebar()
}

let injectTimer: ReturnType<typeof setTimeout> | null = null
function scheduleInjection(delay = 120) {
  if (injectTimer) {
    clearTimeout(injectTimer)
  }
  injectTimer = setTimeout(() => {
    injectTimer = null
    if (!document.getElementById('gitmentor-widget')) {
      injectWidget()
    }
    injectFileSidebar()
  }, delay)
}

// Reinject if page changes (for SPAs)
const observer = new MutationObserver(() => {
  scheduleInjection(180)
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})

// Also listen for URL changes via popstate (back/forward buttons)
window.addEventListener('popstate', () => {
  console.log('[GitMentor] URL changed via popstate')
  scheduleInjection(80)
})

// The sidebar width is capped against the viewport and only reserves page space
// on wide screens, so both have to be re-evaluated when the window changes
let resizeTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    applySidebarLayout()
  }, 100)
})

// Note: GitHub's pushState/replaceState calls happen in the page's main world and
// cannot be observed from this isolated world; SPA navigation is covered by the
// MutationObserver above.
