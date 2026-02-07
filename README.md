# GitMentor

AI-powered Chrome extension that helps developers understand, learn, and contribute to any GitHub repository in minutes.

**English** | [中文](#中文)

---

## 🎯 What is GitMentor?

GitMentor is an intelligent Chrome extension that analyzes GitHub repositories using AI and provides comprehensive learning materials. Whether you're exploring a new open-source project, reviewing code, or preparing for an interview, GitMentor helps you quickly grasp the project's architecture, usage, and key concepts.

## ✨ Key Features

### 📋 Project Overview
- **One-sentence summary** of the project's core value
- **Top 3 problems** the project solves
- **3 typical use cases** with code examples
- **Learning difficulty** assessment (Beginner/Intermediate/Advanced)
- **Project metrics**: Stars, Forks, Issues, Activity status
- **Topics & technologies** used

### 🚀 Quick Start Guide
- **Prerequisites** checklist
- **Installation steps** with copy-paste commands
- **First example** to get started immediately
- **Common issues** & solutions (expandable sections)
- **Pro tips** for optimal usage

### 🗺️ Source Code Map
- **Architecture diagram** (Mermaid visualization with fullscreen support)
- **Core modules** breakdown with responsibilities
- **Dependency graph** showing relationships
- **Learning path**: 3-phase recommended reading order
- **Key concepts** glossary with related files
- **Per-project progress tracking** for learning phases

### 🔍 Code File Analysis (Sidebar)
When viewing any code file on GitHub:
- **Quick analysis**: Pattern-based file summary (imports, functions, classes, TODOs)
- **AI Deep Analysis**: Detailed explanation with LLM
- **Ask Questions**: Interactive Q&A about the code
- **Smart detection**: Only appears for code files

### 🌍 Internationalization
- **Bilingual UI**: English / 中文
- **Auto-detection** based on browser language
- **Persistent preference** across sessions

## 🚀 Supported AI Providers

GitMentor supports multiple LLM providers to fit your budget and preferences:

| Provider | Model | Cost | Website |
|----------|-------|------|---------|
| **Claude** | Claude 3 Sonnet | ¥ | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | GPT-4 / GPT-4o | ¥¥ | [platform.openai.com](https://platform.openai.com) |
| **DeepSeek** | DeepSeek-V2.5 | ¥ (Cheapest!) | [platform.deepseek.com](https://platform.deepseek.com) |
| **Silicon Flow** | Qwen2.5-72B-Instruct, DeepSeek, etc. | $ (Cheap) | [cloud.siliconflow.cn](https://cloud.siliconflow.cn) |
| **Zhipu AI** | GLM-4 | ¥ (Cheap) | [open.bigmodel.cn](https://open.bigmodel.cn) |

> 💡 **Recommendation**: For Chinese users, DeepSeek and Silicon Flow offer excellent value. For English content, Claude provides the best quality.

## 📦 Installation

### From Chrome Web Store (Coming Soon)
1. Visit Chrome Web Store
2. Search for "GitMentor"
3. Click "Add to Chrome"

### Manual Installation (Developer Mode)

```bash
# 1. Clone the repository
git clone https://github.com/parkLGW/gitMentor.git
cd gitMentor

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build

# 4. Load in Chrome
# - Open chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the `dist/` folder
```

## 🔧 Configuration

1. Click the GitMentor icon in Chrome toolbar
2. Go to **Settings** tab
3. Select your preferred AI provider
4. Enter your API key (stored locally in your browser)
5. Click **Test Connection** to verify
6. Click **Save**

Your API key is stored locally and never sent to any server except your chosen AI provider.

## 🎮 How to Use

### Analyzing a Repository

1. Navigate to any GitHub repository (e.g., https://github.com/facebook/react)
2. Click the GitMentor extension icon
3. Wait 5-10 seconds for AI analysis
4. Explore the three tabs:
   - **Overview**: Quick understanding
   - **Quick Start**: Get started immediately
   - **Source Map**: Deep dive into code

### Analyzing Code Files

1. Open any code file on GitHub
2. Look for the GitMentor sidebar on the right
3. Click "Start Analysis" for quick metrics
4. Click "AI Deep Analysis" for detailed explanation
5. Ask questions in the Q&A section

### Managing Language

- The extension auto-detects your browser language
- Toggle between English/中文 using the button in the top-right
- All AI responses will match your selected language

## 🏗️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2+ | UI Framework |
| TypeScript | 5.0+ | Type Safety |
| Vite | 5.0+ | Build Tool |
| Tailwind CSS | 3.4+ | Styling |
| Mermaid | 10.x | Diagram Rendering |
| Chrome Manifest | V3 | Extension API |

## 📁 Project Structure

```
src/
├── popup/                  # Extension popup UI
│   ├── App.tsx            # Main popup component
│   └── index.tsx          # Popup entry
├── components/            # React components
│   ├── OverviewTab.tsx    # Project overview
│   ├── QuickStartTab.tsx  # Quick start guide
│   ├── SourceMapTab.tsx   # Source code map
│   ├── SettingsTab.tsx    # Configuration UI
│   ├── LearningPath.tsx   # Learning progress
│   ├── MermaidDiagram.tsx # Architecture diagrams
│   ├── ModuleList.tsx     # Module browser
│   └── ErrorBoundary.tsx  # Error handling
├── services/              # Business logic
│   ├── llm.ts            # LLM manager
│   ├── llm-base.ts       # Provider implementations
│   ├── github.ts         # GitHub API client
│   ├── ai-analysis.ts    # Analysis service
│   ├── context-collector.ts # Project context
│   └── usage-tracker.ts  # Usage statistics
├── prompts/               # AI prompts
│   ├── index.ts          # Prompt exports
│   ├── quick-start.ts    # Quick start prompts
│   └── source-map.ts     # Source map prompts
├── content/               # Content scripts
│   └── content-script.ts # GitHub page integration
├── background/            # Service worker
│   └── service-worker.ts # Background processing
├── utils/                 # Utilities
│   └── eventBus.ts       # Event communication
├── hooks/                 # Custom React hooks
│   ├── useRepo.ts        # Repository data
│   └── useLanguage.ts    # Language management
└── types/                 # TypeScript types
    └── llm.ts            # LLM type definitions
```

## ⚡ Performance

- **Cold start**: < 500ms
- **Analysis time**: 5-15 seconds (depends on project size)
- **Cached data**: Instant loading
- **Memory usage**: < 50MB
- **Bundle size**: ~500KB (gzipped)

## 🔒 Privacy & Security

- 🔐 API keys stored locally in browser (chrome.storage.local)
- 🚫 No data sent to third-party servers except chosen AI provider
- 📝 GitHub API calls made directly from your browser
- 🔄 No analytics or tracking
- ✅ Open source - audit the code yourself

## 🐛 Troubleshooting

### Common Issues

**Extension not loading on GitHub**
- Refresh the page after installation
- Check if you're on a repository page (not github.com home)

**"LLM Not Configured" error**
- Go to Settings tab
- Add your API key
- Test the connection
- Save settings

**Analysis fails**
- Check your internet connection
- Verify API key has sufficient credits
- Try a different AI provider

**Sidebar not appearing**
- Only appears on code files (not images, docs, etc.)
- Refresh the page
- Check browser console for errors

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type checking
npm run type-check

# Build for production
npm run build
```

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<h2 id="中文">中文</h2>

# GitMentor - GitHub 项目学习助手

基于 AI 的 Chrome 扩展，帮助开发者在几分钟内理解、学习并为任何 GitHub 仓库做出贡献。

---

## 🎯 GitMentor 是什么？

GitMentor 是一个智能 Chrome 扩展，使用 AI 分析 GitHub 仓库并提供全面的学习材料。无论您是在探索新的开源项目、审查代码，还是准备面试，GitMentor 都能帮助您快速掌握项目的架构、用途和核心概念。

## ✨ 核心功能

### 📋 项目概览
- **一句话总结**项目的核心价值
- 项目解决的**三大问题**
- **3个典型使用场景**，附带代码示例
- **学习难度**评估（初级/中级/高级）
- **项目指标**：Stars、Forks、Issues、活跃度
- 使用的**主题和技术栈**

### 🚀 快速上手指南
- **前置知识**清单
- **安装步骤**，支持一键复制命令
- **第一个示例**，立即开始使用
- **常见问题**及解决方案（可展开查看）
- **专业技巧**，优化使用体验

### 🗺️ 源码地图
- **架构图**（Mermaid 可视化，支持全屏查看）
- **核心模块**分解，说明职责
- **依赖关系图**，展示模块关联
- **学习路径**：三阶段推荐阅读顺序
- **关键概念**词汇表，附带相关文件
- **按项目追踪**学习进度

### 🔍 代码文件分析（侧边栏）
在 GitHub 上查看任何代码文件时：
- **快速分析**：基于模式的文件摘要（导入、函数、类、TODO）
- **AI 深度分析**：使用 LLM 进行详细解释
- **提问功能**：针对代码的交互式问答
- **智能检测**：仅在代码文件上显示

### 🌍 国际化支持
- **双语界面**：英文 / 中文
- 基于浏览器语言的**自动检测**
- 跨会话的**持久化偏好设置**

## 🚀 支持的 AI 提供商

GitMentor 支持多种 LLM 提供商，适应不同预算和偏好：

| 提供商 | 模型 | 费用 | 网站 |
|--------|------|------|------|
| **Claude** | Claude 3 Sonnet | ¥ | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | GPT-4 / GPT-4o | ¥¥ | [platform.openai.com](https://platform.openai.com) |
| **DeepSeek** | DeepSeek-V2.5 | ¥（最便宜！） | [platform.deepseek.com](https://platform.deepseek.com) |
| **硅基流动** | Qwen2.5-72B-Instruct、DeepSeek 等 | $（便宜） | [cloud.siliconflow.cn](https://cloud.siliconflow.cn) |
| **智谱 AI** | GLM-4 | ¥（便宜） | [open.bigmodel.cn](https://open.bigmodel.cn) |

> 💡 **推荐**：中文用户推荐使用 DeepSeek 和硅基流动，性价比极高。英文内容推荐使用 Claude，质量最佳。

## 📦 安装

### 从 Chrome 应用商店安装（即将上线）
1. 访问 Chrome 应用商店
2. 搜索 "GitMentor"
3. 点击"添加到 Chrome"

### 手动安装（开发者模式）

```bash
# 1. 克隆仓库
git clone https://github.com/parkLGW/gitMentor.git
cd gitMentor

# 2. 安装依赖
npm install

# 3. 构建扩展
npm run build

# 4. 在 Chrome 中加载
# - 打开 chrome://extensions/
# - 启用"开发者模式"
# - 点击"加载已解压的扩展程序"
# - 选择 `dist/` 文件夹
```

## 🔧 配置

1. 点击 Chrome 工具栏中的 GitMentor 图标
2. 进入**设置**标签页
3. 选择您偏好的 AI 提供商
4. 输入 API 密钥（保存在浏览器本地）
5. 点击**测试连接**验证
6. 点击**保存**

您的 API 密钥保存在本地，不会发送到除您选择的 AI 提供商之外的任何服务器。

## 🎮 使用方法

### 分析仓库

1. 访问任意 GitHub 仓库（例如 https://github.com/facebook/react）
2. 点击 GitMentor 扩展图标
3. 等待 5-10 秒完成 AI 分析
4. 浏览三个标签页：
   - **概览**：快速理解项目
   - **快速上手**：立即开始使用
   - **源码地图**：深入代码

### 分析代码文件

1. 在 GitHub 上打开任意代码文件
2. 查看右侧的 GitMentor 侧边栏
3. 点击"开始分析"获取快速指标
4. 点击"AI 深度分析"获取详细解释
5. 在问答区域提问

### 语言管理

- 扩展自动检测浏览器语言
- 使用右上角按钮在英文/中文之间切换
- 所有 AI 响应将匹配您选择的语言

## 🏗️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2+ | UI 框架 |
| TypeScript | 5.0+ | 类型安全 |
| Vite | 5.0+ | 构建工具 |
| Tailwind CSS | 3.4+ | 样式 |
| Mermaid | 10.x | 图表渲染 |
| Chrome Manifest | V3 | 扩展 API |

## 📁 项目结构

```
src/
├── popup/                  # 扩展弹出窗口 UI
│   ├── App.tsx            # 主弹出窗口组件
│   └── index.tsx          # 弹出窗口入口
├── components/            # React 组件
│   ├── OverviewTab.tsx    # 项目概览
│   ├── QuickStartTab.tsx  # 快速上手指南
│   ├── SourceMapTab.tsx   # 源码地图
│   ├── SettingsTab.tsx    # 配置界面
│   ├── LearningPath.tsx   # 学习进度
│   ├── MermaidDiagram.tsx # 架构图
│   ├── ModuleList.tsx     # 模块浏览器
│   └── ErrorBoundary.tsx  # 错误处理
├── services/              # 业务逻辑
│   ├── llm.ts            # LLM 管理器
│   ├── llm-base.ts       # 提供商实现
│   ├── github.ts         # GitHub API 客户端
│   ├── ai-analysis.ts    # 分析服务
│   ├── context-collector.ts # 项目上下文
│   └── usage-tracker.ts  # 使用统计
├── prompts/               # AI 提示词
│   ├── index.ts          # 提示词导出
│   ├── quick-start.ts    # 快速上手提示词
│   └── source-map.ts     # 源码地图提示词
├── content/               # 内容脚本
│   └── content-script.ts # GitHub 页面集成
├── background/            # Service Worker
│   └── service-worker.ts # 后台处理
├── utils/                 # 工具函数
│   └── eventBus.ts       # 事件通信
├── hooks/                 # 自定义 React Hooks
│   ├── useRepo.ts        # 仓库数据
│   └── useLanguage.ts    # 语言管理
└── types/                 # TypeScript 类型
    └── llm.ts            # LLM 类型定义
```

## ⚡ 性能

- **冷启动**：< 500ms
- **分析时间**：5-15 秒（取决于项目大小）
- **缓存数据**：即时加载
- **内存占用**：< 50MB
- **包大小**：~500KB（gzip）

## 🔒 隐私与安全

- 🔐 API 密钥保存在浏览器本地（chrome.storage.local）
- 🚫 数据不会发送到除您选择的 AI 提供商之外的第三方服务器
- 📝 GitHub API 调用直接从您的浏览器发起
- 🔄 无分析或追踪
- ✅ 开源 - 您可以自己审计代码

## 🐛 故障排除

### 常见问题

**扩展在 GitHub 上无法加载**
- 安装后刷新页面
- 检查是否在仓库页面（不是 github.com 首页）

**"LLM 未配置"错误**
- 进入设置标签页
- 添加您的 API 密钥
- 测试连接
- 保存设置

**分析失败**
- 检查网络连接
- 验证 API 密钥有足够余额
- 尝试更换 AI 提供商

**侧边栏未出现**
- 仅在代码文件上显示（不在图片、文档等上）
- 刷新页面
- 检查浏览器控制台错误

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

### 开发设置

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查
npm run type-check

# 生产构建
npm run build
```

## 📜 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

**准备好提升您的 GitHub 学习体验了吗？立即安装 GitMentor！🚀**
