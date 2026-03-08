<img src="docs/icon-readme.png" width="32" height="32" alt="CodePilot" style="vertical-align: middle; margin-right: 8px;" /> CodePilot
===

**Claude Code 的统一桌面客户端** -- 多 Provider 支持、MCP 扩展、自定义技能、跨平台 Bridge，以及理解你项目的助手工作区。

[![GitHub release](https://img.shields.io/github/v/release/op7418/CodePilot)](https://github.com/op7418/CodePilot/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/op7418/CodePilot/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](./README.md) | [日本語](./README_JA.md)

![CodePilot](docs/screenshot.png)

---

[下载](#平台与安装) | [快速开始](#快速开始) | [文档](#文档) | [贡献](#贡献) | [社区](#社区)

---

## 为什么选择 CodePilot

**多 Provider，统一界面。** 连接 Anthropic、OpenRouter、Bedrock、Vertex 或任何自定义端点。对话中随时切换 Provider 和模型，不丢失上下文。

**MCP + Skills 扩展体系。** 添加 MCP 服务器（stdio / sse / http），支持运行时状态监控。定义可复用的提示词技能 -- 全局或项目级 -- 作为斜杠命令调用。从 skills.sh 浏览和安装社区技能。

**随时随地控制。** Bridge 连接 CodePilot 到 Telegram、飞书、Discord 和 QQ。在手机上发消息，在桌面上收回复。

**了解你项目的助手。** .assistant 工作区存储人设文件、Onboarding 流程、每日签到和持久记忆。Claude 会随时间适应你的项目惯例。

**为日常使用而建。** 暂停、恢复和回退会话到任意检查点。分屏并排运行两个对话。追踪 Token 用量和费用。导入 CLI 会话历史。深浅主题一键切换。

---

## 快速开始

### 路径 A：下载发布版（大多数用户）

1. 安装 Claude Code CLI：`npm install -g @anthropic-ai/claude-code`
2. 认证：`claude login`
3. 从 [Releases](https://github.com/op7418/CodePilot/releases) 页面下载对应平台的安装包
4. 启动 CodePilot

### 路径 B：源码构建（开发者）

| 前置条件 | 最低版本 |
|---|---|
| Node.js | 18+ |
| Claude Code CLI | 已安装并完成认证 |
| npm | 9+（Node 18 自带） |

```bash
git clone https://github.com/op7418/CodePilot.git
cd CodePilot
npm install
npm run dev              # 浏览器模式，访问 http://localhost:3000
# -- 或者 --
npm run electron:dev     # 完整桌面应用
```

---

## 首次使用

1. **认证 Claude** -- 如果还没有，先在终端运行 `claude login`。
2. **配置 Provider** -- 打开 设置 > Providers，添加 API Key 或使用 CLI 默认认证。
3. **创建对话** -- 选择工作目录、交互模式（Code / Plan / Ask）和模型。
4. **设置 Assistant Workspace**（可选）-- 在 .assistant 目录下开启 Onboarding、每日签到和人设文件。
5. **添加 MCP 服务器**（可选）-- 前往扩展页面连接外部工具和服务。

---

## 核心能力

### 对话与编码

| 能力 | 说明 |
|---|---|
| 交互模式 | Code / Plan / Ask |
| 推理力度 | Low / Medium / High / Max + Thinking 模式 |
| 权限控制 | Default / Full Access，逐项审批 |
| 会话控制 | 暂停、恢复、回退到检查点、归档 |
| 模型切换 | 对话中随时切换模型 |
| 分屏 | 并排双会话 |
| 附件 | 文件和图片，支持多模态视觉 |
| 斜杠命令 | /help /clear /cost /compact /doctor /review 等 |

### 扩展与集成

| 能力 | 说明 |
|---|---|
| Provider | Anthropic / OpenRouter / Bedrock / Vertex / 自定义端点 |
| MCP 服务器 | stdio / sse / http，运行时状态监控 |
| Skills | 自定义 / 项目 / 全局技能，skills.sh 市场 |
| Bridge | Telegram / 飞书 / Discord / QQ 远程控制 |
| CLI 导入 | 导入 Claude Code CLI .jsonl 会话历史 |
| 图片生成 | Gemini / Anthropic 生图、批量任务、画廊 |

### 数据与工作区

| 能力 | 说明 |
|---|---|
| Assistant Workspace | .assistant 目录、人设、Onboarding、签到、记忆 |
| 文件浏览 | 项目文件树、语法高亮预览 |
| 用量分析 | Token 计数、费用估算、日用量图表 |
| 本地存储 | SQLite（WAL 模式），数据全部在本地 |
| 国际化 | 英文 + 中文 |
| 主题 | 深色 / 浅色，一键切换 |

---

## 平台与安装

| 平台 | 格式 | 架构 |
|---|---|---|
| macOS | .dmg | arm64 (Apple Silicon) + x64 (Intel) |
| Windows | .exe (NSIS) | x64 + arm64 |
| Linux | .AppImage / .deb / .rpm | x64 + arm64 |

从 [Releases](https://github.com/op7418/CodePilot/releases) 页面下载。

CodePilot 尚未进行代码签名，首次启动时操作系统会显示安全警告。

<details>
<summary>macOS："无法验证开发者" / "Apple 无法检查其是否包含恶意软件"</summary>

**方案一** -- 在访达中右键 `CodePilot.app` > 打开 > 确认。

**方案二** -- 系统设置 > 隐私与安全性 > 滚动到安全性 > 点击「仍要打开」。

**方案三** -- 在终端运行：
```bash
xattr -cr /Applications/CodePilot.app
```
</details>

<details>
<summary>Windows：SmartScreen 阻止安装</summary>

**方案一** -- 在 SmartScreen 对话框中点击「更多信息」，然后点击「仍要运行」。

**方案二** -- 设置 > 应用 > 高级应用设置 > 将应用安装控制设为允许任何来源。
</details>

---

## 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- 架构、技术栈、目录结构、数据流
- [docs/handover/](./docs/handover/) -- 设计决策、交接文档
- [docs/exec-plans/](./docs/exec-plans/) -- 执行计划、技术债务

---

## 社区

<img src="docs/wechat-group-qr.png" width="240" alt="微信用户群二维码" />

扫描二维码加入微信用户群，交流使用心得、反馈问题和获取最新动态。

- [GitHub Issues](https://github.com/op7418/CodePilot/issues) -- Bug 反馈和功能建议
- [GitHub Discussions](https://github.com/op7418/CodePilot/discussions) -- 提问和讨论

---

## 贡献

1. Fork 本仓库并创建功能分支
2. `npm install` 然后 `npm run electron:dev` 本地开发
3. 提交 PR 前运行 `npm run test`
4. 向 `main` 提交 PR，附上清晰的变更说明

请保持 PR 聚焦 -- 每个 PR 只包含一个功能或修复。

<details>
<summary>开发命令</summary>

```bash
npm run dev                    # Next.js 开发服务器（浏览器）
npm run electron:dev           # 完整 Electron 应用（开发模式）
npm run build                  # 生产构建
npm run electron:build         # 构建 Electron 可分发包
npm run electron:pack:mac      # macOS DMG（arm64 + x64）
npm run electron:pack:win      # Windows NSIS 安装包
npm run electron:pack:linux    # Linux AppImage、deb、rpm
```

**CI/CD：** 推送 `v*` tag 会自动触发全平台构建并创建 GitHub Release。

**说明：**
- Electron 在 `127.0.0.1` 上 fork Next.js standalone 服务器，使用随机可用端口
- 聊天数据存储在 `~/.codepilot/codepilot.db`（开发模式：`./data/`）
- SQLite 使用 WAL 模式，并发读取性能优秀
</details>

---

## 许可证

MIT
