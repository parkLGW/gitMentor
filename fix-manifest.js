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

if (!fs.existsSync(path.join(__dirname, 'dist', 'icons'))) {
  delete manifest.icons;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✓ manifest.json 已修复');

// 2. 复制扩展脚本文件（如果不存在）
const serviceWorkerSrc = path.join(__dirname, 'src', 'background', 'service-worker.ts');
const serviceWorkerDst = path.join(__dirname, 'dist', 'service-worker.js');
const contentScriptSrc = path.join(__dirname, 'src', 'content-script', 'inject.ts');
const contentScriptDst = path.join(__dirname, 'dist', 'content-script.js');

// 读取源文件并转换为JS
if (fs.existsSync(serviceWorkerSrc) && !fs.existsSync(serviceWorkerDst)) {
  let content = fs.readFileSync(serviceWorkerSrc, 'utf8');
  // 移除TypeScript注释
  content = content.replace(/\/\/ .*/g, '');
  fs.writeFileSync(serviceWorkerDst, content);
  console.log('✓ service-worker.js 已复制');
}

if (fs.existsSync(contentScriptSrc) && !fs.existsSync(contentScriptDst)) {
  let content = fs.readFileSync(contentScriptSrc, 'utf8');
  // 移除TypeScript注释
  content = content.replace(/\/\/ .*/g, '');
  fs.writeFileSync(contentScriptDst, content);
  console.log('✓ content-script.js 已复制');
}

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
