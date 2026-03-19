# Task Plan: Chatty-Buddy 接入 CodeBuddy CLI（保留 Claude Code，可切换）

## Goal

在 `Chatty-Buddy` 中保留现有 `Claude Code` 能力，同时新增一个 `CodeBuddy CLI` 运行时，并提供可切换入口。

本次目标不是把项目整体替换成 `CodeBuddy`，而是实现：

- 默认仍可使用 `Claude Code`
- 新增 `CodeBuddy CLI` 作为另一条可用运行时
- 用户可以在 UI 中在 `Claude Code` 与 `CodeBuddy CLI` 之间切换
- `CodeBuddy CLI` 的认证由其自身完成，项目内不新增登录流程
- 改动尽量集中在扩展层，降低后续与上游同步时的冲突

## Final Decision

**主方案：双 CLI 切换**

不采用“直接替换 Claude Code”为主线，原因：

1. 当前项目的核心运行时在 `src/lib/claude-client.ts`，上游后续更新高频集中于此
2. 直接替换会把 `Claude Code` 主链改成 `CodeBuddy` 主链，后续 rebase / merge 冲突概率最高
3. 双 CLI 切换可以把改动尽量放在：
   - 运行时选择层
   - CLI 发现层
   - 状态展示层
   - 配置兼容层
4. 双 CLI 切换更利于回滚、灰度和后续继续跟进上游

## Architecture Direction

### 方案定位

将现有“单一 Claude CLI runtime”扩展为“可切换的双 runtime”：

- `claude` -> 继续走现有 `Claude Code` 链路
- `codebuddy` -> 新增 `CodeBuddy CLI` 链路

### 不做的事

以下方向不再采用：

- 不把 `CodeBuddy CLI` 当成普通 HTTP provider preset 处理
- 不要求新增 `base_url` / `api_key` 配置表单
- 不把整个项目文案、逻辑、概念全面替换为 `CodeBuddy`

## Phases

### Phase 1: 建立运行时选择层

目标：先把“选择 Claude / CodeBuddy”这件事独立出来，避免一开始侵入主执行链。

- [ ] 1.1 定义 CLI runtime 枚举
  - 建议值：`claude` | `codebuddy`
- [ ] 1.2 增加 runtime 持久化设置
  - 可落在现有设置表或现有 provider 选项体系中
- [ ] 1.3 增加读取当前 runtime 的统一函数
- [ ] 1.4 增加切换 runtime 的统一入口

**影响文件（预估）**
- `src/lib/db.ts`
- `src/types/*`
- `src/app/api/*` 中与设置读取相关的路由

**原则**
- 先引入“运行时选择”概念，再接 SDK
- 不在这一阶段修改 Claude 的主执行行为

---

### Phase 2: CLI 发现与状态层扩展

目标：让系统同时识别 `Claude Code` 和 `CodeBuddy CLI`。

- [ ] 2.1 在 `src/lib/platform.ts` 中新增 CodeBuddy 发现函数
  - `findCodeBuddyBinary()`
  - `findAllCodeBuddyBinaries()`
  - `getCodeBuddyVersion()`
- [ ] 2.2 保留现有 `findClaudeBinary()` 逻辑
- [ ] 2.3 将状态接口从“Claude 专用”扩展为“当前 runtime / 双 runtime 可识别”
- [ ] 2.4 更新诊断逻辑，支持对当前 runtime 进行检测

**影响文件（预估）**
- `src/lib/platform.ts`
- `src/app/api/claude-status/route.ts`（建议后续重命名或扩展语义）
- `src/lib/provider-doctor.ts`

**原则**
- 优先新增函数，不直接破坏既有 Claude 逻辑
- 能并存就并存，不做互斥假设

---

### Phase 3: 运行时执行层接入 CodeBuddy

目标：在不破坏现有 Claude 路径的前提下，为 `CodeBuddy CLI` 增加一条并行执行链。

- [ ] 3.1 抽出统一的 runtime 入口
  - 可为 `claude-client.ts` 增加 runtime 分发层
  - 或拆出新的 `codebuddy-client.ts`，由上层统一调度
- [ ] 3.2 新增 CodeBuddy SDK / CLI 调用逻辑
  - `@tencent-ai/agent-sdk`
  - `pathToCodebuddyCode`
- [ ] 3.3 权限模式映射
  - `bypassPermissions` -> `dontAsk`
- [ ] 3.4 System prompt 兼容处理
- [ ] 3.5 流式事件格式保持与当前前端兼容

**影响文件（预估）**
- `src/lib/claude-client.ts`
- 新增：`src/lib/codebuddy-client.ts` 或 `src/lib/agent-runtime.ts`
- `package.json`

**原则**
- 尽量采用“新增并挂接”而非“整体替换”
- 前端 SSE 协议尽量不变，减少上层改动

---

### Phase 4: 配置、会话与环境兼容

目标：解决 `CodeBuddy` 与 `Claude` 在配置目录、环境变量、会话恢复上的差异。

- [ ] 4.1 兼容配置目录差异
  - `~/.claude/`
  - `~/.codebuddy/`
- [ ] 4.2 兼容 MCP / settings / skills 路径
- [ ] 4.3 兼容默认模型环境变量
  - `ANTHROPIC_MODEL`
  - `CTI_DEFAULT_MODEL`
- [ ] 4.4 会话恢复隔离
  - 避免在 `Claude` 和 `CodeBuddy` 间复用同一个 `sdk_session_id`
- [ ] 4.5 能力缓存按 runtime 隔离

**影响文件（预估）**
- `src/lib/provider-resolver.ts`
- `src/lib/bridge/conversation-engine.ts`
- `src/lib/agent-sdk-capabilities.ts`
- `src/lib/db.ts`

**原则**
- 运行时差异在兼容层解决，不把前端复杂度抬高
- 会话与缓存必须隔离，避免混用出错

---

### Phase 5: UI 切换与交互完善

目标：让用户可以明确感知当前使用的是哪个 CLI，并顺畅切换。

- [ ] 5.1 在设置页增加运行时切换入口
  - `Claude Code`
  - `CodeBuddy CLI`
- [ ] 5.2 在连接状态区展示当前 runtime
- [ ] 5.3 在诊断面板中显示当前 runtime 的可执行状态和版本
- [ ] 5.4 切换时给出必要提示
  - 会话不兼容时提示重开或清空恢复状态

**影响文件（预估）**
- `src/components/settings/ProviderManager.tsx`
- `src/components/layout/ConnectionStatus.tsx`
- `src/components/settings/ProviderDoctorDialog.tsx`
- `src/i18n/zh.ts`
- `src/i18n/en.ts`

**原则**
- UI 上强调“切换 runtime”，而不是伪装成普通 provider
- 延续当前风格，尽量用轻量但明确的交互

---

### Phase 6: 验证

- [ ] 6.1 `npm run typecheck`
- [ ] 6.2 `npm run test`
- [ ] 6.3 核心对话 smoke test
- [ ] 6.4 验证切换行为
  - Claude -> CodeBuddy
  - CodeBuddy -> Claude
- [ ] 6.5 验证会话恢复与权限请求
- [ ] 6.6 验证 MCP 加载与工具调用

## Option Comparison

### Option A: 双 CLI 切换（推荐）

**特点**
- 保留 Claude 主链
- 新增 CodeBuddy 分支
- UI 提供切换入口

**优点**
- 上游合并更友好
- 可灰度、可回滚
- 用户可在两个 runtime 间切换
- 更符合真实需求

**缺点**
- 初次实现文件数略多
- 需要处理状态、缓存、会话隔离

### Option B: 直接替换 Claude Code

**特点**
- 把现有 Claude 链路直接改成 CodeBuddy
- 用户侧表面上更简单

**优点**
- 短期内某些 UI 入口可能更少改动
- 单 runtime 心智简单

**缺点**
- 核心文件侵入最大
- 上游合并冲突概率高
- 未来若仍需保留 Claude，将二次返工
- 与当前真实需求不一致

## Upstream Merge Assessment

### 哪一种更容易跟上游合并？

**答案：双 CLI 切换明显更好合并。**

原因：

1. **直接替换** 会重写上游最敏感的核心执行链
   - `src/lib/claude-client.ts`
   - 相关状态接口
   - 相关配置路径处理
2. 上游后续若继续迭代 Claude 相关能力，替换方案每次都要重新对冲
3. **双 CLI 切换** 可以把很多改动做成：
   - 新增函数
   - 新增模块
   - 条件分发
   - 兼容层包装
4. 这类改法天然更适合 rebase，因为不需要不断推翻上游默认实现

### 哪一种短期更省事？

**表面上直接替换看起来更直线，但真实工程里未必更省。**

因为你仍然要处理：

- CLI 发现
- 状态接口
- 配置目录
- 会话兼容
- 环境变量映射
- 诊断与 UI 文案

这些工作量不会因为“替换”就消失。

真正减少的只是“切换控件”本身的 UI 代码，而这部分反而不是大头。

## Conclusion

最终建议：

- **主线采用：双 CLI 切换**
- **不建议采用：直接替换 Claude Code**

核心理由：

- 更符合当前用户目标
- 更利于上游持续同步
- 回滚成本更低
- 后续维护成本更可控

## Notes

- 旧的 `CB/TASKS/新增codebuddy.md` 已废弃，原因是它误将本需求识别为“新增 API provider preset”
- 现有实现的真正核心不在 `provider-presets.tsx`，而在 CLI runtime / SDK / 状态探测 / 配置兼容链路
- 若后续进入实现阶段，应优先从“运行时选择层”和“CLI 发现层”开始，而不是先改 UI 文案
