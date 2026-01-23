# Groq API 错误排查指南

如果看到 `Groq API error:` 错误，用这个指南排查问题。

## 🔍 常见错误和解决方案

### 错误 1: "Incorrect API Key provided"

**原因：** API Key 无效或不正确

**解决方案：**
```
1. 登录 https://console.groq.com
2. 点击左侧 "API Keys"
3. 检查你的 API Key
4. 如果找不到，创建新的：
   - 点击 "Create New API Key"
   - 给它取个名字
   - 点击 "Create"
   - 复制新的 Key

5. 在 GitMentor 中：
   - Settings → Groq
   - 粘贴正确的 API Key
   - 点击 "Test Connection"
```

---

### 错误 2: "Authentication failed"

**原因：** API Key 过期或权限不足

**解决方案：**
```
1. API Key 可能被禁用了
2. 删除旧的 Key 并创建新的：
   - 登录 console.groq.com
   - 找到你的旧 Key
   - 点击删除
   - 创建新 Key
   - 在 GitMentor 中更新

3. 确保没有多个 API Key 混淆
```

---

### 错误 3: "Rate limit exceeded"

**原因：** 你的免费额度用完了

**解决方案：**
```
1. 免费层配额已用完
2. 选项：
   a) 等待（通常每天或每月重置）
   b) 升级到付费计划
   c) 切换到其他提供商（DeepSeek, Ollama, LM Studio）

3. 检查使用量：
   - 登录 console.groq.com
   - 查看 "Usage" 或 "Dashboard"
   - 看看还剩多少配额
```

---

### 错误 4: "Model not found"

**原因：** 模型名称不对

**解决方案：**
```
GitMentor 默认使用：mixtral-8x7b-32768

确保：
1. Settings 中的 Model 字段是正确的
2. 没有拼写错误
3. 如果想用其他模型，检查 Groq 支持的模型列表

支持的模型（截至 2024 年）：
- mixtral-8x7b-32768（推荐）
- llama2-70b-4096
- gemma-7b-it
```

---

### 错误 5: "Forbidden"

**原因：** API 地址无法访问（地理限制或网络问题）

**解决方案：**
```
如果看到 "Forbidden" 错误：

1. 检查网络连接
   - 确保网络正常
   - 试试访问其他网站

2. 可能是地理限制
   - 尝试使用 VPN
   - 或改用 DeepSeek（无限制）

3. 如果都不行，用 DeepSeek：
   - https://platform.deepseek.com
   - 完全无限制
   - 中文优化
   - 超便宜
```

---

### 错误 6: "Network error" 或没有响应

**原因：** 网络连接问题或 Groq 服务不可用

**解决方案：**
```
1. 检查网络：
   - 试试在浏览器中打开 https://www.groq.com
   - 或访问 https://console.groq.com
   - 如果无法访问，是网络问题

2. 检查 Groq 服务状态：
   - 访问 https://status.groq.com
   - 看看有没有服务中断

3. 试试其他提供商：
   - DeepSeek（推荐替代）
   - Ollama（本地免费）
   - LM Studio（本地免费）
```

---

## ✅ 快速诊断清单

按顺序检查：

- [ ] API Key 是否正确？
  - 登录 console.groq.com 确认
  
- [ ] API Key 是否过期或被禁用？
  - 创建新的 API Key 试试
  
- [ ] 是否超过了免费配额？
  - 检查 Usage 页面
  
- [ ] 模型名称是否正确？
  - 默认：mixtral-8x7b-32768
  
- [ ] 网络连接是否正常？
  - 试试打开 groq.com
  
- [ ] 是否是地理限制？
  - 用 VPN 或换 DeepSeek

---

## 🆘 还是不行？

如果以上都试过了还是不行：

### 选项 1: 使用 DeepSeek（推荐 🔥）
```
✅ 完全无限制（无地理限制）
✅ 超便宜（¥1 per 100万 tokens）
✅ 中文优化
✅ 无需 VPN

快速开始：
1. 访问 https://platform.deepseek.com
2. 注册
3. 获取 API Key
4. 在 GitMentor 中选择 DeepSeek
```

### 选项 2: 使用 Ollama（本地免费）
```
✅ 完全免费
✅ 100% 离线
✅ 无需网络
✅ 最高隐私

快速开始：
1. 下载 https://ollama.ai
2. 安装并运行
3. 拉取模型：ollama pull mistral
4. 在 GitMentor 中选择 Ollama
```

### 选项 3: 使用 LM Studio（本地，图形界面）
```
✅ 完全免费
✅ 图形界面
✅ 一键启动
✅ 本地运行

快速开始：
1. 下载 https://lmstudio.ai
2. 打开，下载模型
3. 启动 Local Server
4. 在 GitMentor 中选择 LM Studio
```

---

## 📞 需要帮助？

1. **确保 API Key 正确**
   - 复制粘贴而不是手工输入
   - 检查没有多余空格
   
2. **确保网络可以访问 Groq**
   - 试试 https://console.groq.com
   - 如果不行，可能是网络/地理限制

3. **如果还是不行，用 DeepSeek**
   - 无需排查
   - 直接用
   - 成本更低
   - 中文更好

---

**祝你使用 GitMentor 愉快！** 🚀

如果有其他问题，检查 CHEAP_PROVIDERS_GUIDE.md 了解其他提供商的详细信息。
