# GitMentor - 开发计划文档

## 项目概览

**项目名**：GitMentor - GitHub 项目学习助手浏览器插件

**核心价值**：帮助开发者在 5-10 分钟内完成对一个 GitHub 项目的"值不值得学、怎么用、从哪读源码"的判断。

**开发周期**：1个月（MVP）

---

## 技术栈选择

### 前端框架
- **React 18** + TypeScript
  - 理由：动态UI更新需求（标签页切换、展开折叠）
  - 支持中英文状态管理

### 浏览器扩展框架
- **Manifest V3**（Chrome最新标准）
  - 支持最新的Chrome扩展API
  - 更好的安全性

### 状态管理
- **Zustand** 或 **Context API**
  - 轻量级，适合插件场景

### 工具链
- **Vite**：快速构建和HMR
- **Tailwind CSS**：快速样式开发
- **ESLint + Prettier**：代码规范

### API集成
- **GitHub API**（REST或GraphQL）
  - 获取项目元数据（Star、更新频率、语言等）
- **Claude API** 或其他LLM（用于生成解析内容）
  - 用户触发时调用（可选高级功能）

---

## 项目结构设计

```
gitMentor/
├── src/
│   ├── popup/                 # 插件弹窗UI
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── styles/
│   │
│   ├── content-script/        # 注入GitHub页面的脚本
│   │   └── inject.ts
│   │
│   ├── background/            # 后台服务Worker
│   │   └── service-worker.ts
│   │
│   ├── components/
│   │   ├── TabNav.tsx         # 标签页导航
│   │   ├── OverviewTab.tsx    # 概览标签
│   │   ├── QuickStartTab.tsx  # 快速上手标签
│   │   ├── SourceMapTab.tsx   # 源码地图标签
│   │   └── AdvancedOptions.tsx # 高级选项（可选功能）
│   │
│   ├── hooks/
│   │   ├── useRepo.ts         # 获取当前GitHub项目信息
│   │   ├── useLanguage.ts     # 中英文切换
│   │   └── useAnalysis.ts     # 调用API进行分析
│   │
│   ├── services/
│   │   ├── github.ts          # GitHub API集成
│   │   ├── analysis.ts        # AI分析服务（调用LLM）
│   │   └── storage.ts         # 本地存储（缓存）
│   │
│   ├── types/
│   │   └── index.ts           # TypeScript类型定义
│   │
│   ├── utils/
│   │   ├── parser.ts          # 解析README和代码
│   │   ├── i18n.ts            # 国际化工具
│   │   └── detect.ts          # 项目语言和类型检测
│   │
│   └── styles/
│       └── globals.css        # 全局样式
│
├── public/
│   ├── manifest.json          # Chrome扩展配置
│   ├── icons/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   ├── icon-128.png
│   │   └── logo.png
│   └── popup.html             # 弹窗HTML
│
├── vite.config.ts             # Vite配置
├── tsconfig.json              # TypeScript配置
├── package.json
├── DEVELOPMENT_PLAN.md        # 本文件
├── API_DESIGN.md              # API设计文档
└── README.md

```

---

## 核心功能模块设计

### 模块1：项目速览卡片（Overview Tab）

**目标**：用户打开插件后，5秒内看到项目的核心信息

**实现步骤**：

1. **检测当前GitHub项目**
   - 从URL或DOM提取owner/repo信息
   - 验证是否在GitHub.com上

2. **获取项目元数据**
   - GitHub API：stars, forks, language, last_update, topics
   - 检测README存在性

3. **解析README（简化）**
   - 提取前100-200字（核心价值段）
   - 识别README中的"使用场景"和"问题定义"部分

4. **语言检测**
   - 判断README和代码注释的语言
   - 自动适配中文或英文展示

5. **生成速览卡片内容**
   - 项目核心价值（一句话）
   - 解决的问题（3个）
   - 适用场景
   - 学习难度评估
   - 项目健康度指标

**数据来源**：
```
GitHub API → {
  name, description, stargazers_count, 
  watchers_count, forks_count, language,
  updated_at, topics, readme_url
}

README 解析 → {
  core_value, problems_solved, 
  use_cases, difficulty_level
}
```

---

### 模块2：快速上手指南（Quick Start Tab）

**目标**：用户找到"从0到1跑起来"的最短路径

**实现步骤**：

1. **识别项目类型**
   - 根据language和topics判断：npm包、Python库、CLI工具、Web框架等
   - 不同类型有不同的安装命令模板

2. **提取核心安装步骤**
   - 扫描README中的"Installation"或"快速开始"部分
   - 提取最关键的3-5步命令
   - 过滤掉可选或高级配置

3. **生成标准化指南**
   ```
   前置知识检查 → 安装步骤 → 基础配置 → 第一个示例 → 常见坑位
   ```

4. **常见坑位数据库**
   - 按项目类型存储常见错误
   - 示例：
     ```
     {
       "project_type": "npm-package",
       "common_issues": [
         { "error": "Module not found", "solution": "..." },
         { "error": "Version conflict", "solution": "..." }
       ]
     }
     ```

5. **下一步推荐**
   - 链接到官方文档高级部分
   - 推荐学习源码的入口

**输出格式**：
```
【前置知识】
- Node.js 14+
- npm / yarn

【安装 3 步】
1. npm install xxx
2. npm run build
3. npm start

【基础配置】
- 必需：config.json
- 可选：advanced.config.js

【第一个示例】
const X = require('xxx');
X.init();

【常见坑位】
1. "模块找不到" → 检查Node版本
2. "权限错误" → 使用sudo或修改npm配置
```

---

### 模块3：源码学习地图（Source Map Tab）

**目标**：用户有清晰的源码阅读路线

**实现步骤**：

1. **项目结构分析**
   - 扫描repo的目录结构
   - 统计关键文件夹大小和文件数量
   - 识别核心文件：main entry、核心逻辑、工具函数

2. **关键文件标注**
   - 按优先级标注（⭐⭐⭐ 必读 / ⭐⭐ 重要 / ⭐ 可选）
   - 简要说明每个文件的作用

3. **推荐学习顺序**
   ```
   第一阶段：理解全局（3个关键文件）
   第二阶段：深入模块（核心业务逻辑）
   第三阶段：高级特性（可选）
   ```

4. **关键概念释义**
   - 从代码中提取频繁出现的术语
   - 提供中英文对照

5. **学习检验点**
   - 每个阶段完成后，提供"你应该理解"的概念清单

**输出格式**：
```
【整体架构】
该项目使用 MVC 模式，分为 Model / View / Controller 三层

【核心文件地图】
src/
├─ index.js (⭐⭐⭐) - 入口文件，初始化应用
├─ core/
│  ├─ engine.js (⭐⭐⭐) - 核心引擎
│  └─ utils.js (⭐⭐) - 工具函数
└─ plugins/
   └─ loader.js (⭐) - 插件加载器

【推荐阅读顺序】
阶段1：index.js → core/engine.js
阶段2：core/utils.js → plugins/
阶段3：高级特性文档

【学习检验】
读完阶段1，你应该理解：
- 应用如何初始化？
- 核心引擎的职责是什么？
```

---

### 模块4：高级功能 - 可选代码解析（Advanced Tab）

**目标**：用户可选择深度分析

**触发方式**：用户点击按钮

**功能1：生成架构图**
- 用户点击 → 调用LLM分析项目结构 → 生成简化的架构图（Mermaid格式或文本）

**功能2：分析指定文件**
- 用户输入文件路径 → 获取文件内容 → LLM生成代码解读 → 展示

**特点**：
- 默认隐藏（不主动消耗token）
- 用户主动触发时才运行
- 显示"正在分析..."的加载状态

---

## 开发步骤（按优先级）

### 第一周：基础框架和首屏

- [ ] 初始化项目 + git repo
- [ ] 配置Vite + React + TypeScript
- [ ] 配置Chrome Manifest V3
- [ ] 实现基础插件UI框架（三标签页）
- [ ] 实现标签页导航切换

### 第二周：第一个核心模块

- [ ] 实现"获取当前GitHub项目信息"的hook
- [ ] 集成GitHub API
- [ ] 实现README解析器
- [ ] 完成概览卡片（Overview Tab）功能
- [ ] 测试概览卡片

### 第三周：第二、三个核心模块

- [ ] 完成快速上手指南（Quick Start Tab）
- [ ] 完成源码学习地图（Source Map Tab）基础版
- [ ] 实现中英文自动检测和切换
- [ ] 测试所有三个标签页

### 第四周：高级功能 + 优化 + 打包

- [ ] 实现高级功能入口（可选代码解析）
- [ ] 集成LLM API（可选，用户触发）
- [ ] UI/UX优化和样式打磨
- [ ] 缓存和性能优化
- [ ] 测试和bug修复
- [ ] 打包成crx文件

---

## 关键技术决策

### 1. 中英文支持方案

```typescript
// i18n工具
const I18N = {
  detectLanguage(text: string): 'zh' | 'en' => {
    // 判断README和代码注释的语言
  },
  
  translate(key: string, lang: 'zh' | 'en') => {
    // 返回对应语言的文本
  }
}
```

### 2. API调用策略

```
概览卡片：
├─ GitHub API（每次必调，但有缓存）
└─ 本地README解析（一次性）

快速上手 + 源码地图：
├─ 主要基于README + 项目结构分析
└─ 只有用户点击"生成架构图"才调用LLM

高级功能：
└─ 仅在用户明确点击时触发LLM API
```

### 3. 缓存策略

```
localStorage存储：
- 项目元数据（24小时）
- README内容（7天）
- 用户分析结果（直到关闭插件）
```

### 4. 错误处理

```
常见场景：
- 非GitHub页面 → 显示"请在GitHub项目页打开此插件"
- API限制 → 显示"请稍后再试" + 本地缓存降级
- README解析失败 → 显示"无法解析，请查看官方文档"
```

---

## 核心API设计

### GitHub Service

```typescript
interface GitHubService {
  // 获取项目信息
  getRepoInfo(owner: string, repo: string): Promise<RepoInfo>
  
  // 获取README内容
  getReadme(owner: string, repo: string): Promise<string>
  
  // 获取项目结构
  getRepoTree(owner: string, repo: string): Promise<FileTree>
}
```

### Analysis Service

```typescript
interface AnalysisService {
  // 分析README，生成速览内容
  analyzeReadme(readme: string): Promise<OverviewData>
  
  // 生成快速上手指南
  generateQuickStart(readme: string, language: string): Promise<QuickStartGuide>
  
  // 生成源码学习路径
  generateSourceMap(tree: FileTree, language: string): Promise<SourceMap>
  
  // 深度分析（用户触发）
  analyzeCode(filePath: string, content: string): Promise<CodeAnalysis>
}
```

---

## MVP测试清单

### 功能测试
- [ ] 在GitHub项目页打开插件，显示正确项目名
- [ ] 概览卡片正确展示5个核心信息
- [ ] 快速上手标签展示安装和示例代码
- [ ] 源码地图标签展示项目结构和推荐阅读顺序
- [ ] 三个标签页切换流畅，无错误

### 中英文支持测试
- [ ] 中文项目能正确检测并展示中文内容
- [ ] 英文项目能正确检测并展示英文内容
- [ ] 用户可手动切换语言

### 浏览器兼容性
- [ ] Chrome 100+ 正常运行
- [ ] 弹窗大小合理（推荐300x600或类似）
- [ ] 没有控制台错误

### 性能
- [ ] 插件启动 < 1s
- [ ] API调用有超时（max 5s）
- [ ] 缓存生效，重复访问快速

---

## 后续版本计划（非MVP）

- V1.1：离线模式（预加载常见项目数据）
- V1.2：用户笔记系统（标注和保存笔记）
- V1.3：项目对比工具
- V2.0：社区数据集成（用户反馈、Star历史等）
- V2.1：学习进度追踪

---

## 部署和发布

### 开发模式
```bash
npm run dev
# 在Chrome中加载 dist/文件夹
```

### 生产构建
```bash
npm run build
# 生成dist/
```

### 发布到Chrome Web Store
- 准备隐私政策
- 上传manifest + icons + 描述
- 等待审核（通常3-7天）

---

## 注意事项

1. **GitHub API限制**：免认证60req/hr，建议实现缓存和认证token配置
2. **CORS问题**：Content Script注入需要配置manifest.json中的permissions
3. **隐私**：不存储用户浏览历史，只存储当前项目数据
4. **性能**：避免在popup加载时做重型计算，尽量异步
5. **UI/UX**：弹窗空间有限，优先展示最关键的信息

