# CodeBuddy SDK 接入交接文档（新会话执行）

## 1. 目标（唯一优先级）
在 **尽量不改源码运作逻辑** 的前提下，接入 `CodeBuddy SDK`。

核心原则：
- 不是重写 provider 系统。
- 不是重构聊天主链路。
- 只做最小增量，优先复用 Claude Code 的稳定逻辑。

---

## 2. 用户硬性要求（逐条）
1. 不要把模型运作流转逻辑改乱（尤其是聊天流式处理）。
2. 先解决“发一条消息出现两条回复”的问题（阻断问题）。
3. Provider 体验尽量与源码一致：
   - 用户连接某 provider 后出现在“已连接提供商”；
   - 可断开后消失；
   - `CodeBuddy SDK` 可以作为内置特例（可显示、不可断开），但风格要统一、简单、解耦。
4. `CodeBuddy SDK` 调用方式应尽量参考 `Claude Code` 的方式（既然能力/接口接近，就优先复用稳定路径）。
5. 避免“花式改造”，避免跨模块连锁修改。

---

## 3. 当前已知问题
### P0（必须先修）
- 单次发送消息，出现两条 assistant 回复（疑似消息流转/落库/前端 append 逻辑存在重复）。

### P1（一致性问题）
- 首页状态曾显示 `CodeBuddy CLI`，Provider 区域显示 `CodeBuddy SDK`，造成认知冲突。

---

## 4. 与源码相比，已出现的关键偏离点（需重点审视）
> 以下是本分支中最可能影响“非最小改动”的位置。

- `src/components/settings/ProviderManager.tsx:199`
  - 对 provider 列表增加了 codebuddy 过滤逻辑（非源码原逻辑）。
- `src/components/settings/ProviderManager.tsx:284`
  - 增加了内置 `CodeBuddy SDK` 专属展示块（非源码原结构）。
- `src/app/api/providers/models/route.ts:94`
  - 直接注入 `codebuddy-sdk` group。
- `src/lib/provider-resolver.ts:109`
  - 新增 `codebuddy-sdk` 虚拟 provider 解析分支。
- `src/lib/agent-runtime.ts:14`
  - 新增按 `codebuddy-sdk` 分流的运行时逻辑。

---

## 5. 推荐执行策略（新会话）
### Step A：先做“单发双回”根因定位（只读）
重点核查：
- 前端消息更新是否在同一响应里 append 了两次；
- SSE 事件是否重复消费；
- 后端是否重复写入 assistant 消息；
- session resume 是否导致重复 replay。

### Step B：把 provider 模块收敛为“最小增量”
建议方向：
- 尽量回到源码 ProviderManager 结构；
- 不做额外“专属交互模块”；
- `CodeBuddy SDK` 以“一个 provider 选项”的心智暴露；
- 仅保留必要协议适配层（resolver/runtime）改动。

### Step C：对齐 Claude Code 稳定链路
- 优先复用 Claude 的请求/会话/流式处理模式；
- CodeBuddy 仅在协议和可执行入口处做差异适配；
- 不分叉重复实现主流程。

---

## 6. 验收标准（必须全部满足）
1. 发送 1 条消息，只产生 1 条 assistant 回复（前端展示与数据库均一致）。
2. 首页和 Provider 页面命名一致，不再出现 CLI/SDK 混淆。
3. Provider 模块结构接近源码，不出现大段定制逻辑。
4. 其它 provider（OpenAI-compatible / Anthropic / OpenRouter 等）行为不回归。
5. 诊断信息不误导（如 `sdk_session_id` 存在应为状态信息，不应默认红/黄告警）。

---

## 7. 当前工作区状态（开始前必看）
当前有较多未提交变更，且包含与 provider 无关文件。执行前应先区分“本任务相关改动”和“无关改动”。

`git status --short`（记录时）：
- `src/app/api/claude-status/route.ts`
- `src/app/api/providers/models/route.ts`
- `src/app/chat/page.tsx`
- `src/components/layout/ConnectionStatus.tsx`
- `src/components/settings/ProviderManager.tsx`
- `src/components/settings/provider-presets.tsx`
- `src/hooks/useProviderModels.ts`
- `src/lib/agent-runtime.ts`
- `src/lib/cli-runtime.ts`
- `src/lib/provider-catalog.ts`
- `src/lib/provider-doctor.ts`
- `src/lib/provider-resolver.ts`
- `src/lib/codebuddy-sdk-client.ts`（新文件）
- 以及若干 bridge/platform/package 文件

建议：新会话先做改动范围收敛，再动代码。

---

## 8. 交接结论
本任务不是“做更多功能”，而是“把接入做薄、做稳、做像源码”。
优先修复稳定性，再谈体验优化。