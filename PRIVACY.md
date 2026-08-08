# Privacy Policy — GitMentor

Last updated: 2026-08-08

GitMentor is a browser extension that helps you understand GitHub projects. This
policy describes exactly what data the extension handles and where it goes.

## The short version

GitMentor has no backend. The developer operates no server, collects no data,
and receives nothing from your use of the extension. Everything the extension
stores stays in your browser, and everything it sends goes either to GitHub or
to the AI provider you configured yourself.

## What is stored on your device

The extension uses the browser's local storage. Nothing in this list leaves your
device except as described in the next section.

- **AI provider API key.** Required for AI features. Stored locally.
- **GitHub personal access token.** Optional, used to raise GitHub API rate
  limits and read repositories you can access. Stored locally.
- **AI provider configuration.** Protocol, preset, model name, and endpoint URL.
- **Cached analysis results.** So reopening a project does not re-run the
  analysis.
- **Token usage counts.** A local tally shown in the interface. It is never
  transmitted.

You can remove all of it by removing the extension, or by clearing the
extension's data from your browser settings.

## What is sent, and to whom

### To GitHub

The extension reads public repository data through `api.github.com` and
`raw.githubusercontent.com`: repository metadata, file trees, and file contents
for the project you are viewing. If you configured a GitHub token, it is sent to
GitHub to authenticate those requests. This is subject to
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

### To the AI provider you configured

When you use an AI feature, the extension sends that provider a prompt
containing repository content — such as the README, the file tree, or the source
files being analyzed — together with your API key for authentication.

The extension does not choose this provider for you. It is whichever one you
entered in Settings, and the data is handled under that provider's own privacy
policy. Supported providers include OpenAI, Anthropic, DeepSeek, SiliconFlow,
Zhipu AI, and any OpenAI-compatible endpoint you supply.

If you configure a local runtime such as Ollama or LM Studio, requests go to
your own machine and no repository content leaves it.

### To anyone else

Nothing. GitMentor contains no analytics, no telemetry, no crash reporting, no
advertising, and no third-party trackers. It makes no network request to any
destination other than GitHub and the AI endpoint you configured.

## What is never collected

The extension does not collect or transmit your browsing history, personal
information, location, credentials for any site, or the contents of pages other
than the GitHub repository pages it is explicitly activated on.

## Permissions and why they exist

- `storage` — to keep your settings and cached analysis on your device.
- `https://github.com/*` — to recognize repository pages and display the
  interface on them.
- `https://api.github.com/*`, `https://raw.githubusercontent.com/*` — to read
  repository data for analysis.

## Data sold or shared

None. There is no recipient to sell to or share with.

## Changes

Material changes to this policy will be published in this file, and its history
is visible in the repository's commit log.

## Contact

Open an issue at https://github.com/parkour-Cat/gitMentor/issues

---

# 隐私政策 — GitMentor

最后更新：2026-08-08

GitMentor 是一个帮助你理解 GitHub 项目的浏览器扩展。本政策说明扩展处理哪些数据、
以及这些数据流向何处。

## 一句话版本

GitMentor 没有后端服务。开发者不运营任何服务器、不收集任何数据，也不会从你的使用中
获得任何信息。扩展存储的一切都留在你的浏览器里，发送的一切要么去 GitHub，要么去你
自己配置的 AI 服务商。

## 存储在你设备上的内容

扩展使用浏览器本地存储。以下内容除下一节所述情况外不会离开你的设备。

- **AI 服务商 API 密钥。** 使用 AI 功能所必需，本地存储。
- **GitHub 个人访问令牌。** 可选，用于提高 GitHub API 速率限制、读取你有权访问的
  仓库，本地存储。
- **AI 服务商配置。** 协议、预设、模型名称和接口地址。
- **分析结果缓存。** 使重新打开项目时无需再次分析。
- **Token 用量统计。** 仅在界面中展示的本地计数，从不上传。

卸载扩展，或在浏览器设置中清除该扩展的数据，即可删除全部内容。

## 发送了什么，发给谁

### 发给 GitHub

扩展通过 `api.github.com` 和 `raw.githubusercontent.com` 读取公开仓库数据：仓库
元信息、文件树，以及你正在浏览的项目的文件内容。如果你配置了 GitHub 令牌，该令牌会
发送给 GitHub 用于认证这些请求。此部分适用
[GitHub 的隐私声明](https://docs.github.com/cn/site-policy/privacy-policies/github-general-privacy-statement)。

### 发给你配置的 AI 服务商

当你使用 AI 功能时，扩展会向该服务商发送包含仓库内容的提示词 —— 例如 README、文件
树，或正在分析的源文件 —— 并附带你的 API 密钥用于认证。

服务商不是扩展替你选的，而是你在设置中自行填写的，相关数据受该服务商自己的隐私政策
约束。支持的服务商包括 OpenAI、Anthropic、DeepSeek、硅基流动、智谱 AI，以及任何你
提供的 OpenAI 兼容接口。

如果你配置的是 Ollama 或 LM Studio 这类本地运行时，请求只会发往你自己的机器，仓库
内容不会离开本机。

### 发给其他任何人

没有。GitMentor 不含任何分析统计、遥测、崩溃上报、广告或第三方追踪代码。除 GitHub
和你配置的 AI 接口外，它不向任何目标发起网络请求。

## 从不收集的内容

扩展不收集也不传输你的浏览历史、个人信息、地理位置、任何网站的登录凭据，以及除其被
明确激活的 GitHub 仓库页面之外的任何页面内容。

## 权限说明

- `storage` —— 在你的设备上保存设置和分析缓存。
- `https://github.com/*` —— 识别仓库页面并在其上展示界面。
- `https://api.github.com/*`、`https://raw.githubusercontent.com/*` —— 读取用于
  分析的仓库数据。

## 数据出售或共享

无。不存在可供出售或共享的接收方。

## 变更

本政策的实质性变更将发布于本文件，其修订历史可在仓库的提交记录中查看。

## 联系方式

在 https://github.com/parkour-Cat/gitMentor/issues 提交 issue
