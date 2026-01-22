# GitMentor 故障排查指南

## 问题：无法加载脚本 JavaScript "content-script.js"。无法加载清单

### 原因分析

这个错误通常意味着：
1. ❌ manifest.json 文件有语法错误或路径不正确
2. ❌ 必要的脚本文件丢失
3. ❌ 文件权限问题

### ✅ 解决方案

#### 方案 1: 重新构建（推荐）

```bash
# 1. 进入项目目录
cd D:\projects\products\gitMentor

# 2. 清理并重新构建
npm run build
```

这会重新生成所有必要的文件。

#### 方案 2: 手动验证 dist/ 目录

检查 `dist/` 文件夹中是否有以下文件：

```
dist/
├── manifest.json          ✓ 必须
├── service-worker.js      ✓ 必须
├── content-script.js      ✓ 必须
├── popup.js              ✓ 必须
├── index.css             ✓ 必须
└── src/
    └── popup/
        └── index.html    ✓ 必须
```

如果缺少任何文件，运行 `npm run build`。

#### 方案 3: 在 Chrome 中重新加载

1. 打开 `chrome://extensions/`
2. 找到 "GitMentor" 扩展
3. 点击刷新按钮（圆形箭头）
4. 如果仍有错误，继续方案 4

#### 方案 4: 完全卸载后重装

1. 打开 `chrome://extensions/`
2. 点击 GitMentor 的"移除"
3. 运行 `npm run build`
4. 重新加载 `dist/` 文件夹

---

## 常见错误及解决方案

### 错误 1: "无法加载清单"

**症状**: 加载扩展时显示"无法加载清单"

**解决**:
```bash
# 验证 manifest.json 格式
npm run build
```

### 错误 2: "资源加载失败 popup.js"

**症状**: 扩展加载后点击图标弹窗无法显示

**解决**:
1. 检查 `dist/popup.js` 是否存在
2. 刷新扩展（方案 3）
3. 重新构建（方案 1）

### 错误 3: "无法访问 GitHub API"

**症状**: 概览标签显示"无法加载数据"

**解决**:
1. 检查网络连接
2. 检查 GitHub API 是否可访问
3. 查看控制台日志 (F12)
4. GitHub API 有速率限制 (60req/hr 未认证)

### 错误 4: "localStorage 不可用"

**症状**: 语言设置、缓存无法保存

**解决**:
1. 检查浏览器是否允许扩展使用存储
2. 清除浏览器缓存
3. 重新加载扩展

---

## 调试步骤

### 打开开发者工具

```
扩展页面 F12 → Console
```

查看是否有错误信息。

### 检查关键日志

成功加载时应该看到：
```
GitMentor content script loaded on https://github.com/...
```

### 网络检查

1. F12 → Network 标签
2. 查看 GitHub API 调用是否成功
3. 检查 CORS 问题（通常不会有）

### 存储检查

```javascript
// 在 Console 中运行
localStorage.getItem('gitmentor_cache_facebook/react/info')
```

应该返回缓存数据或 `null`。

---

## 完整修复步骤 (如果以上都不起作用)

### 第一步：清理

```bash
# 删除 dist 文件夹
rm -r dist          # macOS/Linux
rmdir /s dist       # Windows

# 删除 node_modules
rm -r node_modules  # macOS/Linux
rmdir /s node_modules # Windows
```

### 第二步：重新安装依赖

```bash
npm install
```

### 第三步：重新构建

```bash
npm run build
```

### 第四步：在 Chrome 中重装

1. 打开 `chrome://extensions/`
2. 移除 GitMentor
3. 刷新页面
4. 点击"加载未打包的扩展"
5. 选择 `dist/` 文件夹

---

## 技术细节

### manifest.json 配置

必要字段：
```json
{
  "manifest_version": 3,
  "name": "...",
  "version": "...",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["https://github.com/*", "https://api.github.com/*"],
  "action": {
    "default_popup": "src/popup/index.html"
  },
  "background": {
    "service_worker": "service-worker.js"
  },
  "content_scripts": [{
    "matches": ["https://github.com/*"],
    "js": ["content-script.js"]
  }]
}
```

### 文件路径规则

- `manifest.json` 中的路径相对于 `dist/` 目录
- `popup.html` 中的脚本/样式路径需要以 `/` 开头

---

## 如果仍然无法解决

### 收集信息

1. **错误信息**: 完整的错误消息
2. **系统信息**: 
   ```bash
   node --version
   npm --version
   ```
3. **Chrome版本**: 打开 `chrome://version/`
4. **构建日志**:
   ```bash
   npm run build 2>&1 > build.log
   ```

### 寻求帮助

包含以上信息，这将帮助快速诊断问题。

---

## 预防措施

### 开发时

```bash
# 每次修改后重建
npm run build

# 在 Chrome 中刷新扩展
# 或完全卸载后重装
```

### 性能优化

```bash
# 检查类型
npm run type-check

# 检查代码质量
npm run lint
```

---

## 快速参考

| 问题 | 解决方案 |
|-----|--------|
| 清单加载失败 | `npm run build` |
| 脚本加载失败 | 检查 dist/ 文件，重新构建 |
| 弹窗不显示 | 刷新扩展或重装 |
| 数据不加载 | 检查网络，查看控制台 |
| 缓存不工作 | 刷新扩展或清空 localStorage |

---

**需要帮助？查看 QUICK_START.md 或 TESTING.md**

最后更新: 2026年1月23日
