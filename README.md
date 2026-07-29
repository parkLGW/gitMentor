# GitMentor

GitMentor is a Chrome extension for understanding unfamiliar GitHub repositories without leaving GitHub. Open a repository to get a practical learning path—what the project does, how to run it, what to read first, and how its core modules connect. Open a source file to inspect and ask questions about it in an in-page sidebar.

**English** | [中文](#中文)

## What GitMentor Does

GitMentor is built for developers who open an unfamiliar GitHub repository and want to answer practical questions quickly:

- What does this project do?
- How do I run or try it?
- Which files should I read first?
- How are the core modules connected?
- What does this specific source file do?
- Are there obvious security or supply-chain risks?

Rather than starting with an empty chat box, GitMentor organizes repository learning into a guided flow:

```text
Repository overview → Quick start → Source map → Reading path → File understanding → Follow-up questions
```

## How It Works on GitHub

GitMentor has two surfaces, both tied to the GitHub page you are currently viewing:

- **Repository popup:** click the extension icon on a repository page to open the overview, quick start, source map, learning path, repository agent, and security audit.
- **Code file sidebar:** open a supported source file on GitHub and GitMentor injects a sidebar with local structure, symbols, imports, AI analysis, and file-specific questions.

The extension runs in the browser and stores configuration locally. Several views provide deterministic local previews without AI; generated guides, deep analysis, and grounded Q&A require a configured OpenAI-compatible, Claude-compatible, or local model endpoint. Repository content is sent only to GitHub and the AI endpoint selected by the user.

## Why GitMentor

Many AI coding tools focus on writing or changing code. GitMentor is designed for the earlier step: building a reliable mental model of a repository you do not know yet.

- **GitHub-native workflow:** learn while browsing the repository instead of copying its URL or context into another site.
- **A guided learning path:** move from project purpose and first run to architecture, reading order, and individual files.
- **Grounded repository questions:** retrieve relevant source on demand and expose analyzed files, evidence, confidence, and fallback states.
- **Bring your own model:** use common hosted protocols or local inference instead of depending on one AI vendor.
- **Useful before AI is configured:** deterministic repository and file analysis provides an initial view, while clearly separating it from AI-generated conclusions.

## Current Features

### Repository Overview

- Reads GitHub repository metadata and README content.
- Shows project value, difficulty, audience, key features, use cases, and project activity.
- Uses cached AI analysis when available. While AI is unavailable or still running, it clearly labels a preliminary README/GitHub preview and omits claims that cannot be extracted instead of inventing generic placeholders.

### Quick Start

- Generates an AI quick-start guide from README and package metadata.
- Includes prerequisites, installation steps, first example, common issues, next steps, and copyable commands.
- Caches generated guides per repository and language.

### Source Map

- Builds a source-code learning map from repository context.
- Provides architecture summary, Mermaid diagram, module list, dependency relationships, learning path, mission view, and key concepts.
- Starts with a deterministic fallback map, then refines with AI when configured.
- Tracks source-map quality and avoids caching incomplete AI output as final truth.
- Supports quick concept questions such as “Where should I start?” and “What problem does this concept solve?”

### Agent Chat

- A repository-aware chat assistant for follow-up questions.
- Uses README, source map, session summary, recent messages, and on-demand GitHub source retrieval.
- Can search candidate paths, read GitHub files, build a code index, expand imports, and draft grounded answers.
- Shows analyzed files, evidence, confidence, and retrieval fallback notes.
- Persists recent conversation per repository and compresses longer sessions into summaries.
- Renders assistant answers as Markdown and auto-scrolls to the newest message.

### Code File Sidebar

When viewing a GitHub file page, GitMentor injects a sidebar for code-like files.

- Detects current file path from GitHub blob URLs.
- Shows quick local file understanding: metrics, symbols, imports, TODOs, and basic structure.
- Supports AI deep analysis and code-specific questions when an LLM is configured.
- Skips obvious non-code assets such as images, PDFs, archives, and Markdown documents.

### Security Audit

- Runs a browser-side security scan against repository files and dependencies.
- Detects common secret patterns, suspicious dependency names, risky package scripts, dynamic code execution, network exfiltration indicators, and policy issues.
- Supports standard and advanced modes.
- Advanced options include dependency audit, secret scan, malware heuristics, historical risk inference, runtime indicators, policy checks, license risk audit, risk threshold, and max findings.
- Caches audit reports and lets users re-run scans.

### AI Settings

Settings are protocol-first rather than vendor-first.

Supported connection types:

- OpenAI-compatible protocol
- Claude-compatible protocol
- Local inference protocol

Built-in presets:

- OpenAI
- DeepSeek
- Silicon Flow
- Zhipu AI
- Anthropic Claude
- Custom OpenAI-compatible API
- Custom Claude-compatible API
- Ollama
- LM Studio
- Custom local OpenAI-compatible service

Other settings:

- Model and base URL fields where relevant.
- Optional API keys for compatible gateways.
- GitHub token storage for improving GitHub API/source-fetch reliability.
- Connection testing.
- Per-selection config clearing.
- Local API usage statistics for the last 7 days.

## Installation

### Build From Source

```bash
git clone https://github.com/parkLGW/gitMentor.git
cd gitMentor
pnpm install
pnpm build
```

Then load the extension in Chrome:

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist/` folder.

The project also contains `package-lock.json`, so npm can run the scripts, but `package.json` declares pnpm as the package manager.

## Configuration

1. Open a GitHub repository page.
2. Click the GitMentor extension icon.
3. Open **Settings**.
4. Choose a connection type and preset.
5. Enter the API key, model, and base URL if required.
6. Optionally add a GitHub token to reduce rate-limit failures.
7. Click **Test Connection**.
8. Click **Save Configuration**.

Configuration is stored in browser local storage / Chrome extension storage. API keys are not sent anywhere except the selected provider endpoint.

## Usage

### Analyze a Repository

1. Open a repository on `github.com`.
2. Open the GitMentor popup.
3. Use the tabs:
   - **Overview** for project summary and health.
   - **Quick Start** for setup and first run.
   - **Source Map** for architecture, modules, learning path, mission, and concepts.
   - **Agent** for repository-aware follow-up questions.
   - **Security** for risk scanning.
   - **Settings** for AI and GitHub token configuration.

### Ask the Agent

The Agent tab starts with README, source map, and session context. For implementation questions, it can fetch GitHub source files on demand and show which files were used.

Good questions:

- “What are the first three files I should read?”
- “Explain the main request flow for a beginner.”
- “How is memory/session recovery designed?”
- “Which module owns authentication?”
- “What are the hardest parts of this repository?”

### Analyze a File

Open a code file on GitHub. The GitMentor sidebar appears automatically for supported source-like files. Use it to inspect metrics, symbols, dependencies, deep AI analysis, and file-specific questions.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm type-check
pnpm build
```

Useful scripts:

- `pnpm dev`: start Vite dev server.
- `pnpm test`: run Node test runner with `tsx`.
- `pnpm type-check`: run TypeScript without emitting files.
- `pnpm build`: build the extension and run manifest/path fixups.

## Tech Stack

| Area | Technology |
| --- | --- |
| UI | React 18, TypeScript |
| Build | Vite 4 |
| Styling | Tailwind CSS 3.3 |
| Diagrams | Mermaid 10 |
| Markdown | react-markdown, remark-gfm |
| Extension | Chrome Manifest V3 |
| Tests | Node test runner, tsx |

## Project Structure

```text
src/
├── background/              # Manifest V3 service worker and runtime message handlers
├── components/              # Popup tabs and shared UI components
├── content/                 # GitHub page content script and file sidebar
├── content-script/          # Injection helpers
├── hooks/                   # React hooks for repo, language, and LLM state
├── popup/                   # Popup entry, app shell, and global styles
├── prompts/                 # Prompt builders and source-map parsing/fallback logic
├── services/                # GitHub, LLM, agent, security, cache, and analysis services
├── types/                   # Shared TypeScript types
├── utils/                   # Event bus and local cache helpers
└── __tests__/               # Unit and regression tests
```

Important service areas:

- `services/llm-*`: provider configuration, requests, streams, migration, and JSON parsing.
- `services/agent-*`: agent chat runtime, tool loop, source retrieval, sessions, progress, response parsing, and UI helpers.
- `services/security-audit.ts`: local repository security scanner.
- `services/github.ts`: GitHub API and raw content helpers.
- `prompts/source-map.ts`: source map schema, fallback generation, AI parsing, and merge logic.

## Privacy and Security

- API keys are stored locally in the browser.
- GitHub token is optional and stored locally.
- Repository content is sent only to the configured AI provider when AI features are used.
- Local fallback analysis works for several views without sending content to an AI provider.
- Security audit is heuristic and should be treated as an assistant, not a formal security review.

## Troubleshooting

### Extension does not detect the repository

- Make sure the current page is a GitHub repository page.
- Refresh the GitHub tab after installing or rebuilding the extension.

### AI features say the provider is not configured

- Open **Settings**.
- Choose protocol and preset.
- Fill required fields.
- Test and save the configuration.

### GitHub requests fail or source files cannot be fetched

- Add a GitHub token in **Settings**.
- Refresh the tab and retry.
- Very large repositories may still hit browser-side or GitHub-side limits.

### Quick Start or Source Map looks stale

- Use the tab’s refresh button.
- Cached results are stored per repository and language.
- Quick Start keeps AI output bounded. If a provider stops at its output limit, GitMentor retries once with a compact guide instead of parsing the incomplete JSON.
- If the compact retry is also truncated, increase **Maximum Tokens** in Settings or retry with a model that supports longer output.

### Security audit has false positives

- The scanner uses heuristics. Review evidence and file context before acting.
- Adjust advanced options such as max findings, audit mode, and included checks.

## License

MIT License.

---

<h2 id="中文">中文</h2>

# GitMentor - GitHub 项目学习助手

GitMentor 是一个直接运行在 GitHub 页面上的项目学习 Chrome 扩展。打开陌生仓库后，它会帮助你理解项目做什么、如何运行、应该先读哪些文件，以及核心模块如何协作；进入具体源码文件时，还可以在页面侧边栏中直接理解和追问代码。

## GitMentor 能做什么

当你打开一个陌生 GitHub 仓库时，GitMentor 主要帮你回答这些问题：

- 这个项目是做什么的？
- 我该怎么安装和运行？
- 应该先读哪些文件？
- 核心模块之间是什么关系？
- 当前这个源码文件具体做什么？
- 仓库里有没有明显的安全或供应链风险？

GitMentor 不要求用户先面对一个空白聊天框，而是把项目学习组织成一条连续路径：

```text
项目概览 → 快速运行 → 源码地图 → 阅读顺序 → 文件理解 → 继续追问
```

## 如何在 GitHub 页面中使用

GitMentor 提供两种与当前 GitHub 页面绑定的使用形态：

- **仓库弹窗：** 在仓库页面点击扩展图标，查看项目概览、快速上手、源码地图、学习路径、仓库问答和安全审计。
- **代码文件侧边栏：** 在 GitHub 打开受支持的源码文件后，页面会出现 GitMentor 侧边栏，展示本地结构、符号、依赖、AI 深度分析和当前文件问答。

扩展运行在浏览器中，配置保存在本地。部分页面可以在未配置 AI 时提供确定性的本地初步分析；生成式快速指南、深度分析和基于源码的问答需要配置 OpenAI 兼容、Claude 兼容或本地模型端点。仓库内容只会发送给 GitHub 和用户选择的 AI 端点。

## GitMentor 的特点

许多 AI 编程工具主要帮助用户编写或修改代码。GitMentor 更关注之前的一步：帮助开发者为陌生仓库建立可靠的整体认识。

- **GitHub 原位使用：** 浏览仓库时直接学习，不必把仓库 URL 或代码上下文复制到另一个网站。
- **结构化学习路径：** 从项目用途和首次运行，逐步进入架构、阅读顺序和具体文件。
- **有源码依据的问答：** 按需检索相关源码，并展示已分析文件、证据、置信度和降级状态。
- **自选模型：** 支持常见云端兼容协议和本地推理，不绑定单一 AI 厂商。
- **未配置 AI 也有基础价值：** 使用确定性的仓库和文件分析生成初步结果，并明确区分本地结论与 AI 生成内容。

## 当前功能

### 仓库概览

- 读取 GitHub 仓库元信息和 README。
- 展示项目价值、学习难度、目标用户、主要功能、应用场景和活跃度。
- 优先使用缓存的 AI 分析；AI 尚未完成或不可用时，明确展示基于 README/GitHub 数据的初步概览，无法提取的信息直接省略，不再填充通用模板。

### 快速上手

- 基于 README 和包元数据生成 AI 快速入门指南。
- 包含前置条件、安装步骤、第一个示例、常见问题、下一步建议和可复制命令。
- 按仓库和语言缓存生成结果。

### 源码地图

- 基于仓库上下文生成源码学习地图。
- 提供架构摘要、Mermaid 架构图、核心模块、依赖关系、学习路径、任务视图和关键概念。
- 先生成确定性的 fallback 地图；配置 AI 后再后台补全。
- 标记源码地图质量，避免把不完整 AI 输出当作最终结果长期缓存。
- 支持概念快捷提问，例如“先看哪里？”、“这个概念解决什么问题？”。

### 对话助手

- 面向当前仓库的上下文问答助手。
- 使用 README、源码地图、会话摘要、最近消息，并在需要时按需读取 GitHub 源码。
- 可以搜索候选路径、读取 GitHub 文件、构建代码索引、展开 imports，并生成有源码依据的回答。
- 展示已分析文件、证据、置信度和检索降级提示。
- 按仓库保存最近会话，并在会话变长后压缩成摘要。
- AI 回答支持 Markdown 展示，并自动滚动到最新消息。

### 代码文件侧边栏

在 GitHub 文件页打开源码文件时，GitMentor 会注入右侧侧边栏。

- 从 GitHub blob URL 识别当前文件路径。
- 展示本地快速理解：基础指标、关键符号、依赖、TODO 和结构概览。
- 配置 LLM 后支持 AI 深度分析和针对当前文件的问答。
- 会跳过明显的非代码资源，例如图片、PDF、压缩包和 Markdown 文档。

### 安全审计

- 在浏览器侧扫描仓库文件和依赖风险。
- 检测常见密钥模式、可疑依赖、危险 package scripts、动态代码执行、外联泄露指标和策略问题。
- 支持标准模式和高级模式。
- 高级选项包括依赖审计、敏感信息扫描、恶意模式检测、历史风险推断、运行时指标、策略校验、许可证风险、风险阈值和最大发现数。
- 审计报告会缓存，也可以手动重新扫描。

### AI 设置

设置页采用“协议优先”的设计，而不是只按厂商分类。

支持的连接类型：

- OpenAI 兼容协议
- Claude 兼容协议
- 本地推理协议

内置预设：

- OpenAI
- DeepSeek
- 硅基流动
- 智谱 AI
- Anthropic Claude
- 自定义 OpenAI 兼容接口
- 自定义 Claude 兼容接口
- Ollama
- LM Studio
- 自定义本地 OpenAI 兼容服务

其他能力：

- 根据预设显示模型和基础 URL。
- 兼容网关支持可选 API Key。
- 可保存 GitHub Token，提高 GitHub API 和源码抓取稳定性。
- 支持连接测试。
- 支持清空当前选择的配置。
- 展示近 7 天本地 API 用量统计。

## 安装

### 从源码构建

```bash
git clone https://github.com/parkLGW/gitMentor.git
cd gitMentor
pnpm install
pnpm build
```

然后在 Chrome 中加载扩展：

1. 打开 `chrome://extensions/`。
2. 启用 **Developer mode / 开发者模式**。
3. 点击 **Load unpacked / 加载已解压的扩展程序**。
4. 选择生成的 `dist/` 目录。

项目中也保留了 `package-lock.json`，npm 可以运行脚本；但 `package.json` 当前声明的包管理器是 pnpm。

## 配置

1. 打开任意 GitHub 仓库页面。
2. 点击 GitMentor 扩展图标。
3. 进入 **设置**。
4. 选择连接类型和模板预设。
5. 按需填写 API Key、模型和基础 URL。
6. 可选填写 GitHub Token，以减少 rate limit 或源码读取失败。
7. 点击 **测试连接**。
8. 点击 **保存配置**。

配置保存在浏览器本地存储 / Chrome 扩展存储中。API Key 只会发送给你选择的提供商端点。

## 使用方式

### 分析仓库

1. 在 `github.com` 打开一个仓库。
2. 打开 GitMentor 弹窗。
3. 使用各个标签页：
   - **概览**：项目摘要和活跃度。
   - **快速上手**：安装、运行和第一个示例。
   - **源码地图**：架构、模块、学习路径、任务和概念。
   - **对话助手**：围绕当前仓库追问。
   - **安全审计**：扫描明显风险。
   - **设置**：配置 AI 和 GitHub Token。

### 使用对话助手

对话助手默认基于 README、源码地图和会话上下文回答。遇到实现细节问题时，它会按需读取 GitHub 源码，并展示使用了哪些文件。

适合的问题：

- “这个项目最推荐先读哪三个文件？”
- “我刚入门，这个项目的主流程是怎样的？”
- “内存/会话恢复这块具体是怎么设计的？”
- “认证逻辑由哪个模块负责？”
- “这个仓库里最容易看不懂的点是什么？”

### 分析单个文件

在 GitHub 上打开源码文件。GitMentor 会自动显示侧边栏，用于查看文件指标、符号、依赖、AI 深度分析和文件级问答。

## 开发

```bash
pnpm install
pnpm dev
pnpm test
pnpm type-check
pnpm build
```

常用脚本：

- `pnpm dev`：启动 Vite 开发服务。
- `pnpm test`：使用 Node test runner 和 `tsx` 运行测试。
- `pnpm type-check`：运行 TypeScript 类型检查。
- `pnpm build`：构建扩展并修正 manifest / popup 路径。

## 技术栈

| 领域 | 技术 |
| --- | --- |
| UI | React 18, TypeScript |
| 构建 | Vite 4 |
| 样式 | Tailwind CSS 3.3 |
| 图表 | Mermaid 10 |
| Markdown | react-markdown, remark-gfm |
| 扩展 | Chrome Manifest V3 |
| 测试 | Node test runner, tsx |

## 项目结构

```text
src/
├── background/              # Manifest V3 service worker 和运行时消息处理
├── components/              # 弹窗标签页和共享 UI 组件
├── content/                 # GitHub 页面 content script 和文件侧边栏
├── content-script/          # 注入辅助逻辑
├── hooks/                   # 仓库、语言和 LLM 状态 hooks
├── popup/                   # 弹窗入口、App 外壳和全局样式
├── prompts/                 # Prompt 构建、源码地图解析和 fallback 逻辑
├── services/                # GitHub、LLM、Agent、安全、缓存和分析服务
├── types/                   # 共享 TypeScript 类型
├── utils/                   # 事件总线和本地缓存工具
└── __tests__/               # 单元测试和回归测试
```

重点服务模块：

- `services/llm-*`：提供商配置、请求、流式读取、迁移和 JSON 解析。
- `services/agent-*`：对话助手运行时、工具循环、源码检索、会话、进度、响应解析和 UI 辅助。
- `services/security-audit.ts`：本地仓库安全扫描器。
- `services/github.ts`：GitHub API 和 raw 文件内容读取。
- `prompts/source-map.ts`：源码地图 schema、fallback 生成、AI 解析和合并逻辑。

## 隐私与安全

- API Key 保存在浏览器本地。
- GitHub Token 是可选配置，也保存在本地。
- 只有使用 AI 功能时，仓库内容才会发送给你配置的 AI 提供商。
- 若未配置 AI，部分视图仍可使用本地 fallback 分析。
- 安全审计是启发式辅助工具，不能替代正式安全评审。

## 故障排除

### 扩展无法识别仓库

- 确认当前页面是 GitHub 仓库页面。
- 安装或重新构建扩展后，刷新 GitHub 页面。

### AI 功能提示未配置

- 打开 **设置**。
- 选择协议和预设。
- 填写必要字段。
- 测试连接并保存配置。

### GitHub 请求失败或源码读取失败

- 在 **设置** 中添加 GitHub Token。
- 刷新页面后重试。
- 超大仓库仍可能触发浏览器侧或 GitHub 侧限制。

### 快速上手或源码地图内容过期

- 使用对应标签页的刷新按钮。
- 缓存按仓库和语言保存。
- 快速上手会限制 AI 输出规模。若供应商因输出长度限制提前停止，GitMentor 会使用紧凑格式自动重试一次，不会解析残缺 JSON。
- 如果紧凑重试仍被截断，请在设置中提高 **最大 Token 数**，或改用支持更长输出的模型。

### 安全审计出现误报

- 扫描器基于启发式规则，请结合证据和源码上下文判断。
- 可以调整高级选项，例如最大发现数、审计模式和扫描项。

## License

MIT License.
