// Mermaid 图表渲染组件 - 支持缩放和全屏，带 SVG 缓存

import { useEffect, useState, useRef, useCallback } from 'react'
import mermaid from 'mermaid'

interface MermaidDiagramProps {
  chart: string
  className?: string
  onError?: (error: string) => void
}

// SVG 缓存，避免重复渲染
const svgCache = new Map<string, string>()

// 初始化 mermaid 配置
let mermaidInitialized = false

function initMermaid() {
  if (mermaidInitialized) return
  
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
      curve: 'basis',
      padding: 20,
      nodeSpacing: 50,
      rankSpacing: 50,
      htmlLabels: true,
    },
    themeVariables: {
      primaryColor: '#e0e7ff',
      primaryBorderColor: '#6366f1',
      primaryTextColor: '#1e1b4b',
      secondaryColor: '#fce7f3',
      tertiaryColor: '#ecfdf5',
      lineColor: '#6366f1',
      fontSize: '14px',
    },
  })
  
  mermaidInitialized = true
}

// 生成图表的缓存 key
function getCacheKey(chart: string): string {
  // 使用简单的 hash 作为 key
  let hash = 0
  for (let i = 0; i < chart.length; i++) {
    const char = chart.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `mermaid_${hash}`
}

export function MermaidDiagram({ chart, className = '', onError }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const renderAttempted = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chart) {
      setLoading(false)
      setSvg('')
      return
    }

    // 防止重复渲染
    if (renderAttempted.current) {
      return
    }

    const renderChart = async () => {
      renderAttempted.current = true
      setLoading(true)
      setError(null)

      try {
        initMermaid()

        const cacheKey = getCacheKey(chart)
        
        // 检查缓存
        if (svgCache.has(cacheKey)) {
          console.log('[MermaidDiagram] Using cached SVG')
          setSvg(svgCache.get(cacheKey)!)
          setLoading(false)
          return
        }

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        const cleanedChart = chart
          .replace(/\\n/g, '\n')
          .trim()

        console.log('[MermaidDiagram] Rendering chart:', cleanedChart.slice(0, 100))

        try {
          await mermaid.parse(cleanedChart)
        } catch (parseError) {
          console.error('[MermaidDiagram] Parse error:', parseError)
          throw new Error('Invalid Mermaid syntax')
        }

        const { svg: renderedSvg } = await mermaid.render(id, cleanedChart)
        console.log('[MermaidDiagram] Render success, SVG length:', renderedSvg.length)
        
        // 存入缓存
        svgCache.set(cacheKey, renderedSvg)
        setSvg(renderedSvg)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram'
        setError(errorMessage)
        onError?.(errorMessage)
        console.error('[MermaidDiagram] Render error:', err)
      } finally {
        setLoading(false)
      }
    }

    renderChart()

    // 清理函数
    return () => {
      renderAttempted.current = false
    }
  }, [chart, onError])

  // 缩放控制
  const zoomIn = () => setScale(s => Math.min(s + 0.25, 3))
  const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5))
  const resetZoom = () => setScale(1)

  // 全屏查看 - 在新窗口打开更大尺寸
  const toggleFullscreen = useCallback(() => {
    // 使用固定大小，不要覆盖整个屏幕
    const width = Math.min(1400, window.screen.availWidth - 200)
    const height = Math.min(900, window.screen.availHeight - 150)
    const left = (window.screen.availWidth - width) / 2
    const top = (window.screen.availHeight - height) / 2
    
    // 处理 SVG，确保它可以正确缩放
    let processedSvg = svg
    // 确保 SVG 有正确的 viewBox 和宽度设置
    if (!processedSvg.includes('width="100%"') && !processedSvg.includes("width='100%")) {
      processedSvg = processedSvg.replace(/<svg/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')
    }
    
    const newWindow = window.open(
      '', 
      '_blank', 
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )
    
    if (newWindow) {
      // 等待文档加载完成后再注入内容
      newWindow.document.open()
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>架构图 - GitMentor</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
              background: #f6f8fa;
              height: 100%;
              overflow: hidden;
            }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 16px;
              border-bottom: 1px solid #e1e4e8;
              background: white;
              height: 50px;
              flex-shrink: 0;
            }
            .title {
              font-size: 14px;
              font-weight: 600;
              color: #24292e;
            }
            .controls {
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .btn {
              padding: 6px;
              background: transparent;
              border: none;
              cursor: pointer;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: background 0.2s;
            }
            .btn:hover { 
              background: #f0f2f5; 
            }
            .btn:active {
              background: #e1e4e8;
            }
            .zoom-level {
              font-size: 12px;
              color: #666;
              min-width: 50px;
              text-align: center;
              font-weight: 500;
            }
            .main-container {
              display: flex;
              flex-direction: column;
              height: 100vh;
              overflow: hidden;
            }
            .content {
              flex: 1;
              padding: 20px;
              overflow: auto;
              display: flex;
              justify-content: center;
              align-items: flex-start;
              background: #f6f8fa;
            }
            .diagram-wrapper {
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              padding: 20px;
              min-width: 600px;
              transition: transform 0.2s ease;
              transform-origin: center top;
            }
            .diagram-wrapper svg {
              max-width: 100%;
              height: auto;
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="main-container">
            <div class="header">
              <span class="title">架构图</span>
              <div class="controls">
                <button class="btn" id="zoomOutBtn" title="缩小">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 12H4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <span class="zoom-level" id="zoomLevel">100%</span>
                <button class="btn" id="zoomInBtn" title="放大">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="btn" id="resetZoomBtn" title="重置缩放" style="font-size: 12px; color: #666; padding: 6px 10px;">
                  1:1
                </button>
                <button class="btn" id="closeBtn" title="关闭 (ESC)" style="margin-left: 8px;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="content">
              <div class="diagram-wrapper" id="diagramWrapper">
                ${processedSvg}
              </div>
            </div>
          </div>
        </body>
        </html>
      `)
      newWindow.document.close()
      
      // 在新窗口加载完成后初始化缩放功能
      newWindow.onload = function() {
        initZoomFunctionality(newWindow)
      }
      
      // 如果 onload 已经触发，直接初始化
      if (newWindow.document.readyState === 'complete') {
        initZoomFunctionality(newWindow)
      }
    }
  }, [svg])
  
  // 初始化缩放功能的辅助函数
  function initZoomFunctionality(win: Window) {
    const doc = win.document
    const diagramWrapper = doc.getElementById('diagramWrapper')
    const zoomLevel = doc.getElementById('zoomLevel')
    const zoomInBtn = doc.getElementById('zoomInBtn')
    const zoomOutBtn = doc.getElementById('zoomOutBtn')
    const resetZoomBtn = doc.getElementById('resetZoomBtn')
    const closeBtn = doc.getElementById('closeBtn')
    
    if (!diagramWrapper || !zoomLevel) return
    
    let scale = 1
    
    function updateScale() {
      if (diagramWrapper) {
        diagramWrapper.style.transform = 'scale(' + scale + ')'
      }
      if (zoomLevel) {
        zoomLevel.textContent = Math.round(scale * 100) + '%'
      }
    }
    
    // 绑定按钮事件
    zoomInBtn?.addEventListener('click', function() {
      scale = Math.min(3, scale + 0.25)
      updateScale()
    })
    
    zoomOutBtn?.addEventListener('click', function() {
      scale = Math.max(0.5, scale - 0.25)
      updateScale()
    })
    
    resetZoomBtn?.addEventListener('click', function() {
      scale = 1
      updateScale()
    })
    
    closeBtn?.addEventListener('click', function() {
      win.close()
    })
    
    // 键盘快捷键
    doc.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        win.close()
      } else if (e.key === '+' || e.key === '=') {
        scale = Math.min(3, scale + 0.25)
        updateScale()
      } else if (e.key === '-') {
        scale = Math.max(0.5, scale - 0.25)
        updateScale()
      } else if (e.key === '0') {
        scale = 1
        updateScale()
      }
    })
    
    // 默认应用一次缩放以适应窗口
    updateScale()
  }

  // 在新窗口打开图表
  const openInNewWindow = useCallback(() => {
    const newWindow = window.open('', '_blank', 'width=1200,height=800')
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>架构图 - GitMentor</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
              background: #f6f8fa;
              min-height: 100vh;
            }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 16px;
              border-bottom: 1px solid #e1e4e8;
              background: white;
            }
            .title {
              font-size: 14px;
              font-weight: 600;
              color: #24292e;
            }
            .controls {
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .btn {
              padding: 6px;
              background: transparent;
              border: none;
              cursor: pointer;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .btn:hover { background: #f0f2f5; }
            .zoom-level {
              font-size: 12px;
              color: #666;
              min-width: 40px;
              text-align: center;
            }
            .content {
              padding: 20px;
              display: flex;
              justify-content: center;
              min-height: calc(100vh - 60px);
            }
            .diagram-wrapper {
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              padding: 24px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <span class="title">架构图</span>
            <div class="controls">
              <button class="btn" onclick="zoomOut()" title="缩小">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 12H4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span class="zoom-level" id="zoomLevel">100%</span>
              <button class="btn" onclick="zoomIn()" title="放大">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="btn" onclick="resetZoom()" title="重置缩放" style="font-size: 12px; color: #666; padding: 6px 10px;">
                1:1
              </button>
              <button class="btn" onclick="window.close()" title="关闭" style="margin-left: 8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="content">
            <div class="diagram-wrapper" id="diagram">
              ${svg}
            </div>
          </div>
          <script>
            let scale = 1;
            const diagram = document.getElementById('diagram');
            const zoomLevel = document.getElementById('zoomLevel');
            
            function updateScale() {
              diagram.style.transform = 'scale(' + scale + ')';
              diagram.style.transformOrigin = 'top left';
              zoomLevel.textContent = Math.round(scale * 100) + '%';
            }
            
            function zoomIn() {
              scale = Math.min(3, scale + 0.25);
              updateScale();
            }
            
            function zoomOut() {
              scale = Math.max(0.5, scale - 0.25);
              updateScale();
            }
            
            function resetZoom() {
              scale = 1;
              updateScale();
            }
            
            // 键盘快捷键
            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') window.close();
              if (e.key === '+' || e.key === '=') zoomIn();
              if (e.key === '-') zoomOut();
              if (e.key === '0') resetZoom();
            });
          </script>
        </body>
        </html>
      `)
      newWindow.document.close()
    }
  }, [svg])

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">渲染图表中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="flex items-start gap-2">
          <span className="text-red-500">!</span>
          <div>
            <p className="text-sm font-medium text-red-800">图表渲染失败</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <details className="mt-2">
              <summary className="text-xs text-red-500 cursor-pointer">查看原始图表代码</summary>
              <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto">
                {chart}
              </pre>
            </details>
          </div>
        </div>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className={`p-4 bg-gray-50 border border-gray-200 rounded-lg text-center ${className}`}>
        <span className="text-sm text-gray-500">暂无架构图</span>
      </div>
    )
  }

  // 图表内容
  const diagramContent = (
    <div
      className="overflow-auto"
      style={{
        maxHeight: '400px',
      }}
    >
      <div
        ref={containerRef}
        className="mermaid-container transition-transform duration-200 origin-top-left"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          minWidth: 'fit-content',
        }}
      />
    </div>
  )

  // 控制栏
  const controls = (
    <div className="flex items-center justify-between py-2 px-1 border-b border-gray-200 bg-gray-50 rounded-t">
      <div className="flex items-center gap-1">
        <button
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="缩小"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-xs text-gray-500 w-12 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={zoomIn}
          disabled={scale >= 3}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
          title="放大"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={resetZoom}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded text-xs ml-1"
          title="重置缩放"
        >
          1:1
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={openInNewWindow}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded"
          title="在新窗口打开"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-1.5 text-gray-600 hover:bg-gray-200 rounded"
          title="全屏查看"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>
    </div>
  )

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {controls}
      {diagramContent}
    </div>
  )
}

export default MermaidDiagram
