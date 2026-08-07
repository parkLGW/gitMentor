#!/usr/bin/env node

// 这个脚本在构建后修复 manifest.json 中的路径，并复制必要的脚本文件

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. 修复 manifest.json
const manifestPath = path.join(__dirname, 'dist', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.action.default_popup = 'src/popup/index.html';
manifest.background = {
  ...(manifest.background || {}),
  service_worker: 'service-worker.js',
  type: 'module',
};

// 复制 icons 目录
const iconsSrc = path.join(__dirname, 'public', 'icons');
const iconsDst = path.join(__dirname, 'dist', 'icons');
if (fs.existsSync(iconsSrc)) {
  if (!fs.existsSync(iconsDst)) {
    fs.mkdirSync(iconsDst, { recursive: true });
  }
  const iconFiles = fs.readdirSync(iconsSrc);
  for (const file of iconFiles) {
    fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsDst, file));
  }
  console.log('✓ icons 目录已复制');
} else {
  delete manifest.icons;
  console.log('⚠ icons 目录不存在，已从 manifest 中移除');
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✓ manifest.json 已修复');

// 2. 校验 vite 是否产出了扩展入口
// 这里以前是「产物缺失就从 src 复制」的兜底：它把 TypeScript 原样当成 JS 写出去，
// 得到的是一个装得上、却完全不工作的扩展。构建失败就应该失败。
const requiredBundles = ['content-script.js', 'service-worker.js'];
const missingBundles = requiredBundles.filter(
  (name) => !fs.existsSync(path.join(__dirname, 'dist', name)),
);

if (missingBundles.length > 0) {
  console.error(`✗ 构建产物缺失: ${missingBundles.join(', ')}`);
  process.exit(1);
}

// vite copies public/ into dist on every build, so a file there with the same
// name as a bundle silently replaces it. A stale public/service-worker.js did
// exactly that, shipping an extension whose message handlers were months old.
const shadowed = requiredBundles.filter((name) =>
  fs.existsSync(path.join(__dirname, 'public', name)),
);

if (shadowed.length > 0) {
  console.error(
    `✗ public/ 中的文件会覆盖构建产物: ${shadowed.join(', ')}\n` +
      '  请删除它们 —— 这些入口由 src/ 构建生成。',
  );
  process.exit(1);
}
console.log('✓ 扩展入口产物齐全且未被 public/ 覆盖');

// 3. 修复 popup HTML 中的脚本路径
const popupHtmlPath = path.join(__dirname, 'dist', 'src', 'popup', 'index.html');
if (fs.existsSync(popupHtmlPath)) {
  let htmlContent = fs.readFileSync(popupHtmlPath, 'utf8');
  // 修复脚本和样式表的路径（从 /popup.js 改为 ../../popup.js）
  htmlContent = htmlContent.replace(/src="\/popup\.js"/g, 'src="../../popup.js"');
  htmlContent = htmlContent.replace(/href="\/index\.css"/g, 'href="../../index.css"');
  fs.writeFileSync(popupHtmlPath, htmlContent);
  console.log('✓ popup index.html 路径已修复');
}
