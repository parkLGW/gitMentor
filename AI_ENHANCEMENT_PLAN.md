# GitMentor AI增强计划

**优先级**：功能完善 > 设计美化  
**支持**：多个AI API（Claude、OpenAI等）  
**用户配置**：用户自带API key  

---

## 🎯 核心改进方向

### 当前问题
- ❌ 只是正则表达式提取文本
- ❌ 没有真正的理解
- ❌ 无法处理复杂/非标项目

### 新方向：AI驱动分析
- ✅ 用LLM理解项目本质
- ✅ 生成真正有帮助的分析
- ✅ 支持任何格式的项目

---

## 📋 功能规划

### 1️⃣ 项目速览（增强版）

**现在**：正则表达式提取  
**新的**：用AI做以下分析

```
输入：项目README + GitHub元数据
输出：
├─ 核心价值（AI理解，1句话）
├─ 你应该学这个项目吗？（针对用户场景的建议）
├─ 实际难度（代码复杂度分析）
├─ 最适合的用户（开发角色分析）
└─ 关键特性（3-5个最重要的）
```

### 2️⃣ 快速上手（增强版）

**现在**：提取代码块  
**新的**：AI生成学习路径

```
输入：README + package.json + 项目结构
输出：
├─ 前置知识（AI评估）
├─ 分步骤快速开始（不是代码复制）
├─ 典型错误预测（基于项目类型）
├─ 验证成功的方法
└─ 下一步学习路线
```

### 3️⃣ 源码学习地图（增强版）

**现在**：模板化  
**新的**：AI代码分析

```
输入：GitHub代码库 + 项目结构
输出：
├─ 架构图（AI生成Mermaid）
├─ 核心文件分析（代码理解）
├─ 学习顺序（基于依赖关系）
├─ 关键概念解释（代码级别）
└─ 学习检验题（AI出题）
```

---

## 🏗️ 技术架构

### 新增组件

```
src/
├── services/
│   ├── llm.ts              # LLM基础服务层
│   │   ├── LLMProvider（抽象类）
│   │   ├── ClaudeProvider
│   │   ├── OpenAIProvider
│   │   └── OllamaProvider（可选）
│   │
│   ├── ai-analysis.ts      # AI分析逻辑
│   │   ├── analyzeProject()      # 项目分析
│   │   ├── generateQuickStart()  # 快速上手
│   │   └── generateSourceMap()   # 源码地图
│   │
│   └── cache.ts            # AI结果缓存
│       └── CacheManager
│
├── components/
│   ├── SettingsTab.tsx     # 新增：设置页面
│   │   ├── APIKeyInput
│   │   ├── ModelSelector
│   │   └─ ProviderConfig
│   │
│   └── [现有标签页，增强版]
│
├── hooks/
│   └── useLLM.ts           # LLM调用Hook
│       └── useAnalysis()   # AI分析状态管理
│
└── types/
   ├── llm.ts               # LLM类型定义
   └── analysis.ts          # 分析结果类型
```

### 支持的LLM

```typescript
interface LLMProvider {
  name: string
  
  // 配置方式
  configure(config: {
    apiKey: string
    baseUrl?: string
    model?: string
  }): void
  
  // 调用方式
  complete(prompt: string): Promise<string>
  stream(prompt: string): AsyncGenerator<string>
}

// 实现
- ClaudeProvider        (Anthropic API)
- OpenAIProvider        (OpenAI API)
- AzureOpenAIProvider   (Azure OpenAI)
- OllamaProvider        (本地 Ollama)
- CustomProvider        (自定义端点)
```

---

## 📊 UI/UX改进

### 新增：设置标签页

```
┌─ GitMentor
├─ [现有标签] 📋 概览 | 🚀 快速上手 | 🗺️ 源码地图
└─ ⚙️ 设置

【设置页面】
├─ AI Provider选择
│  └─ ☐ Claude Sonnet 3
│  └─ ☐ GPT-4
│  └─ ☐ Claude 3 Haiku (快速)
│  └─ ☐ Ollama (本地)
│
├─ API配置
│  ├─ API Key输入框（隐藏显示）
│  ├─ 验证按钮
│  └─ 连接状态指示
│
├─ 分析选项
│  ├─ ☐ 启用代码分析
│  ├─ ☐ 启用架构生成
│  └─ ☐ 生成学习题目
│
└─ 缓存管理
   ├─ 清空缓存
   └─ 显示缓存大小
```

### 增强的分析标签页

**加载状态**：
```
⏳ 正在分析项目...
  ├─ 读取项目信息...
  ├─ 分析代码结构...
  └─ 生成建议...
```

**结果展示**：
```
✓ 分析完成！

【核心观点】
- 用清晰的卡片展示结果
- 支持Markdown格式
- 可展开/折叠详细内容
- 突出关键信息
```

---

## 🔄 数据流

```
用户打开GitHub项目
    ↓
GitMentor检测repo信息
    ↓
用户点击"用AI分析"
    ↓
显示"选择分析类型"对话框
    ↓
【后台流程】
├─ 获取README内容
├─ 获取项目文件树
├─ 获取package.json/requirements.txt等
└─ 调用LLM进行分析
    ↓
结果缓存到localStorage
    ↓
显示分析结果
    ↓
用户可以：
├─ 展开/折叠详细内容
├─ 复制结果
├─ 重新分析（新查询）
└─ 切换到其他标签页
```

---

## 📝 Prompt设计

### Prompt 1: 项目分析

```
请分析这个GitHub项目。

项目信息：
- 名称：{name}
- 描述：{description}
- 语言：{language}
- Stars：{stars}

README内容：
{readme}

项目结构：
{structure}

请提供以下信息（用结构化格式）：
1. 核心价值（一句话）
2. 主要解决的问题（3个）
3. 适用场景（3个）
4. 难度评估（初级/中级/高级 + 理由）
5. 目标用户
6. 关键特性（5个）
```

### Prompt 2: 快速上手

```
用户想快速学习这个项目。

项目信息：{project_info}
README：{readme}
Package配置：{package_config}
项目文件：{files}

请生成一个"从0到1"的快速开始指南：
1. 前置条件（他们需要什么）
2. 3-5个清晰的步骤
3. 第一个能运行的例子
4. 常见错误预防
5. 验证成功的方法
```

### Prompt 3: 源码学习地图

```
用户想深入学习源码。

项目结构：
{tree}

关键文件内容：
{key_files}

请生成：
1. 架构总结（用Mermaid图）
2. 文件优先级排序
3. 推荐学习路径（为什么这个顺序？）
4. 每个阶段应该理解的关键概念
5. 学习检验点（学完后应该能做什么）
```

---

## 🛠️ 开发步骤

### 第1周：基础设施
- [ ] 创建LLM服务抽象层
- [ ] 实现Claude Provider
- [ ] 实现OpenAI Provider
- [ ] 创建缓存系统
- [ ] 实现Settings标签页

### 第2周：分析逻辑
- [ ] 实现项目分析AI逻辑
- [ ] 实现快速上手生成
- [ ] 实现源码地图生成
- [ ] 集成到UI中
- [ ] 测试各个分析功能

### 第3周：UI/UX改进
- [ ] 美化加载状态
- [ ] 改进结果展示（Markdown支持）
- [ ] 添加流式输出（长文本）
- [ ] 优化交互反馈
- [ ] 性能优化

### 第4周：测试 & 打磨
- [ ] 多项目测试
- [ ] 不同LLM测试
- [ ] 错误处理完善
- [ ] 文档更新
- [ ] 发布准备

---

## 🎯 成功标准

- ✅ 支持至少2个LLM（Claude + OpenAI）
- ✅ 分析质量显著优于现在
- ✅ 用户可自带API key
- ✅ 结果有帮助（vs现在的简陋文本）
- ✅ 响应时间可接受（<10s）
- ✅ 缓存工作良好
- ✅ UI直观，功能清晰

---

## 💡 额外功能（如果有时间）

- 学习进度追踪
- 生成学习笔记
- 出题和自测
- 多语言支持
- 离线Ollama支持
- 导出分析结果

---

**准备好开始了吗？** 我会按这个计划，从LLM服务层开始，逐步实现完整的AI分析系统。
