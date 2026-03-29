# NiuMa AI 新特性规格 — 移植到 Chatty-Buddy 的候选清单

> 基于 NiuMa AI v1.0.25 逆向分析
> 已排除: 快捷弹出窗口(#5)、小红书发布(#10)、邀请码(#17)、反馈系统(#18)、自动更新(#20)、Skills内容迁移(#24)

## 特性总览

| # | 特性 | 信息充分度 | 难度 | 依赖 |
|---|------|-----------|------|------|
| N1 | 项目自动执行引擎 | ⚠️ API已知 | ⭐⭐⭐⭐ (2-3周) | 无 |
| N2 | Claude Proxy 自动故障转移 | ⚠️ API+模式已知 | ⭐⭐⭐ (1-2周) | 无 |
| N3 | 本地语音识别 | ✅ 充分 | ⭐⭐⭐⭐ (2-3周) | 无 |
| N4 | 定时任务 (Cron) | ⚠️ API已知 | ⭐⭐⭐ (1-2周) | 无 |
| N6 | 文档导出引擎 | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N7 | 数据备份与恢复 | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N8 | 用量统计增强 | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N9 | 微信公众号发布 | ✅ 充分 | ⭐⭐⭐ (1-2周) | 无 |
| N11 | 文件系统监控 | ✅ 充分 | ⭐ (1-2天) | 无 |
| N12 | 首页场景卡片 | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N13 | 外部通知渠道 | ⚠️ API已知 | ⭐⭐ (3-5天) | N1 |
| N14 | 会议纪要 | ⚠️ API已知 | ⭐⭐⭐ (1-2周) | N3 |
| N15 | SQLite 数据库浏览器 | ⚠️ API已知 | ⭐ (1-2天) | 无 |
| N16 | AI 洞察报告 | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N19 | IM 扩展 (钉钉/企微) | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N21 | Excalidraw 白板 | ⚠️ API已知 | ⭐⭐ (3-5天) | 无 |
| N22 | 页面内搜索 | ✅ 充分 | ⭐ (1-2天) | 无 |
| N23 | Changelog 弹窗 | ⚠️ API已知 | ⭐ (1-2天) | 无 |

**信息充分度**: ✅ 可直接参考实现 | ⚠️ API形状已知需自行设计逻辑 | ❌ 信息不足

---

## 各特性详细规格

### N1: 项目自动执行引擎

**NiuMa IPC API:**
```
projects: list, get, create, update, delete, archive, unarchive, listArchived, updatePlanDocument
projectTasks: list, get, create, createBatch, update, move, delete, execute, cancelExecution, getExecutionState
taskDependencies: list, add, remove
taskExecutions: list, get
projectConversations: create, list
projectSettings: get, update
projectTemplates: list
Events: projectExecution.onStarted/onProgress/onCompleted, projectPlan.onUpdated
```

**已知实现细节 (从混淆代码提取):**
- 类名: `ProjectTaskExecutor`, `ProjectStore`, `ProjectSettings`, `ProjectSystemPrompt`
- 数据库表: `projects`, `project_tasks`, `task_dependencies`
- 执行引擎: 60 秒轮询 + 依赖检查 + 串行执行队列 + 10 分钟超时
- 任务状态: Todo → In Progress → Done → Review (看板)
- 任务类型: 自动 (AI执行) / 手动 (提醒用户)
- 优先级: 紧急(红) / 高 / 普通
- 项目级 AI 工具: create_tasks, update_task, mark_task_done, update_plan_document, list_tasks, add_dependency, read_project_file

**参考价值:** API 完整，执行引擎模式是标准任务队列 (类似 Bull/BullMQ)

---

### N2: Claude Proxy 自动故障转移

**NiuMa IPC API:**
```
claudeProxy: getStatus, getHealth, resetHealth(providerId), resetAllHealth
Events: onStatusChanged, onFailover, onProviderSwitched, onError
```

**已知实现细节:**
- 类名: `CircuitBreaker`, `FailoverManager`
- 配置: `HEALTH_CHECK_INTERVAL`, `halfOpen`, `halfOpenAttempts`, `halfOpenMaxAttempts`
- 状态: `failoverQueue`, `failoverAutoSwitch`, `failoverCount`
- 重试: `RETRY`, `RETRY_DELAY_MS`, `RETRYABLE_PATTERNS`
- 代理: `proxyServer`, `proxyPort`, `proxyEnabled`, `proxyFetch`
- 日志表: `proxy_request_logs`

**参考价值:** 标准 Circuit Breaker 模式 (Martin Fowler)，closed→open→half-open 状态机

---

### N3: 本地语音识别 (sherpa-onnx)

**NiuMa IPC API:**
```
voiceModel: getStatus, download, cancelDownload, delete, transcribe, saveRecording, requestMicPermission, openMicSettings
voiceIndicator: onStateChanged(state, duration)
transcriptions: list, get, delete, deleteAll
Events: onDownloadProgress, onStartRecording, onStopRecording, onCancelRecording
Special: isExternalMode, pasteTranscription(text), notifyTranscriptionDone
```

**已知实现细节:**
- sherpa-onnx-node v1.12.24 的完整 JS 封装可读: `vad.js` (VAD + 循环缓冲), `streaming-asr.js` (OnlineRecognizer), `non-streaming-asr.js`, `types.js` (配置 schema)
- 类名: `VoiceModel`, `VoiceShortcutManager`, `VoiceIndicatorWindow`, `VoiceExternalMode`
- 模型目录: `voice-small`
- 外部模式: 可将转录结果粘贴到任意应用

**参考价值:** ✅ 完全充分。sherpa-onnx-node 是开源库有完整文档

---

### N4: 定时任务 (Cron)

**NiuMa IPC API:**
```
scheduledTasks: list(workspaceId), get, create, update, delete, toggle, trigger, getExecutionState, updateWorkspaces
Events: onChanged, onExecutionStarted, onExecutionProgress, onExecutionCompleted
```

**已知实现细节:**
- 类名: `ScheduledTaskService`, `ScheduledTaskStore`, `ScheduledTaskHandlers`
- 数据库表: `scheduled_tasks` (列: enabled, next_execution, workspace, scheduled_date, scheduled_time)

**参考价值:** 用 `node-cron` 或 `croner` 即可实现

---

### N6: 文档导出引擎

**NiuMa IPC API:**
```
export: htmlToPDF(html), htmlToImage(html, opts), htmlToDocx(html), saveBuffer(filePath, base64Data)
```

**参考价值:** Electron `printToPDF` + `html-to-docx` + `html-to-image`

---

### N7: 数据备份与恢复

**NiuMa IPC API:**
```
data: export, import, backup, listBackups, restore, storageStats, cleanConversations
```

**已知实现细节:** 使用 Archiver (tar/zip)，保留最近 3 份备份

---

### N8: 用量统计增强

**NiuMa IPC API:**
```
usageStats:
  - 请求级: getSummary, getProviderStats, getModelStats, getRequestLogs, getRequestDetail, clearLogs
  - 定价: getModelPricing, updateModelPricing, deleteModelPricing
  - 工具调用: logToolCall, getToolCallSummary, getToolCallsByName, getToolCallsByModel, getToolCallsByProvider, getToolCallErrors, clearToolCallLogs
```

**参考价值:** CB 已有基础用量统计，在此之上扩展工具调用追踪和定价管理

---

### N9: 微信公众号发布

**NiuMa IPC API:**
```
wechatPublish: login, logout, getUser, getToken, isAuthenticated, getAccounts, publish, publishNewspic
Events: onStateChanged
```

**已知 Skill 实现 (明文):**
- `baoyu-post-to-wechat/SKILL.md` — 412 行完整工作流
- API 方式: `draft/add` 端点
- Browser 方式: Chrome CDP 自动化
- TypeScript 脚本: `wechat-browser.ts`, `wechat-api.ts`, `wechat-article.ts`, `check-permissions.ts`

**参考价值:** ✅ 完全充分

---

### N11: 文件系统监控

**NiuMa IPC API:**
```
fileWatcher: watch(dirPath), unwatch()
Events: onFileChanged, onDirChanged
```

**参考价值:** ✅ chokidar 包装，几十行代码

---

### N12: 首页场景卡片

**NiuMa IPC API:**
```
scenarios: getAll, syncRemote, setPrefs, addCustom, updateCustom, removeCustom, resetPrefs
```

**已知实现细节:** 表名 `scenario_cache`, `scenario_prefs`；支持远程同步新场景

---

### N13: 外部通知渠道

**NiuMa IPC API:**
```
notificationChannels: list, create(input), update(id, updates), delete(id)
```

**已知实现细节:**
- 类名: `NotificationService`, `NotificationChannel`, `WebhookChannel`
- 渠道类型: 飞书 Webhook / 企微 Webhook / 自定义 URL
- 通知函数: `notifyExecutionCompleted`, `notifyFailover`, `notifyManualTaskDue`, `notifyTaskCompletion`

---

### N14: 会议纪要

**NiuMa IPC API:**
```
meeting: start, appendChunk, finalize, transcribe, saveText, getMeetingsDir
Events: onTranscribeProgress
```

**已知实现细节:** `MeetingSession`, `MeetingChunk`, `WavChunk`, `WavHeader`, `TranscriptionStore`

**依赖:** N3 (语音识别)

---

### N15: SQLite 数据库浏览器

**NiuMa IPC API:**
```
sqlite: open(filePath, readonly), getTableData(filePath, tableName, offset, limit), getSchema(filePath, tableName), executeQuery(filePath, sql), close(filePath)
```

**参考价值:** better-sqlite3 已有，加 viewer UI 即可

---

### N16: AI 洞察报告

**NiuMa IPC API:**
```
insights: listReports(limit), syncWorkspaces(workspaces), generate(options)
Events: onGenerated
```

**已知配置项:** dailyEnabled, dailyModules, dailyTime, deepCycle, deepDay, deepEnabled, deepModules, insightsModel, insightsNotifyExternal, insightsIncludeCCHistory

---

### N19: IM 扩展 (钉钉/企微)

**NiuMa 已知:**
- `DingtalkGateway`, `DINGTALK_CONFIG` → dingtalk-stream 包
- 企微 → @wecom/aibot-node-sdk 包

**参考价值:** CB 已有 Bridge 架构 (Telegram/飞书/Discord/QQ)，加适配器即可

---

### N21: Excalidraw 白板

**NiuMa 已知:** 使用 `@excalidraw/excalidraw` React 组件

---

### N22: 页面内搜索

**NiuMa IPC API:**
```
find: findInPage(text, options), stopFindInPage(action)
Events: onResult
```

**参考价值:** ✅ Electron `webContents.findInPage` API

---

### N23: Changelog 弹窗

**NiuMa IPC API:**
```
releases: getChangelog(fromVersion)
```

## 推荐实施分期

**Phase 1 (最大杠杆，1-2周):** N2(故障转移) → N6(文档导出) → N7(备份) → N11(文件监控) → N22(页面搜索) → N15(SQLite浏览器)

**Phase 2 (核心壁垒，2-3周):** N1(项目执行引擎) → N4(定时任务) → N13(通知渠道) → N12(场景卡片) → N8(用量增强)

**Phase 3 (语音+内容，2-3周):** N3(语音识别) → N14(会议纪要) → N9(微信发布) → N21(白板)

**Phase 4 (扩展，1周):** N19(IM扩展) → N16(洞察报告) → N23(Changelog)
