# 🔧 立即修复：无法加载扩展

## ⚡ 快速修复 (3步)

### 1️⃣ 重新构建
```bash
cd D:\projects\products\gitMentor
npm run build
```

### 2️⃣ 卸载旧版本
- 打开 `chrome://extensions/`
- 找到 GitMentor → 点击"移除"

### 3️⃣ 重新加载
- `chrome://extensions/` → "加载未打包的扩展"
- 选择 `D:\projects\products\gitMentor\dist` 文件夹

---

## ✅ 验证安装成功

### 检查清单：
- [ ] 右上角出现GitMentor图标
- [ ] 打开GitHub项目页面
- [ ] 点击GitMentor图标，弹窗显示"概览"标签
- [ ] 能看到项目信息（Stars、Forks等）

### 如果仍有问题：

1. **按 F12 打开控制台**
2. **查看是否有红色错误**
3. **参考 TROUBLESHOOTING.md**

---

## 📦 现在 dist/ 包含：

```
✓ manifest.json           - 扩展配置
✓ service-worker.js       - 后台脚本
✓ content-script.js       - GitHub页面脚本
✓ popup.js               - UI逻辑 (161KB)
✓ index.css              - 样式 (11.2KB)
✓ src/popup/index.html   - 弹窗HTML
```

所有必要文件都已齐全！

---

## 🎯 预期结果

安装成功后，在GitHub项目上：

```
点击图标 → 看到弹窗
    ↓
三个标签：📋 概览 | 🚀 快速上手 | 🗺️ 源码地图
    ↓
【概览标签】显示项目信息
    ↓
【快速上手】显示安装指南
    ↓
【源码地图】显示学习路径
```

---

## 💡 常见问题

**Q: 为什么要重新构建？**  
A: 新的 `service-worker.js` 和 `content-script.js` 文件需要被包含在构建中。

**Q: 重新加载后还是有错误？**  
A: 查看 TROUBLESHOOTING.md 或运行完整修复（见下文）

**Q: 需要多长时间？**  
A: 构建约 1 秒，总共不超过 2 分钟

---

## 🔧 完整修复 (如果快速修复不工作)

```bash
# 1. 进入项目目录
cd D:\projects\products\gitMentor

# 2. 清理所有缓存
rm -r dist node_modules

# 3. 重新安装依赖
npm install

# 4. 重新构建
npm run build

# 5. 在Chrome中：
#    - 移除旧版本 (chrome://extensions/)
#    - 加载 dist/ 文件夹
```

---

## ✨ 成功标志

当您看到这个时，说明安装成功了 ✅

```
GitMentor 扩展已加载
    ↓
在 GitHub 项目页面可以看到 GitMentor 图标
    ↓
点击图标显示功能完整的弹窗
    ↓
所有三个标签页都能正常工作
```

---

**还有问题？** 查看 **TROUBLESHOOTING.md** 获取详细解决方案

最后更新: 2026年1月23日
