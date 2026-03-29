# NiuMa AI (牛马AI) 逆向分析 — 架构与技术栈

> 逆向分析日期: 2026-03-29
> App 版本: 1.0.25 | 内部代号: `newmax`
> 官网: https://niuma.limyai.com | 开发商: 一念 (Yinian)

## 一、总体架构

NiuMa AI 是 CodePilot 的商业衍生版本，本质是 **Claude Code Agent SDK 的桌面 GUI 封装 + AI 工作流平台**。

```
┌──────────────────────────────────────────────────┐
│                  Electron Shell                   │
├───────────┬──────────────────────┬───────────────┤
│  Renderer │     Main Process     │  Preload IPC  │
│  (React)  │  (Node.js + SQLite)  │  (735 lines)  │
├───────────┴──────────────────────┴───────────────┤
│           @anthropic-ai/claude-agent-sdk          │
│               (v0.2.72, 嵌入式)                   │
├──────────────────────────────────────────────────┤
│  本地代理层 (Claude Proxy)  ←→  多 Provider 故障转移 │
└──────────────────────────────────────────────────┘
```

## 二、技术栈

| 层 | 技术 |
|---|---|
| 桌面外壳 | Electron (contextIsolated) |
| 前端框架 | React (Vite 构建, 非 Next.js) |
| 数据库 | better-sqlite3 (SQLite WAL) |
| AI 核心引擎 | `@anthropic-ai/claude-agent-sdk` ^0.2.72 |
| 终端 | node-pty + @xterm/xterm |
| 语音识别 | sherpa-onnx-node (离线 ASR) |
| 全局热键 | uiohook-napi |
| IM 机器人 | @larksuiteoapi/node-sdk, @wecom/aibot-node-sdk, dingtalk-stream, discord.js, grammy, qq-official-bot |
| 自动更新 | electron-updater (S3: s3-cn-east-1.qiniucs.com) |
| 白板 | @excalidraw/excalidraw |
| 图表 | mermaid |
| 音视频 | ffmpeg-static |

## 三、IPC API 模块总览

完整 API 定义在 `reference-files/preload-api-surface.mjs`（734 行，完全未混淆）。

暴露为 `window.newmax`，共 36 个模块、~220 个 invoke 方法 + ~45 个事件订阅。

### 核心模块

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `agent` | 4+4事件 | AI 对话查询、流式响应、用户交互、Provider 故障转移 |
| `conversations` | 10 | 对话 CRUD、搜索、收藏、归档 |
| `workspaces` | 5 | 多工作区管理 |
| `claudeCode` | 12+1事件 | Claude Code CLI 安装、认证、诊断、镜像安装 |
| `claudeProxy` | 4+4事件 | 本地代理状态、健康检测、故障转移、Provider 切换 |
| `modelGateway` | 2+1事件 | 模型网关同步 |

### 项目与任务

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `projects` | 9 | 长期项目 CRUD + 归档 + 计划文档 |
| `projectTasks` | 10 | 看板任务 + AI 自动执行 + 批量创建 |
| `taskDependencies` | 3 | 任务依赖图 |
| `taskExecutions` | 2 | 执行历史 |
| `projectConversations` | 2 | 项目级对话 |
| `projectSettings` | 2 | 项目级设置 |
| `scheduledTasks` | 11+4事件 | 独立 cron 定时任务 |

### Skills 与 MCP

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `skills` | 4 | 加载/安装技能 (zip/文件夹) |
| `skillMarket` | 10 | 技能市场（浏览/安装/卸载/社区共享） |
| `mcp` | 5+2事件 | MCP 服务器配置管理 |
| `sharedSkills` | 5 | 社区技能发布审核流 |

### IM 与发布

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `im` | 8+2事件 | IM 机器人网关 (飞书/钉钉/企微/Discord/TG/QQ) |
| `wechatPublish` | 8+1事件 | 微信公众号 OAuth + 发布 |
| `xhsPublish` | 1 | 小红书发布 |

### 数据与统计

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `usageStats` | 16 | 请求级审计 + 工具调用追踪 + 自定义定价 |
| `data` | 7 | 备份/恢复/导入导出/存储统计 |
| `sqlite` | 5 | SQLite 数据库浏览器 |
| `insights` | 3+1事件 | AI 洞察报告 |

### 语音与会议

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `voiceModel` | 11+4事件 | 离线语音识别 + 全局热键 + 外部粘贴 |
| `voiceIndicator` | 1事件 | 录音浮动指示器 |
| `transcriptions` | 4 | 转录历史 |
| `meeting` | 6+1事件 | 会议录音→转录→AI 纪要 |

### 其他

| 模块 | 方法数 | 功能 |
|------|-------|------|
| `terminal` | 7+2事件 | PTY 终端 (最多 5 会话) |
| `scenarios` | 7 | 首页场景卡片 |
| `notificationChannels` | 4 | 外部通知 (飞书/企微/Webhook) |
| `auth` | 6+3事件 | OAuth 认证 (yinian:// URL scheme) |
| `invitationCode` | 5 | 邀请码系统 |
| `feedback` | 4+2事件 | 反馈系统 (截图+工单) |
| `quickWindow` | 5+2事件 | Spotlight 风格弹出窗口 |

## 四、多模型代理网关

NiuMa 实现了本地 Claude Proxy 层，支持 15+ 提供商的自动故障转移：

| 提供商 | API 端点 |
|--------|----------|
| Anthropic | 直连 |
| MiniMax | api.minimax.io/anthropic |
| 月之暗面 (Kimi) | api.kimi.com/coding/ |
| 智谱 (GLM) | open.bigmodel.cn/api/anthropic |
| 硅基流动 | api.siliconflow.com |
| Zenmux | zenmux.ai/api/anthropic |
| AiHubMix | aihubmix.com |
| Longcat | api.longcat.chat/anthropic |
| TBox | api.tbox.cn/api/anthropic |
| Z.AI | api.z.ai/api/anthropic |
| 阶跃星辰 | api.stepfun.com/v1 |
| Cerebras | api.cerebras.ai/v1 |
| OpenRouter | openrouter.ai |
| Groq | groq.com |
| LM Studio / Ollama | localhost |

架构模式：**Circuit Breaker**（closed → open → half-open），关键类名 `CircuitBreaker`、`FailoverManager`。

## 五、内置技能 (42 个)

完整列表见 `reference-files/skill-market.json`。

按类别：
- **文档处理** (9): DOCX, PDF, PPTX, XLSX, Markdown 格式化/转换, 网页转 MD, 公众号写作
- **开发** (5): Frontend Design, Web Artifacts, MCP Builder, Web Testing, 自动化工作流
- **设计** (6): Algorithmic Art, Canvas Design, Slack GIF, 信息图, 知识漫画, 幻灯片
- **图像** (6): OCR, Gemini 图像, 多模型图片, 压缩, Gemini Web, 配图/封面
- **自媒体** (5): 微信发布, X/Twitter 发布, X 转 MD, 小红书图片, Markdown→HTML
- **视频/音频** (3): Remotion, FFmpeg, ImageMagick
- **分析** (1): 全链路数据分析
- **翻译** (2): DeepL, Claude Skills 中文版
- **其他** (5): 主题工厂, 长期计划, Skill Creator, 帮助, Internal Comms

## 六、代码保护情况

| 层 | 状态 |
|---|---|
| Preload 脚本 | **完全未混淆** — 734 行清晰代码，完整 API 契约 |
| 主进程 (1.9MB) | **已混淆** — 变量名替换 + base64 字符串编码 |
| 渲染进程 (7.4MB) | Vite 打包，标准 chunk splitting |
| Skills (42 个) | **明文** — SKILL.md + TypeScript 脚本 |
| 原生模块 | JS 封装可读 (sherpa-onnx-node, uiohook-napi, node-pty) |
