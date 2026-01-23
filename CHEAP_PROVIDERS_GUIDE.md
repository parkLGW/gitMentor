# GitMentor 便宜/免费 AI 提供商指南

**好消息！** 现在 GitMentor 支持 **6 个 AI 提供商**，其中包括**完全免费**和**超便宜**的选项！

## 📊 成本对比

| 提供商 | 成本 | 类型 | 中文支持 | 推荐用途 |
|------|------|------|--------|---------|
| **Claude** | ¥¥ | 云 API | ⭐⭐⭐⭐ | 高质量分析 |
| **OpenAI** | ¥¥¥ | 云 API | ⭐⭐⭐ | 通用 |
| **DeepSeek** 🔥 | ¥ | 云 API | ⭐⭐⭐⭐⭐ | 便宜 + 中文优化 |
| **Groq** 🚀 | FREE! | 云 API | ⭐⭐⭐ | 快速 + 免费 |
| **Ollama** | FREE! | 本地 | ⭐⭐⭐ | 隐私 + 完全离线 |
| **LM Studio** | FREE! | 本地 | ⭐⭐⭐ | 用户友好本地 |

---

## 💰 选择建议

### 🟢 最推荐：DeepSeek
```
为什么选择 DeepSeek：
✓ 超便宜（Claude 1/10 价格）
✓ 中文优化非常好
✓ 质量很不错
✓ 支持中英文 prompts
✓ 适合长期使用
```

**如何使用：**
1. 访问 https://platform.deepseek.com
2. 注册账户
3. 获取 API 密钥
4. 在 GitMentor Settings 中：
   - 选择 "DeepSeek"
   - 粘贴 API 密钥
   - 点击 "Test Connection"
   - 点击 "Save"

**成本估算：**
- 分析 1 个项目：~¥0.01-0.05
- 每月 100 个项目：~¥1-5

---

### 🚀 最快：Groq
```
为什么选择 Groq：
✓ 完全免费
✓ 非常快（推理快 10 倍）
✓ 大配额免费使用
✓ 兼容 OpenAI API
✓ 无需本地设置
```

**如何使用：**
1. 访问 https://console.groq.com
2. 注册免费账户
3. 创建 API 密钥
4. 在 GitMentor Settings 中：
   - 选择 "Groq"
   - 粘贴 API 密钥
   - 选择模型: `mixtral-8x7b-32768` (已预设)
   - 点击 "Test Connection"
   - 点击 "Save"

**成本：**
- 完全免费（有配额限制，但对一般使用充足）

**注意：**
- 免费层有请求频率限制
- 适合中等使用量
- 超高频使用需升级

---

### 🔐 最隐私：Ollama (本地)
```
为什么选择 Ollama：
✓ 完全免费
✓ 100% 离线（无需上传）
✓ 最大隐私保护
✓ 支持多种开源模型
✓ 零追踪
```

**如何使用：**

1. **安装 Ollama：**
   ```bash
   # 访问 https://ollama.ai
   # 下载适合你的平台版本
   # Windows/Mac/Linux 都支持
   ```

2. **启动 Ollama：**
   ```bash
   ollama serve
   ```

3. **拉取模型：**
   ```bash
   # 拉取 Mistral（默认，推荐）
   ollama pull mistral

   # 或者其他模型
   ollama pull neural-chat
   ollama pull dolphin-mixtral
   ollama pull llama2
   ```

4. **在 GitMentor Settings 中：**
   - 选择 "Ollama"
   - 模型保持 `mistral` （或你拉取的模型名）
   - Base URL: `http://localhost:11434`（默认）
   - 点击 "Test Connection"
   - 点击 "Save"

**成本：**
- ¥0（完全免费）

**系统要求：**
- 8GB RAM（推荐）
- 10GB 磁盘空间（用于模型）
- CPU or GPU（GPU 更快）

**模型推荐：**
- `mistral` - 平衡，中等大小
- `neural-chat` - 对话优化
- `dolphin-mixtral` - 高质量，较大
- `llama2` - 通用

---

### 🎯 最方便：LM Studio (本地图形界面)
```
为什么选择 LM Studio：
✓ 完全免费
✓ 图形界面，无需命令行
✓ 自动管理模型
✓ 一键启动
✓ 隐私保护
```

**如何使用：**

1. **下载 LM Studio：**
   - 访问 https://lmstudio.ai
   - 下载安装

2. **打开 LM Studio：**
   - 启动应用
   - 搜索并下载一个模型（例如 `mistral-7b`）
   - 点击 "Load Model"

3. **启动本地服务：**
   - 点击左侧 "Local Server"
   - 点击 "Start Server"
   - 确认运行在 `http://localhost:1234`

4. **在 GitMentor Settings 中：**
   - 选择 "LM Studio"
   - 模型: `local-model`（默认）
   - Base URL: `http://localhost:1234`（默认）
   - 点击 "Test Connection"
   - 点击 "Save"

**成本：**
- ¥0（完全免费）

**系统要求：**
- 同 Ollama
- 但有更友好的界面

---

## 🔄 如何切换提供商

1. 打开 GitMentor 扩展
2. 点击 "⚙️ Settings" 标签
3. 从下拉菜单选择新提供商
4. 根据提供商输入对应的密钥或 URL
5. 点击 "Test Connection"（推荐）
6. 点击 "Save Configuration"

**注意：**
- 配置会自动保存在浏览器本地
- 切换提供商不会丢失其他配置
- 缓存的分析结果会保留

---

## 💡 使用建议

### 场景 1：刚开始尝试
👉 **推荐：Groq**
- 无需注册和付款
- 免费测试所有功能
- 快速体验

### 场景 2：需要中文优化
👉 **推荐：DeepSeek**
- 最便宜
- 中文支持最好
- 长期使用经济

### 场景 3：离线工作 / 隐私至上
👉 **推荐：Ollama 或 LM Studio**
- 完全本地运行
- 零隐私泄露
- 无需网络连接

### 场景 4：高质量需求
👉 **推荐：Claude**
- 最高质量分析
- 值得付费
- 企业级性能

---

## 🆚 快速比较表

```
功能对比            | Claude | OpenAI | DeepSeek | Groq  | Ollama | LM Studio
--------------------|--------|--------|----------|-------|--------|----------
价格                | ¥¥     | ¥¥¥    | ¥        | 免费  | 免费   | 免费
中文支持            | ⭐⭐⭐⭐ | ⭐⭐⭐  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐
速度                | 快     | 快     | 中等     | 最快  | 中等   | 中等
隐私                | 中等   | 中等   | 中等     | 中等  | 最高   | 最高
设置难度            | 易     | 易     | 易       | 易    | 中等   | 易
离线使用            | ✗      | ✗      | ✗        | ✗     | ✓      | ✓
需要 API 密钥       | ✓      | ✓      | ✓        | ✓     | ✗      | ✗
```

---

## ⚠️ 常见问题

### Q1: 哪个最便宜？
**A:** DeepSeek 最便宜（¥1/100万tokens），但 Groq、Ollama、LM Studio 完全免费。

### Q2: DeepSeek 和 Claude 哪个好？
**A:** Claude 质量稍高，但 DeepSeek 已经很不错。对于中文内容，DeepSeek 可能更优。

### Q3: 本地模型（Ollama/LM Studio）会不会很慢？
**A:** 取决于你的电脑。GPU 会很快，CPU 会慢一点。但都比等待 API 响应快。

### Q4: 我能同时使用多个提供商吗？
**A:** 不能（一次只能配置一个），但可以随时切换。每个配置都会保存。

### Q5: API 密钥会被上传到服务器吗？
**A:** **不会。** 所有密钥都只保存在你的浏览器本地。GitMentor 不会上传任何东西到外部服务器。

### Q6: Ollama 和 LM Studio 的区别？
**A:** 
- **Ollama** - 轻量、命令行、快
- **LM Studio** - 图形界面、新手友好

### Q7: 本地模型（Ollama/LM Studio）用什么型号？
**A:** 推荐 `mistral-7b`（好用，快速）或 `neural-chat`（对话优化）

---

## 🚀 快速开始 (3 种方案)

### 方案 A：最快最简单（2 分钟）
```
1. 打开 GitMentor Settings
2. 选择 "Groq"
3. 去 https://console.groq.com 注册
4. 获取 API 密钥
5. 粘贴到 GitMentor
6. 完成！✓
```

### 方案 B：最便宜（5 分钟）
```
1. 打开 GitMentor Settings
2. 选择 "DeepSeek"
3. 去 https://platform.deepseek.com 注册
4. 获取 API 密钥
5. 粘贴到 GitMentor
6. 充值（或使用免费额度）
7. 完成！✓
```

### 方案 C：最隐私（10 分钟）
```
1. 下载 LM Studio (https://lmstudio.ai)
2. 打开，搜索 "mistral-7b"
3. 下载模型
4. 点击 "Local Server" 启动
5. 打开 GitMentor Settings
6. 选择 "LM Studio"
7. 点击 "Test Connection"
8. 完成！✓
```

---

## 📞 支持

- **问题？** 检查你的 API 密钥是否正确
- **连接失败？** 对于 Ollama/LM Studio，确保应用正在运行
- **配额用尽？** 换一个提供商或升级付款计划

---

**祝你使用 GitMentor 愉快！🎉**

Now you can analyze any GitHub project for cheap or free!
