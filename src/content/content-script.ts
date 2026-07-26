// Content script for injecting GitMentor floating widget on GitHub pages
import type { DeepFileAnalysisResult } from '@/types/learning'

const STORAGE_KEYS = {
  language: 'gitmentor_language',
  legacyLanguage: 'language',
  llmConfig: 'gitmentor_llm_config',
} as const

// Track current file path to detect changes
let currentFilePath: string | null = null
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
    fileUnderstanding: '当前文件理解',
    fileOverview: '文件概览',
    metrics: '基础信息',
    keySymbols: '关键函数/类型',
    dependencies: '依赖',
    noSymbols: '未检测到明显的函数、类或类型定义',
    noDependencies: '未检测到显式依赖',
    quickQuestions: '快捷追问',
    aiAnalysis: 'AI 分析此文件',
    configureLLM: '配置 LLM 后可生成文件解释',
    openSettings: '打开 GitMentor 设置',
    analyzingFile: '正在分析文件...',
    deepAnalysisInProgress: '正在进行 AI 深度分析...',
    mayTakeMoment: '这可能需要一点时间',
    deepAnalysisFailed: '深度分析失败',
    requestFailed: '请求失败，请刷新页面后重试',
    thinking: '思考中...',
    loc: '有效行',
    lines: '行数',
    imports: '依赖数',
    todos: '待办',
  },
  en: {
    readingFile: 'Reading current file...',
    fileUnderstanding: 'Current File Understanding',
    fileOverview: 'File Overview',
    metrics: 'Metrics',
    keySymbols: 'Key Functions / Types',
    dependencies: 'Dependencies',
    noSymbols: 'No obvious functions, classes, or types detected',
    noDependencies: 'No explicit dependencies detected',
    quickQuestions: 'Quick Questions',
    aiAnalysis: 'Analyze This File',
    configureLLM: 'Configure an LLM to generate file explanations',
    openSettings: 'Open GitMentor Settings',
    analyzingFile: 'Analyzing file...',
    deepAnalysisInProgress: 'Performing deep analysis with AI...',
    mayTakeMoment: 'This may take a moment',
    deepAnalysisFailed: 'Deep analysis failed',
    requestFailed: 'Request failed. Please refresh the page and try again.',
    thinking: 'Thinking...',
    loc: 'LOC',
    lines: 'Lines',
    imports: 'Imports',
    todos: 'TODOs',
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

function parseFileUrl(): FileInfo | null {
  // Match: /owner/repo/blob/branch/path/to/file.ext
  const match = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/)
  if (!match) return null
  
  const [, owner, repo, branch, path] = match
  return { owner, repo, branch, path }
}

function getDismissedFileSidebarKey(fileInfo: FileInfo): string {
  return `gitmentor:dismissed-file-sidebar:${fileInfo.owner}/${fileInfo.repo}/${fileInfo.branch}/${fileInfo.path}`
}

function removeFileSidebarUi() {
  document.getElementById('gitmentor-file-sidebar')?.remove()
  document.getElementById('gitmentor-file-sidebar-collapsed')?.remove()
  currentFilePath = null
}

function showFileSidebarCollapsedHandle(fileInfo: FileInfo, dismissedFileSidebarKey: string) {
  const existing = document.getElementById('gitmentor-file-sidebar-collapsed') as HTMLElement | null
  if (existing?.dataset.dismissedKey === dismissedFileSidebarKey) return
  existing?.remove()

  const handle = document.createElement('button')
  handle.id = 'gitmentor-file-sidebar-collapsed'
  handle.dataset.dismissedKey = dismissedFileSidebarKey
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
    sessionStorage.removeItem(dismissedFileSidebarKey)
    handle.remove()
    currentFilePath = null
    void injectFileSidebar()
  })
  document.body.appendChild(handle)
  currentFilePath = fileInfo.path
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

  const dismissedFileSidebarKey = getDismissedFileSidebarKey(fileInfo)
  if (sessionStorage.getItem(dismissedFileSidebarKey) === '1') {
    document.getElementById('gitmentor-file-sidebar')?.remove()
    showFileSidebarCollapsedHandle(fileInfo, dismissedFileSidebarKey)
    return
  }
  document.getElementById('gitmentor-file-sidebar-collapsed')?.remove()
  
  console.log('[GitMentor] Detected code file:', fileInfo.path)
  
  // Check if sidebar already exists for the same file
  if (document.getElementById('gitmentor-file-sidebar') && currentFilePath === fileInfo.path) {
    console.log('[GitMentor] File sidebar already exists for:', fileInfo.path)
    return
  }
  
  // If sidebar exists but file changed, remove it
  if (document.getElementById('gitmentor-file-sidebar') && currentFilePath !== fileInfo.path) {
    console.log('[GitMentor] File changed from', currentFilePath, 'to', fileInfo.path, ', updating sidebar')
    document.getElementById('gitmentor-file-sidebar')?.remove()
  }
  
  // Update current file path
  currentFilePath = fileInfo.path
  
  // Create sidebar container
  const sidebar = document.createElement('div')
  sidebar.id = 'gitmentor-file-sidebar'
  sidebar.style.cssText = themedStyle(`
    position: fixed;
    right: 0;
    top: 0;
    width: 380px;
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
    <div style="font-size: 12px; color: #666; margin-top: 8px; word-break: break-all;">
      ${fileInfo.path}
    </div>
  `)

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
  
  // Close button
  const closeBtn = header.querySelector('#gitmentor-sidebar-close')
  closeBtn?.addEventListener('click', () => {
    sessionStorage.setItem(dismissedFileSidebarKey, '1')
    sidebar.remove()
    showFileSidebarCollapsedHandle(fileInfo, dismissedFileSidebarKey)
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

interface FileData {
  fileName: string
  fileContent: string
}

type FileInsightSymbolKind =
  | 'function'
  | 'class'
  | 'component'
  | 'hook'
  | 'type'
  | 'interface'
  | 'constant'

interface FileInsightImport {
  source: string
  lineStart: number
}

interface FileInsightSymbol {
  name: string
  kind: FileInsightSymbolKind
  lineStart: number
}

const FILE_LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  rb: 'Ruby',
  php: 'PHP',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  json: 'JSON',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  sh: 'Shell',
}

function fileBasename(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

function fileExtension(filePath: string): string {
  const match = fileBasename(filePath).match(/\.([^.]+)$/)
  return match?.[1]?.toLowerCase() || ''
}

function fileLanguageLabel(filePath: string): string {
  const ext = fileExtension(filePath)
  return FILE_LANGUAGE_LABELS[ext] || (ext ? ext.toUpperCase() : 'File')
}

function countSourceLoc(lines: string[]): number {
  return lines.filter((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0 &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('*')
  }).length
}

function pushUniqueLocalImport(
  imports: FileInsightImport[],
  source: string,
  lineStart: number,
) {
  const normalized = source.trim()
  if (!normalized || imports.some((item) => item.source === normalized)) return
  imports.push({ source: normalized, lineStart })
}

function extractLocalImports(lines: string[]): FileInsightImport[] {
  const imports: FileInsightImport[] = []

  lines.forEach((line, index) => {
    const lineStart = index + 1
    const trimmed = line.trim()
    const pythonFrom = trimmed.match(/^from\s+([A-Za-z0-9_.]+)\s+import\s+/)
    if (pythonFrom) {
      pushUniqueLocalImport(imports, pythonFrom[1], lineStart)
      return
    }

    const jsFrom = trimmed.match(/^import\s+.+?\s+from\s+["']([^"']+)["']/)
    if (jsFrom) {
      pushUniqueLocalImport(imports, jsFrom[1], lineStart)
      return
    }

    const jsSideEffect = trimmed.match(/^import\s*["']([^"']+)["']/)
    if (jsSideEffect) {
      pushUniqueLocalImport(imports, jsSideEffect[1], lineStart)
      return
    }

    const pythonImport = trimmed.match(/^import\s+(.+)/)
    if (pythonImport && !trimmed.startsWith('import(')) {
      pythonImport[1]
        .split(',')
        .map((item) => item.trim().split(/\s+as\s+/)[0])
        .forEach((source) => pushUniqueLocalImport(imports, source, lineStart))
      return
    }

    const requireMatch = trimmed.match(/require\(["']([^"']+)["']\)/)
    if (requireMatch) {
      pushUniqueLocalImport(imports, requireMatch[1], lineStart)
    }
  })

  return imports.slice(0, 12)
}

function symbolKindForLocalName(name: string, fallback: FileInsightSymbolKind): FileInsightSymbolKind {
  if (/^use[A-Z0-9]/.test(name)) return 'hook'
  if (/^[A-Z]/.test(name) && (fallback === 'function' || fallback === 'constant')) {
    return 'component'
  }
  return fallback
}

function extractLocalSymbols(lines: string[]): FileInsightSymbol[] {
  const symbols: FileInsightSymbol[] = []

  lines.forEach((line, index) => {
    const lineStart = index + 1
    const trimmed = line.trim()

    const pythonFunction = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
    if (pythonFunction) {
      symbols.push({ name: pythonFunction[1], kind: 'function', lineStart })
      return
    }

    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/)
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', lineStart })
      return
    }

    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)/)
    if (interfaceMatch) {
      symbols.push({ name: interfaceMatch[1], kind: 'interface', lineStart })
      return
    }

    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)/)
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: 'type', lineStart })
      return
    }

    const functionMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
    if (functionMatch) {
      symbols.push({
        name: functionMatch[1],
        kind: symbolKindForLocalName(functionMatch[1], 'function'),
        lineStart,
      })
      return
    }

    const constFunction = trimmed.match(/^(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*=>/)
    if (constFunction) {
      symbols.push({
        name: constFunction[1],
        kind: symbolKindForLocalName(constFunction[1], 'constant'),
        lineStart,
      })
    }
  })

  return symbols.slice(0, 16)
}

function localModuleName(filePath: string): string {
  const segments = filePath.split('/').filter(Boolean)
  if (segments.length <= 1) return 'root'
  const parent = segments[segments.length - 2]
  return parent === 'src' && segments.length > 2 ? segments[segments.length - 3] : parent
}

function buildLocalQuickQuestions(
  filePath: string,
  imports: FileInsightImport[],
  lang: 'zh' | 'en',
): string[] {
  const moduleLabel = localModuleName(filePath)
  if (lang === 'zh') {
    return [
      '解释这个文件的实现原理',
      `这个文件在 ${moduleLabel} 模块中负责什么？`,
      imports.length > 0 ? '接下来应该看哪些依赖文件？' : '接下来应该看哪个相关文件？',
    ]
  }

  return [
    "Explain this file's implementation",
    `What role does this file play in the ${moduleLabel} module?`,
    imports.length > 0 ? 'Which related files should I read next?' : 'Which nearby file should I read next?',
  ]
}

function buildFileLocalInsight(filePath: string, fileContent: string, lang: 'zh' | 'en') {
  const lines = fileContent.split('\n')
  const imports = extractLocalImports(lines)
  return {
    filePath,
    fileName: fileBasename(filePath),
    extension: fileExtension(filePath),
    languageLabel: fileLanguageLabel(filePath),
    totalLines: lines.length,
    loc: countSourceLoc(lines),
    imports,
    symbols: extractLocalSymbols(lines),
    todos: lines.filter((line) => /TODO|FIXME|HACK|XXX/i.test(line)).length,
    quickQuestions: buildLocalQuickQuestions(filePath, imports, lang),
  }
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

function createCard(): HTMLDivElement {
  const card = document.createElement('div')
  card.style.cssText = themedStyle(
    'padding:12px;background:#fff;border:1px solid #d8dee4;border-radius:8px;')
  return card
}

function createMetric(label: string, value: string | number): HTMLDivElement {
  const box = document.createElement('div')
  box.style.cssText = themedStyle(
    'min-width:86px;flex:1;padding:8px;background:#f6f8fa;border-radius:6px;border:1px solid #eaeef2;')
  const valueEl = document.createElement('div')
  valueEl.style.cssText = themedStyle('font-size:15px;font-weight:600;color:#24292f;line-height:1.2;')
  valueEl.textContent = String(value)
  const labelEl = document.createElement('div')
  labelEl.style.cssText = themedStyle('font-size:10px;color:#57606a;margin-top:2px;')
  labelEl.textContent = label
  box.append(valueEl, labelEl)
  return box
}

function createChip(text: string, tone: 'blue' | 'gray' | 'amber' = 'gray'): HTMLSpanElement {
  const chip = document.createElement('span')
  const colors = {
    blue: 'background:#ddf4ff;color:#0969da;border-color:#b6e3ff;',
    gray: 'background:#f6f8fa;color:#57606a;border-color:#d8dee4;',
    amber: 'background:#fff8c5;color:#9a6700;border-color:#f0d98c;',
  }
  chip.style.cssText = themedStyle(
    `display:inline-flex;align-items:center;max-width:100%;padding:3px 8px;border:1px solid;border-radius:999px;font-size:11px;line-height:1.4;word-break:break-word;${colors[tone]}`)
  chip.textContent = text
  return chip
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

function renderQuestionAnswer(
  target: HTMLElement,
  fileData: FileData,
  question: string,
) {
  target.replaceChildren(
    createText(
      getText('thinking'),
      'padding:8px;background:#f6f8fa;border-radius:6px;font-size:12px;color:#57606a;margin:0;',
    ),
  )

  chrome.runtime.sendMessage(
    {
      action: 'askQuestion',
      fileName: fileData.fileName,
      fileContent: fileData.fileContent,
      question,
    },
    (qaResult: any) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        renderInsightError(target, runtimeError.message || getText('requestFailed'))
        return
      }
      if (qaResult?.error) {
        renderInsightError(target, qaResult.error)
        return
      }
      if (typeof qaResult?.answer !== 'string' || !qaResult.answer.trim()) {
        renderInsightError(target, getText('requestFailed'))
        return
      }

      const answer = document.createElement('div')
      answer.style.cssText = themedStyle(
        'padding:10px;background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;font-size:12px;line-height:1.6;color:#24292f;white-space:pre-wrap;word-break:break-word;')
      answer.textContent = qaResult.answer
      target.replaceChildren(answer)
    },
  )
}

function renderFileInsight(
  container: HTMLElement,
  fileInfo: FileInfo,
  fileData: FileData,
  llmConfigured: boolean,
) {
  const insight = buildFileLocalInsight(fileData.fileName, fileData.fileContent, currentLanguage)
  container.replaceChildren()

  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'display:flex;flex-direction:column;gap:12px;'

  const overview = createCard()
  overview.appendChild(createSectionTitle(getText('fileUnderstanding')))
  overview.appendChild(
    createText(
      currentLanguage === 'zh'
        ? `先基于当前文件内容做本地解析。AI 分析会在你点击按钮后再调用模型。`
        : 'Local file context is available now. AI analysis only runs after you click the button.',
      'font-size:12px;color:#57606a;line-height:1.55;margin:0 0 10px 0;',
    ),
  )
  const path = document.createElement('div')
  path.style.cssText = themedStyle(
    'font-family:ui-monospace,SFMono-Regular,SFMono,Consolas,monospace;font-size:12px;color:#24292f;background:#f6f8fa;border-radius:6px;padding:8px;word-break:break-all;')
  path.textContent = insight.filePath
  overview.appendChild(path)
  const overviewChips = document.createElement('div')
  overviewChips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;'
  overviewChips.append(
    createChip(insight.languageLabel, 'blue'),
    createChip(`${getText('lines')}: ${insight.totalLines}`),
    createChip(`${getText('loc')}: ${insight.loc}`),
  )
  if (insight.todos > 0) {
    overviewChips.appendChild(createChip(`${getText('todos')}: ${insight.todos}`, 'amber'))
  }
  overview.appendChild(overviewChips)
  wrapper.appendChild(overview)

  const metrics = createCard()
  metrics.appendChild(createSectionTitle(getText('metrics')))
  const metricRow = document.createElement('div')
  metricRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;'
  metricRow.append(
    createMetric(getText('lines'), insight.totalLines),
    createMetric(getText('loc'), insight.loc),
    createMetric(getText('imports'), insight.imports.length),
  )
  metrics.appendChild(metricRow)
  wrapper.appendChild(metrics)

  const symbols = createCard()
  symbols.appendChild(createSectionTitle(getText('keySymbols')))
  if (insight.symbols.length === 0) {
    symbols.appendChild(createText(getText('noSymbols'), 'font-size:12px;color:#57606a;margin:0;'))
  } else {
    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;'
    insight.symbols.slice(0, 10).forEach((symbol) => {
      const row = document.createElement('div')
      row.style.cssText = themedStyle(
        'display:flex;align-items:center;gap:6px;padding:7px 8px;background:#f6f8fa;border-radius:6px;min-width:0;')
      const name = document.createElement('span')
      name.style.cssText = themedStyle(
        'flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,SFMono,Consolas,monospace;font-size:12px;color:#0969da;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')
      name.textContent = symbol.name
      row.append(name, createChip(symbol.kind, 'gray'), createChip(`L${symbol.lineStart}`, 'blue'))
      list.appendChild(row)
    })
    symbols.appendChild(list)
  }
  wrapper.appendChild(symbols)

  const dependencies = createCard()
  dependencies.appendChild(createSectionTitle(getText('dependencies')))
  const depTags = document.createElement('div')
  depTags.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'
  if (insight.imports.length === 0) {
    dependencies.appendChild(createText(getText('noDependencies'), 'font-size:12px;color:#57606a;margin:0;'))
  } else {
    insight.imports.slice(0, 12).forEach((item) => {
      depTags.appendChild(createChip(item.source, 'blue'))
    })
    dependencies.appendChild(depTags)
  }
  wrapper.appendChild(dependencies)

  const aiCard = createCard()
  aiCard.appendChild(createSectionTitle(currentLanguage === 'zh' ? 'AI 增强' : 'AI Assist'))
  const aiButton = createPrimaryButton(
    llmConfigured ? getText('aiAnalysis') : getText('configureLLM'),
    !llmConfigured,
  )
  if (llmConfigured) {
    aiButton.addEventListener('click', () => performDeepAnalysis(container, fileData))
  }
  aiCard.appendChild(aiButton)
  if (!llmConfigured) {
    aiCard.appendChild(
      createText(
        getText('configureLLM'),
        'font-size:11px;color:#8c959f;text-align:center;margin:8px 0 8px 0;',
      ),
    )
    const settingsButton = createPrimaryButton(getText('openSettings'))
    settingsButton.addEventListener('click', () => openPanel(fileInfo.owner, fileInfo.repo, 'settings'))
    aiCard.appendChild(settingsButton)
  }
  wrapper.appendChild(aiCard)

  const questions = createCard()
  questions.appendChild(createSectionTitle(getText('quickQuestions')))
  const response = document.createElement('div')
  response.style.cssText = 'margin-top:10px;'
  const questionList = document.createElement('div')
  questionList.style.cssText = 'display:flex;flex-direction:column;gap:6px;'
  insight.quickQuestions.forEach((question) => {
    const button = document.createElement('button')
    button.textContent = question
    button.disabled = !llmConfigured
    button.style.cssText = themedStyle(`
      width:100%;
      text-align:left;
      padding:8px 10px;
      border:1px solid #d8dee4;
      border-radius:6px;
      background:#f6f8fa;
      color:${llmConfigured ? '#24292f' : '#8c959f'};
      font-size:12px;
      line-height:1.4;
      cursor:${llmConfigured ? 'pointer' : 'not-allowed'};
    `)
    if (llmConfigured) {
      button.addEventListener('click', () => renderQuestionAnswer(response, fileData, question))
    }
    questionList.appendChild(button)
  })
  questions.append(questionList, response)
  wrapper.appendChild(questions)

  container.appendChild(wrapper)
}

function renderDeepAnalysis(
  container: HTMLElement,
  analysis: DeepFileAnalysisResult,
  fileData: FileData,
) {
  container.replaceChildren()

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
    renderQuestionAnswer(qaResponse, fileData, question)
  }

  askBtn.addEventListener('click', handleAsk)
  input.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') handleAsk()
  })

  container.appendChild(wrapper)
}

async function performDeepAnalysis(contentDiv: HTMLElement, fileData: any) {
  console.log('[GitMentor] Requesting deep analysis...')
  
  // Load current language
  currentLanguage = await getLanguage()
  
  // Check extension context
  if (!isExtensionContextValid()) {
    renderInsightError(contentDiv, 'Extension context unavailable. Please refresh the page.')
    showReloadPrompt()
    return
  }

  // Show loading state
  contentDiv.innerHTML = themedStyle(`
    <div style="padding: 12px; background: #f0f2f5; border-radius: 4px; text-align: center; font-size: 12px; color: #666;">
      ${getText('deepAnalysisInProgress')}
      <div style="margin-top: 8px; font-size: 11px;">${getText('mayTakeMoment')}</div>
    </div>
  `)
  
    // Request deep analysis from service worker
  chrome.runtime.sendMessage({
    action: 'analyzeFileDeep',
    fileName: fileData.fileName,
    fileContent: fileData.fileContent,
    language: currentLanguage,
  }, (response: any) => {
    const runtimeError = chrome.runtime.lastError
    if (runtimeError) {
      renderInsightError(contentDiv, `${getText('deepAnalysisFailed')}: ${runtimeError.message || getText('requestFailed')}`)
      return
    }
    if (response?.data) {
      renderDeepAnalysis(contentDiv, response.data as DeepFileAnalysisResult, fileData)
      return
    }
    renderInsightError(
      contentDiv,
      `${getText('deepAnalysisFailed')}: ${response?.error || getText('requestFailed')}`,
    )
  })
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
    
    // Limit file size for API
    const maxSize = 20000 // 20KB limit
    const truncatedContent = fileContent.length > maxSize 
      ? fileContent.substring(0, maxSize) + '\n... (file truncated)'
      : fileContent
    
    // Store file info for deep analysis
    const fileData = {
      fileName: fileInfo.path,
      fileContent: truncatedContent,
    }
    
    // Check extension context before sending message
    if (!isExtensionContextValid()) {
      renderInsightError(contentDiv, 'Extension context unavailable. Please refresh the page.')
      showReloadPrompt()
      return
    }

    const llmConfigured = await isLLMConfigured()
    renderFileInsight(contentDiv, fileInfo, fileData, llmConfigured)
  } catch (error) {
    renderInsightError(
      contentDiv,
      `Failed to fetch file: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

function openPanel(owner: string, repo: string, initialTab?: 'settings') {
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
    const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${initialTab ? `&tab=${encodeURIComponent(initialTab)}` : ''}`
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
    const panelObserver = new MutationObserver(() => {
      if (!document.body.contains(panel)) {
        showWidget()
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

// Note: GitHub's pushState/replaceState calls happen in the page's main world and
// cannot be observed from this isolated world; SPA navigation is covered by the
// MutationObserver above.
