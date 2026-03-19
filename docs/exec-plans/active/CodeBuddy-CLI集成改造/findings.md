# Findings & Decisions

## Confirmed Requirement

当前目标已明确为：

- 在 `Chatty-Buddy` 中**保留现有 `Claude Code`**
- **新增 `CodeBuddy CLI`** 作为另一条运行时
- 提供一个**可切换入口**，允许用户在 `Claude Code` 与 `CodeBuddy CLI` 之间切换
- `CodeBuddy CLI` 的认证由其自身负责，项目内**不新增登录/鉴权流程**
- 决策优先级：`上游可合并性 > 行为正确性 > 交付速度`

## Non-Goals

以下不属于当前目标：

- 不把 `CodeBuddy CLI` 做成普通 HTTP provider preset
- 不要求新增 `base_url` / `api_key` 连接配置
- 不把整个产品从概念上全面替换为 `CodeBuddy`

## Research Findings

### 1. 当前项目的真实架构

当前项目中的 `Claude Code` 并不是普通 API provider，而是内建 CLI runtime：

- 模型与 provider 接口层中存在 `env` 这一内建 provider 表达
- 真实对话执行链位于 `src/lib/claude-client.ts`
- 该执行链基于 `@anthropic-ai/claude-agent-sdk`
- CLI 路径通过 `src/lib/platform.ts` 发现
- 状态检测通过 `src/app/api/claude-status/route.ts` 暴露
- 设置页中的默认项在 `src/components/settings/ProviderManager.tsx`

**结论：**
本需求的接入核心是 **CLI runtime 扩展**，不是 `provider-presets.tsx` 中新增一条预设。

### 2. SDK 接口对比

| 特性 | Claude SDK | CodeBuddy SDK |
|------|-----------|---------------|
| 包名 | `@anthropic-ai/claude-agent-sdk` | `@tencent-ai/agent-sdk` |
| CLI 路径参数 | `pathToClaudeCodeExecutable` | `pathToCodebuddyCode` |
| 权限模式 | `default/acceptEdits/plan/bypassPermissions` | 支持 `dontAsk` |
| System Prompt | `{ type: 'preset', preset: 'claude_code', append: string }` | `{ append: string }` |
| 消息流结构 | 当前项目已适配 | 研究结果显示高度兼容 |

### 3. 环境变量与运行时信息

| 用途 | Claude Code | CodeBuddy |
|------|-------------|-----------|
| 默认模型 | `ANTHROPIC_MODEL` | `CTI_DEFAULT_MODEL` |
| CLI 路径 | - | `CTI_CODEBUDDY_EXECUTABLE` |
| 运行时类型 | - | `CTI_RUNTIME` |
| 认证方式 | `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` | CLI 自带 JWT 登录态 |

### 4. 配置文件路径

| 用途 | Claude Code | CodeBuddy |
|------|-------------|-----------|
| 配置根目录 | `~/.claude/` | `~/.codebuddy/` |
| 用户设置 | `~/.claude/settings.json` | `~/.codebuddy/settings.json` |
| MCP 配置 | `~/.claude.json` / `~/.claude/mcp.json` | `~/.codebuddy/mcp.json` |
| Skills 目录 | `~/.claude/skills/` | `~/.codebuddy/skills/` |

### 5. CLI 参数兼容性

已确认 `CodeBuddy CLI` 支持与当前桥接方式高度接近的参数能力：

- `--output-format stream-json`
- `--resume [sessionId]`
- `--continue`
- `--permission-mode <mode>`
- `--model <modelId>`
- `--append-system-prompt <text>`

### 6. 参考实现

参考位置：`/data/爪子/工作空间/BB/BuddyBridge-skill/`

关键文件：

- `src/codebuddysdk-provider.ts`
- `src/codebuddy-provider.ts`
- `src/llm-provider.ts`
- `src/permission-gateway.ts`

这些参考实现说明：

- `CodeBuddy` 接入更像“新增一条 SDK / CLI 运行时”
- 不是“给现有 provider 表单补几个字段”

## Rejected Direction

### 为什么废弃旧的 `CB/TASKS/新增codebuddy.md`

该文档的核心错误是：

- 将需求识别为“新增一个 CodeBuddy CLI Provider 预设”
- 假设只需要在 `provider-presets.tsx` 中新增 preset
- 假设需要用户提供 `base_url`、协议、认证方式等 API 接入信息

这些假设与当前项目真实结构不符，因此该文档已废弃并删除。

## Option Evaluation

### Option A：双 CLI 切换

定义：

- 保留当前 `Claude Code`
- 新增 `CodeBuddy CLI`
- 提供切换入口

评估：

- **需求匹配度**：最高
- **上游可合并性**：最好
- **回滚能力**：最好
- **实现复杂度**：中等
- **长期维护成本**：最低

### Option B：直接替换 Claude Code

定义：

- 直接把当前 `Claude Code` 主链改造成 `CodeBuddy`
- 不保留 Claude 的可用路径

评估：

- **需求匹配度**：不符合当前目标
- **上游可合并性**：最差
- **回滚能力**：较差
- **实现复杂度**：看似较低，实际仍需处理多层兼容
- **长期维护成本**：高

## Merge Risk Assessment

### 为什么“切换”更适合长期跟上游

1. 当前上游高频变化最可能集中在：
   - `src/lib/claude-client.ts`
   - 状态接口
   - UI 状态展示
2. 若采用“直接替换”，将持续改写这些核心路径
3. 若采用“切换”，很多改动可以以以下形式存在：
   - 新增文件
   - 新增函数
   - 条件分发
   - 兼容包装层
4. 这类改动与上游未来 diff 更容易共存

**结论：切换方案更利于 rebase / merge，也更利于长期维护。**

## Important Implementation Implications

若进入实现阶段，必须重点关注：

- CLI binary 发现与状态检测
- 统一 runtime 选择入口
- `Claude` / `CodeBuddy` 的会话隔离
- 能力缓存隔离
- 配置路径兼容
- UI 中的 runtime 显示与切换交互

而不是优先去改：

- 普通 provider preset
- API key 表单
- base_url 配置

## Current Recommendation

**建议采用：双 CLI 切换方案**

理由：

- 最符合当前真实目标
- 改动边界更可控
- 上游更新更好合并
- 若未来策略变化，仍可继续保留或移除其中一个 runtime

## Resources

### 项目关键文件
- `src/lib/claude-client.ts`
- `src/lib/platform.ts`
- `src/lib/provider-resolver.ts`
- `src/lib/bridge/conversation-engine.ts`
- `src/lib/agent-sdk-capabilities.ts`
- `src/components/settings/ProviderManager.tsx`
- `src/components/layout/ConnectionStatus.tsx`

### 参考实现
- `/data/爪子/工作空间/BB/BuddyBridge-skill/src/codebuddysdk-provider.ts`

### CodeBuddy CLI 信息
- 可执行文件：`/usr/local/bin/codebuddy`
- 别名：`cbc`
- 包名：`@tencent-ai/codebuddy-code`
- 版本：`2.63.3`
- 配置目录：`~/.codebuddy/`
