import { query } from '@tencent-ai/agent-sdk';
import type {
  AssistantMessage,
  UserMessage,
  ResultMessage,
  PartialAssistantMessage,
  ToolProgressMessage,
  ErrorMessage,
  Options,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpServerConfig,
  Query,
} from '@tencent-ai/agent-sdk';
import type { ClaudeStreamOptions, SSEEvent, TokenUsage, MCPServerConfig, PermissionRequestEvent, FileAttachment } from '@/types';
import { isImageFile } from '@/types';
import { registerPendingPermission } from './permission-registry';
import { registerConversation, unregisterConversation } from './conversation-registry';
import { captureCapabilities, setCachedPlugins } from './agent-sdk-capabilities';
import { getSetting, updateSdkSessionId, createPermissionRequest } from './db';
import { resolveForClaudeCode, toCodeBuddyEnv } from './provider-resolver';
import { findCodeBuddyBinary, findGitBash, getExpandedPath } from './platform';
import { getRuntimeSessionId, setRuntimeSessionId } from './cli-runtime';
import { notifyPermissionRequest, notifyGeneric } from './telegram-bot';
import { classifyError, formatClassifiedError } from './error-classifier';
import os from 'os';
import fs from 'fs';
import path from 'path';

/**
 * Sanitize a string for use as an environment variable value.
 * Removes null bytes and control characters that cause spawn EINVAL.
 */
function sanitizeEnvValue(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize all values in an env record so child_process.spawn won't
 * throw EINVAL due to invalid characters or non-string values.
 * On Windows, spawn is strict: every env value MUST be a string.
 * Spreading process.env can include undefined values which cause EINVAL.
 */
function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      clean[key] = sanitizeEnvValue(value);
    }
  }
  return clean;
}

let cachedCodeBuddyPath: string | null | undefined;

/**
 * Invalidate the cached CodeBuddy binary path in this module.
 * Must be called after installation so the next SDK call picks up the new binary.
 */
export function invalidateCodeBuddyClientCache(): void {
  cachedCodeBuddyPath = undefined; // reset to "not yet looked up"
}

/**
 * On Windows, npm installs CLI tools as .cmd wrappers that can't be
 * spawned without shell:true. Parse the wrapper to extract the real
 * .js script path so we can pass it to the SDK directly.
 */
function resolveScriptFromCmd(cmdPath: string): string | undefined {
  try {
    const content = fs.readFileSync(cmdPath, 'utf-8');
    const cmdDir = path.dirname(cmdPath);
    const patterns = [
      /"%~dp0\\([^"]*codebuddy[^"]*\.js)"/i,
      /%~dp0\\(\S*codebuddy\S*\.js)/i,
      /"%dp0%\\([^"]*codebuddy[^"]*\.js)"/i,
    ];
    for (const re of patterns) {
      const m = content.match(re);
      if (m) {
        const resolved = path.normalize(path.join(cmdDir, m[1]));
        if (fs.existsSync(resolved)) return resolved;
      }
    }
  } catch {
    // ignore read errors
  }
  return undefined;
}

function findCodeBuddyPath(): string | undefined {
  if (cachedCodeBuddyPath !== undefined) return cachedCodeBuddyPath || undefined;
  const found = findCodeBuddyBinary();
  if (!found) {
    cachedCodeBuddyPath = null;
    return undefined;
  }
  // Resolve symlinks so the SDK's path transformation
  // (bin/codebuddy → dist/codebuddy-headless.js) works correctly.
  // Without this, npm/nvm symlinks like /usr/local/bin/codebuddy →
  // …/node_modules/@tencent-ai/codebuddy-code/bin/codebuddy cause the
  // SDK to look for dist/ next to the symlink instead of the real file.
  try {
    const resolved = fs.realpathSync(found);
    cachedCodeBuddyPath = resolved;
    return resolved;
  } catch {
    cachedCodeBuddyPath = found;
    return found;
  }
}

/**
 * Convert our MCPServerConfig to the SDK's McpServerConfig format.
 * Supports stdio, sse, and http transport types.
 */
function toSdkMcpConfig(
  servers: Record<string, MCPServerConfig>
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};
  for (const [name, config] of Object.entries(servers)) {
    const transport = config.type || 'stdio';

    switch (transport) {
      case 'sse': {
        if (!config.url) {
          console.warn(`[mcp] SSE server "${name}" is missing url, skipping`);
          continue;
        }
        const sseConfig: McpSSEServerConfig = {
          type: 'sse',
          url: config.url,
        };
        if (config.headers && Object.keys(config.headers).length > 0) {
          sseConfig.headers = config.headers;
        }
        result[name] = sseConfig;
        break;
      }

      case 'http': {
        if (!config.url) {
          console.warn(`[mcp] HTTP server "${name}" is missing url, skipping`);
          continue;
        }
        const httpConfig: McpHttpServerConfig = {
          type: 'http',
          url: config.url,
        };
        if (config.headers && Object.keys(config.headers).length > 0) {
          httpConfig.headers = config.headers;
        }
        result[name] = httpConfig;
        break;
      }

      case 'stdio':
      default: {
        if (!config.command) {
          console.warn(`[mcp] stdio server "${name}" is missing command, skipping`);
          continue;
        }
        const stdioConfig: McpStdioServerConfig = {
          command: config.command,
          args: config.args,
          env: config.env,
        };
        result[name] = stdioConfig;
        break;
      }
    }
  }
  return result;
}

/**
 * Format an SSE line from an event object
 */
function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Extract text content from an SDK assistant message
 */
function extractTextFromMessage(msg: AssistantMessage): string {
  const parts: string[] = [];
  for (const block of msg.message.content) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

/**
 * Extract token usage from an SDK result message
 */
function extractTokenUsage(msg: ResultMessage): TokenUsage | null {
  if (!msg.usage) return null;
  return {
    input_tokens: msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
    cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
    cost_usd: 'total_cost_usd' in msg ? msg.total_cost_usd : undefined,
  };
}

/**
 * Get file paths for non-image attachments. If the file already has a
 * persisted filePath (written by the uploads route), reuse it. Otherwise
 * fall back to writing the file to .codepilot-uploads/.
 */
function getUploadedFilePaths(files: FileAttachment[], workDir: string): string[] {
  const paths: string[] = [];
  let uploadDir: string | undefined;
  for (const file of files) {
    if (file.filePath) {
      paths.push(file.filePath);
    } else {
      // Fallback: write file to disk (should not happen in normal flow)
      if (!uploadDir) {
        uploadDir = path.join(workDir, '.codepilot-uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
      }
      const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(uploadDir, `${Date.now()}-${safeName}`);
      const buffer = Buffer.from(file.data, 'base64');
      fs.writeFileSync(filePath, buffer);
      paths.push(filePath);
    }
  }
  return paths;
}

/**
 * Build a context-enriched prompt by prepending conversation history.
 * Used when SDK session resume is unavailable or fails.
 */
function buildPromptWithHistory(
  prompt: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  if (!history || history.length === 0) return prompt;

  const lines: string[] = [
    '<conversation_history>',
    '(This is a summary of earlier conversation turns for context. Tool calls shown here were already executed — do not repeat them or output their markers as text.)',
  ];
  for (const msg of history) {
    // For assistant messages with tool blocks (JSON arrays), extract only the text portions.
    // Tool-use and tool-result blocks are omitted to avoid the model parroting them as plain text.
    let content = msg.content;
    if (msg.role === 'assistant' && content.startsWith('[')) {
      try {
        const blocks = JSON.parse(content);
        const parts: string[] = [];
        for (const b of blocks) {
          if (b.type === 'text' && b.text) parts.push(b.text);
          // Skip tool_use and tool_result — they were already executed
        }
        content = parts.length > 0 ? parts.join('\n') : '(assistant used tools)';
      } catch {
        // Not JSON, use as-is
      }
    }
    lines.push(`${msg.role === 'user' ? 'Human' : 'Assistant'}: ${content}`);
  }
  lines.push('</conversation_history>');
  lines.push('');
  lines.push(prompt);
  return lines.join('\n');
}

/**
 * Stream CodeBuddy responses using the @tencent-ai/agent-sdk.
 * Returns a ReadableStream of SSE-formatted strings.
 *
 * This mirrors streamClaude() but targets the CodeBuddy SDK with its own
 * binary, env vars, session isolation, and message types.
 */
export function streamCodeBuddy(options: ClaudeStreamOptions): ReadableStream<string> {
  const {
    prompt,
    sessionId,
    sdkSessionId,
    model,
    systemPrompt,
    workingDirectory,
    mcpServers,
    abortController,
    permissionMode,
    files,
    toolTimeoutSeconds = 0,
    conversationHistory,
    onRuntimeStatusChange,
    imageAgentMode,
    bypassPermissions: sessionBypassPermissions,
    thinking,
    effort,
    outputFormat,
    agents,
    agent,
    enableFileCheckpointing,
    autoTrigger,
    generativeUI,
  } = options;

  return new ReadableStream<string>({
    async start(controller) {
      // Resolve provider via the unified resolver (same chain as Claude).
      const resolved = resolveForClaudeCode(options.provider, {
        providerId: options.providerId,
        sessionProviderId: options.sessionProviderId,
      });

      try {
        // Build env for the CodeBuddy SDK subprocess.
        // Start with process.env (includes user shell env from Electron's loadUserShellEnv).
        const sdkEnv: Record<string, string> = { ...process.env as Record<string, string> };

        // Ensure HOME/USERPROFILE are set so CodeBuddy can find config dirs
        if (!sdkEnv.HOME) sdkEnv.HOME = os.homedir();
        if (!sdkEnv.USERPROFILE) sdkEnv.USERPROFILE = os.homedir();
        // Ensure SDK subprocess has expanded PATH
        sdkEnv.PATH = getExpandedPath();

        // Remove CLAUDECODE env var to prevent "nested session" detection.
        // When CodePilot is launched from within a CLI session, the child
        // process inherits this variable and the SDK refuses to start.
        delete sdkEnv.CLAUDECODE;

        // On Windows, auto-detect Git Bash if not already configured.
        // CodeBuddy uses CODEBUDDY_CODE_GIT_BASH_PATH (mirrors Claude's pattern).
        if (process.platform === 'win32' && !process.env.CODEBUDDY_CODE_GIT_BASH_PATH) {
          const gitBashPath = findGitBash();
          if (gitBashPath) {
            sdkEnv.CODEBUDDY_CODE_GIT_BASH_PATH = gitBashPath;
          }
        }

        // Build env from resolved provider (toCodeBuddyEnv removes
        // ANTHROPIC_* vars and maps role models to CODEBUDDY_* env vars)
        const resolvedEnv = toCodeBuddyEnv(sdkEnv, resolved);
        Object.assign(sdkEnv, resolvedEnv);

        // Check if dangerously_skip_permissions is enabled globally or per-session
        const globalSkip = getSetting('dangerously_skip_permissions') === 'true';
        const skipPermissions = globalSkip || !!sessionBypassPermissions;

        const queryOptions: Options = {
          cwd: workingDirectory || os.homedir(),
          abortController,
          includePartialMessages: true,
          permissionMode: skipPermissions
            ? 'bypassPermissions'
            : ((permissionMode as Options['permissionMode']) || 'acceptEdits'),
          env: sanitizeEnv(sdkEnv),
          settingSources: resolved.settingSources as Options['settingSources'],
        };

        // Note: CodeBuddy SDK does NOT have allowDangerouslySkipPermissions

        // Find CodeBuddy binary for packaged app where PATH is limited.
        // On Windows, npm installs CLI as a .cmd wrapper — parse it to
        // extract the real .js script path (same pattern as claude-client.ts).
        const codebuddyPath = findCodeBuddyPath();
        if (codebuddyPath) {
          const ext = path.extname(codebuddyPath).toLowerCase();
          if (ext === '.cmd' || ext === '.bat') {
            const scriptPath = resolveScriptFromCmd(codebuddyPath);
            if (scriptPath) {
              queryOptions.pathToCodebuddyCode = scriptPath;
            } else {
              console.warn('[codebuddy-client] Could not resolve .js path from .cmd wrapper, falling back to SDK resolution:', codebuddyPath);
            }
          } else {
            queryOptions.pathToCodebuddyCode = codebuddyPath;
          }
        }

        if (model) {
          queryOptions.model = model;
        }

        if (systemPrompt) {
          // CodeBuddy uses { append: string } or a plain string for system prompt
          queryOptions.systemPrompt = { append: systemPrompt };
        }

        // MCP servers: only pass explicitly provided config (e.g. from CodePilot UI).
        // User-level MCP config is loaded by the SDK via settingSources.
        if (mcpServers && Object.keys(mcpServers).length > 0) {
          queryOptions.mcpServers = toSdkMcpConfig(mcpServers);
        }

        // Widget guidelines: progressive loading strategy (same as Claude).
        if (generativeUI !== false) {
          const needsWidgetSpecs = (() => {
            const widgetKeywords = /可视化|图表|流程图|时间线|架构图|对比|visualiz|diagram|chart|flowchart|timeline|infographic|interactive|widget|show-widget|hierarchy|dashboard/i;
            if (widgetKeywords.test(prompt)) return true;
            if (conversationHistory?.some(m => m.content.includes('show-widget'))) return true;
            if (systemPrompt && widgetKeywords.test(systemPrompt)) return true;
            return false;
          })();

          if (needsWidgetSpecs) {
            const { createWidgetMcpServer } = await import('@/lib/widget-guidelines');
            const widgetServer = createWidgetMcpServer();
            const existingMcp = (typeof queryOptions.mcpServers === 'object' && queryOptions.mcpServers !== null)
              ? queryOptions.mcpServers as Record<string, McpServerConfig>
              : {};
            queryOptions.mcpServers = {
              ...existingMcp,
              'codepilot-widget': widgetServer,
            };
          }
        }

        // Pass through SDK-specific options
        if (thinking) {
          queryOptions.thinking = thinking;
        }
        if (effort) {
          // CodeBuddy uses 'xhigh' instead of Claude's 'max'
          queryOptions.effort = effort === 'max' ? 'xhigh' : effort as Options['effort'];
        }
        if (outputFormat) {
          queryOptions.outputFormat = outputFormat;
        }
        if (agents) {
          queryOptions.agents = agents as Options['agents'];
        }
        if (agent) {
          // CodeBuddy Options doesn't have a top-level 'agent' field;
          // agent selection is typically done via the agents map + prompt
        }
        if (enableFileCheckpointing) {
          queryOptions.enableFileCheckpointing = true;
        }

        // Session resume: extract the CodeBuddy-specific session ID from the
        // shared sdk_session_id JSON blob.
        const cbSessionId = getRuntimeSessionId(sdkSessionId, 'codebuddy');

        // Pre-check: verify working_directory exists before attempting resume.
        let shouldResume = !!cbSessionId;
        if (shouldResume && workingDirectory && !fs.existsSync(workingDirectory)) {
          console.warn(`[codebuddy-client] Working directory "${workingDirectory}" does not exist, skipping resume`);
          shouldResume = false;
          if (sessionId) {
            try {
              const clearedRaw = setRuntimeSessionId(sdkSessionId, 'codebuddy', '');
              updateSdkSessionId(sessionId, clearedRaw);
            } catch { /* best effort */ }
          }
          controller.enqueue(formatSSE({
            type: 'status',
            data: JSON.stringify({
              _internal: true,
              resumeFallback: true,
              title: 'Session fallback',
              message: 'Original working directory no longer exists. Starting fresh conversation.',
            }),
          }));
        }
        if (shouldResume) {
          queryOptions.resume = cbSessionId;
        }

        // Permission handler: sends SSE event and waits for user response
        queryOptions.canUseTool = async (toolName, input, opts) => {
          const permissionRequestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const permEvent: PermissionRequestEvent = {
            permissionRequestId,
            toolName,
            toolInput: input,
            suggestions: opts.suggestions as PermissionRequestEvent['suggestions'],
            decisionReason: opts.decisionReason,
            blockedPath: opts.blockedPath,
            toolUseId: opts.toolUseID,
            description: undefined,
          };

          // Persist permission request to DB for audit/recovery
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
          try {
            createPermissionRequest({
              id: permissionRequestId,
              sessionId,
              sdkSessionId: cbSessionId || '',
              toolName,
              toolInput: JSON.stringify(input),
              decisionReason: opts.decisionReason || '',
              expiresAt,
            });
          } catch (e) {
            console.warn('[codebuddy-client] Failed to persist permission request to DB:', e);
          }

          // Send permission_request SSE event to the client
          controller.enqueue(formatSSE({
            type: 'permission_request',
            data: JSON.stringify(permEvent),
          }));

          // Notify via Telegram (fire-and-forget)
          notifyPermissionRequest(toolName, input as Record<string, unknown>, telegramOpts).catch(() => {});

          // Notify runtime status change
          onRuntimeStatusChange?.('waiting_permission');

          // Wait for user response (resolved by POST /api/chat/permission)
          const result = await registerPendingPermission(permissionRequestId, input, opts.signal);

          // Restore runtime status after permission resolved
          onRuntimeStatusChange?.('running');

          return result;
        };

        // Telegram notification context for hooks
        const telegramOpts = {
          sessionId,
          sessionTitle: undefined as string | undefined,
          workingDirectory,
        };

        // Capture real-time stderr output from CodeBuddy process
        queryOptions.stderr = (data: string) => {
          console.log(`[codebuddy-stderr] received ${data.length} bytes, first 200 chars:`, data.slice(0, 200).replace(/[\x00-\x1F\x7F]/g, '?'));
          // Strip ANSI escape codes, OSC sequences, and control characters
          // but preserve tabs (\x09) and carriage returns (\x0D)
          const cleaned = data
            .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')       // CSI sequences (colors, cursor)
            .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '') // OSC sequences
            .replace(/\x1B\([A-Z]/g, '')                   // Character set selection
            .replace(/\x1B[=>]/g, '')                       // Keypad mode
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Control chars (keep \t \n \r)
            .replace(/\r\n/g, '\n')                        // Normalize CRLF
            .replace(/\r/g, '\n')                          // Convert remaining CR to LF
            .replace(/\n{3,}/g, '\n\n')                    // Collapse multiple blank lines
            .trim();
          if (cleaned) {
            controller.enqueue(formatSSE({
              type: 'tool_output',
              data: cleaned,
            }));
          }
        };

        // Build the prompt with file attachments and optional conversation history.
        // When resuming, the SDK has full context so we send the raw prompt.
        // When NOT resuming (fresh or fallback), prepend DB history for context.
        function buildFinalPrompt(useHistory: boolean): string | AsyncIterable<UserMessage> {
          const basePrompt = useHistory
            ? buildPromptWithHistory(prompt, conversationHistory)
            : prompt;

          if (!files || files.length === 0) return basePrompt;

          const imageFiles = files.filter(f => isImageFile(f.type));
          const nonImageFiles = files.filter(f => !isImageFile(f.type));

          let textPrompt = basePrompt;
          if (nonImageFiles.length > 0) {
            const workDir = workingDirectory || os.homedir();
            const savedPaths = getUploadedFilePaths(nonImageFiles, workDir);
            const fileReferences = savedPaths
              .map((p, i) => `[User attached file: ${p} (${nonImageFiles[i].name})]`)
              .join('\n');
            textPrompt = `${fileReferences}\n\nPlease read the attached file(s) above using your Read tool, then respond to the user's message:\n\n${basePrompt}`;
          }

          if (imageFiles.length > 0) {
            // In imageAgentMode, skip file path references so the model doesn't
            // try to use built-in tools to analyze images from disk.
            const textWithImageRefs = imageAgentMode
              ? textPrompt
              : (() => {
                  const workDir = workingDirectory || os.homedir();
                  const imagePaths = getUploadedFilePaths(imageFiles, workDir);
                  const imageReferences = imagePaths
                    .map((p, i) => `[User attached image: ${p} (${imageFiles[i].name})]`)
                    .join('\n');
                  return `${imageReferences}\n\n${textPrompt}`;
                })();

            const contentBlocks: Array<
              | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } }
              | { type: 'text'; text: string }
            > = [];

            for (const img of imageFiles) {
              contentBlocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: (img.type || 'image/png') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: img.data,
                },
              });
            }

            contentBlocks.push({ type: 'text', text: textWithImageRefs });

            const userMessage: UserMessage = {
              type: 'user',
              message: {
                role: 'user',
                content: contentBlocks,
              },
              parent_tool_use_id: null,
              session_id: cbSessionId || '',
            };

            return (async function* () {
              yield userMessage;
            })();
          }

          return textPrompt;
        }

        const finalPrompt = buildFinalPrompt(!shouldResume);

        // Try to start the conversation. If resuming a previous session fails,
        // automatically fall back to starting a fresh conversation without resume.
        let conversation: Query = query({
          prompt: finalPrompt,
          options: queryOptions,
        });

        // Wrap the iterator so we can detect resume failures on the first message
        if (shouldResume) {
          try {
            // Peek at the first message to verify resume works
            const iter = conversation[Symbol.asyncIterator]();
            const first = await iter.next();

            // Re-wrap into an async iterable that yields the first message then the rest
            const originalConversation = conversation;
            conversation = Object.assign(
              (async function* () {
                if (!first.done) yield first.value;
                while (true) {
                  const next = await iter.next();
                  if (next.done) break;
                  yield next.value;
                }
              })(),
              {
                interrupt: originalConversation.interrupt.bind(originalConversation),
                setPermissionMode: originalConversation.setPermissionMode.bind(originalConversation),
                setModel: originalConversation.setModel.bind(originalConversation),
                setMaxThinkingTokens: originalConversation.setMaxThinkingTokens.bind(originalConversation),
                supportedCommands: originalConversation.supportedCommands.bind(originalConversation),
                supportedModels: originalConversation.supportedModels.bind(originalConversation),
                mcpServerStatus: originalConversation.mcpServerStatus.bind(originalConversation),
                accountInfo: originalConversation.accountInfo.bind(originalConversation),
                streamInput: originalConversation.streamInput.bind(originalConversation),
                return: originalConversation.return.bind(originalConversation),
                throw: originalConversation.throw.bind(originalConversation),
              },
            ) as unknown as Query;
          } catch (resumeError) {
            const errMsg = resumeError instanceof Error ? resumeError.message : String(resumeError);
            console.warn('[codebuddy-client] Resume failed, retrying without resume:', errMsg);
            // Clear stale session ID so future messages don't retry this broken resume
            if (sessionId) {
              try {
                const clearedRaw = setRuntimeSessionId(sdkSessionId, 'codebuddy', '');
                updateSdkSessionId(sessionId, clearedRaw);
              } catch { /* best effort */ }
            }
            // Notify frontend about the fallback
            controller.enqueue(formatSSE({
              type: 'status',
              data: JSON.stringify({
                _internal: true,
                resumeFallback: true,
                title: 'Session fallback',
                message: 'Previous session could not be resumed. Starting fresh conversation.',
              }),
            }));
            // Remove resume and try again as a fresh conversation with history context
            delete queryOptions.resume;
            conversation = query({
              prompt: buildFinalPrompt(true),
              options: queryOptions,
            });
          }
        }

        // Fire-and-forget: capture SDK capabilities (models, commands, etc.)
        // Scoped to 'codebuddy' provider ID so it doesn't collide with Claude's cache.
        captureCapabilities(sessionId, conversation, 'codebuddy').catch((err) => {
          console.warn('[codebuddy-client] Capability capture failed:', err);
        });

        registerConversation(sessionId, conversation);

        let tokenUsage: TokenUsage | null = null;
        // Track pending TodoWrite tool_use_ids so we can sync after successful execution
        const pendingTodoWrites = new Map<string, Array<{ content: string; status: string; activeForm?: string }>>();

        for await (const message of conversation) {
          if (abortController?.signal.aborted) {
            break;
          }

          switch (message.type) {
            case 'assistant': {
              const assistantMsg = message as AssistantMessage;
              // Text deltas are handled by stream_event for real-time streaming.
              // Here we only process tool_use blocks.

              for (const block of assistantMsg.message.content) {
                if (block.type === 'tool_use') {
                  controller.enqueue(formatSSE({
                    type: 'tool_use',
                    data: JSON.stringify({
                      id: block.id,
                      name: block.name,
                      input: block.input,
                    }),
                  }));

                  // Track TodoWrite calls — sync deferred until tool_result confirms success
                  if (block.name === 'TodoWrite') {
                    try {
                      const toolInput = block.input as {
                        todos?: Array<{ content: string; status: string; activeForm?: string }>;
                      };
                      if (toolInput?.todos && Array.isArray(toolInput.todos)) {
                        pendingTodoWrites.set(block.id, toolInput.todos);
                      }
                    } catch (e) {
                      console.warn('[codebuddy-client] Failed to parse TodoWrite input:', e);
                    }
                  }
                }
              }
              break;
            }

            case 'user': {
              // Tool execution results come back as user messages with tool_result blocks
              const userMsg = message as UserMessage;
              const content = userMsg.message.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'tool_result') {
                    const resultContent = typeof block.content === 'string'
                      ? block.content
                      : Array.isArray(block.content)
                        ? (block.content as Array<{ type: string; text?: string }>)
                            .filter((c) => c.type === 'text')
                            .map((c) => c.text)
                            .join('\n')
                        : String(block.content ?? '');
                    controller.enqueue(formatSSE({
                      type: 'tool_result',
                      data: JSON.stringify({
                        tool_use_id: block.tool_use_id,
                        content: resultContent,
                        is_error: block.is_error || false,
                      }),
                    }));

                    // Deferred TodoWrite sync: only emit task_update after successful execution
                    if (!block.is_error && pendingTodoWrites.has(block.tool_use_id)) {
                      const todos = pendingTodoWrites.get(block.tool_use_id)!;
                      pendingTodoWrites.delete(block.tool_use_id);
                      controller.enqueue(formatSSE({
                        type: 'task_update',
                        data: JSON.stringify({
                          session_id: sessionId,
                          todos: todos.map((t, i) => ({
                            id: String(i),
                            content: t.content,
                            status: t.status,
                            activeForm: t.activeForm || '',
                          })),
                        }),
                      }));
                    }
                  }
                }
              }

              // Emit rewind_point for file checkpointing — only for prompt-level
              // user messages (parent_tool_use_id === null), and skip auto-trigger
              // turns which are invisible to the user.
              if (
                userMsg.parent_tool_use_id === null &&
                !autoTrigger &&
                userMsg.uuid
              ) {
                controller.enqueue(formatSSE({
                  type: 'rewind_point',
                  data: JSON.stringify({ userMessageId: userMsg.uuid }),
                }));
              }
              break;
            }

            case 'stream_event': {
              const streamEvent = message as PartialAssistantMessage;
              const evt = streamEvent.event;
              if (evt.type === 'content_block_delta' && 'delta' in evt) {
                const delta = evt.delta;
                if ('text' in delta && delta.text) {
                  controller.enqueue(formatSSE({ type: 'text', data: delta.text }));
                }
              }
              break;
            }

            case 'system': {
              // CodeBuddy SystemMessage has same shape as Claude's SDKSystemMessage.
              // The union includes CompactBoundaryMessage and StatusMessage which lack
              // model/tools, so cast through unknown.
              const sysMsg = message as unknown as { type: 'system'; subtype: string; session_id: string; model: string; tools: string[]; [key: string]: unknown };
              if ('subtype' in sysMsg) {
                if (sysMsg.subtype === 'init') {
                  controller.enqueue(formatSSE({
                    type: 'status',
                    data: JSON.stringify({
                      session_id: sysMsg.session_id,
                      model: sysMsg.model,
                      requested_model: model,
                      tools: sysMsg.tools,
                      slash_commands: sysMsg.slash_commands,
                      skills: sysMsg.skills,
                      plugins: sysMsg.plugins,
                      mcp_servers: sysMsg.mcp_servers,
                      output_style: sysMsg.output_style,
                    }),
                  }));

                  // Persist the CodeBuddy session ID into the shared JSON blob
                  if (sysMsg.session_id && sessionId) {
                    try {
                      const newRaw = setRuntimeSessionId(sdkSessionId, 'codebuddy', sysMsg.session_id);
                      updateSdkSessionId(sessionId, newRaw);
                    } catch {
                      // best effort
                    }
                  }

                  // Cache loaded plugins from init (same as Claude)
                  setCachedPlugins('codebuddy', Array.isArray(sysMsg.plugins) ? sysMsg.plugins as Array<{ name: string; path: string }> : []);
                } else if (sysMsg.subtype === 'status') {
                  const statusMsg = sysMsg as typeof sysMsg & { permissionMode?: string };
                  if (statusMsg.permissionMode) {
                    controller.enqueue(formatSSE({
                      type: 'mode_changed',
                      data: statusMsg.permissionMode,
                    }));
                  }
                } else if (sysMsg.subtype === 'task_notification') {
                  const taskMsg = sysMsg as typeof sysMsg & {
                    status: string; summary: string; task_id: string;
                  };
                  const title = taskMsg.status === 'completed' ? 'Task completed' : `Task ${taskMsg.status}`;
                  controller.enqueue(formatSSE({
                    type: 'status',
                    data: JSON.stringify({
                      notification: true,
                      title,
                      message: taskMsg.summary || '',
                    }),
                  }));
                  notifyGeneric(title, taskMsg.summary || '', telegramOpts).catch(() => {});
                }
              }
              break;
            }

            case 'tool_progress': {
              const progressMsg = message as ToolProgressMessage;
              controller.enqueue(formatSSE({
                type: 'tool_output',
                data: JSON.stringify({
                  _progress: true,
                  tool_use_id: progressMsg.tool_use_id,
                  tool_name: progressMsg.tool_name,
                  elapsed_time_seconds: progressMsg.elapsed_time_seconds,
                }),
              }));
              // Auto-timeout: abort if tool runs longer than configured threshold
              if (toolTimeoutSeconds > 0 && progressMsg.elapsed_time_seconds >= toolTimeoutSeconds) {
                controller.enqueue(formatSSE({
                  type: 'tool_timeout',
                  data: JSON.stringify({
                    tool_name: progressMsg.tool_name,
                    elapsed_seconds: Math.round(progressMsg.elapsed_time_seconds),
                  }),
                }));
                abortController?.abort();
              }
              break;
            }

            case 'result': {
              const resultMsg = message as ResultMessage;
              tokenUsage = extractTokenUsage(resultMsg);

              // Persist the session ID from the result for future resume
              if (resultMsg.session_id && sessionId) {
                try {
                  const newRaw = setRuntimeSessionId(sdkSessionId, 'codebuddy', resultMsg.session_id);
                  updateSdkSessionId(sessionId, newRaw);
                } catch {
                  // best effort
                }
              }

              controller.enqueue(formatSSE({
                type: 'result',
                data: JSON.stringify({
                  subtype: resultMsg.subtype,
                  is_error: resultMsg.is_error,
                  num_turns: resultMsg.num_turns,
                  duration_ms: resultMsg.duration_ms,
                  usage: tokenUsage,
                  session_id: resultMsg.session_id,
                }),
              }));
              // Notify on conversation-level errors
              if (resultMsg.is_error) {
                const errTitle = 'Conversation error';
                const errMsg = resultMsg.subtype || 'The conversation ended with an error';
                controller.enqueue(formatSSE({
                  type: 'status',
                  data: JSON.stringify({ notification: true, title: errTitle, message: errMsg }),
                }));
                notifyGeneric(errTitle, errMsg, telegramOpts).catch(() => {});
              }
              break;
            }

            case 'error': {
              // CodeBuddy-specific ErrorMessage type
              const errorMsg = message as ErrorMessage;
              console.error('[codebuddy-client] SDK error message:', errorMsg.error);
              controller.enqueue(formatSSE({
                type: 'error',
                data: JSON.stringify({
                  category: 'PROCESS_CRASH',
                  userMessage: errorMsg.error || 'An error occurred in CodeBuddy SDK',
                  actionHint: 'Try sending your message again.',
                  retryable: true,
                  providerName: 'CodeBuddy SDK',
                  rawMessage: errorMsg.error,
                  _formattedMessage: errorMsg.error,
                }),
              }));
              break;
            }

            default: {
              if ((message as { type: string }).type === 'keep_alive') {
                controller.enqueue(formatSSE({ type: 'keep_alive', data: '' }));
              }
              break;
            }
          }
        }

        controller.enqueue(formatSSE({ type: 'done', data: '' }));
        controller.close();
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Unknown error';
        const stderrContent = error instanceof Error ? (error as { stderr?: string }).stderr : undefined;
        console.error('[codebuddy-client] Stream error:', {
          message: rawMessage,
          stack: error instanceof Error ? error.stack : undefined,
          cause: error instanceof Error ? (error as { cause?: unknown }).cause : undefined,
          stderr: stderrContent,
          code: error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined,
        });

        // Classify the error using structured pattern matching
        const classified = classifyError({
          error,
          stderr: stderrContent,
          providerName: 'CodeBuddy SDK',
          baseUrl: resolved.provider?.base_url,
          hasImages: files && files.some(f => isImageFile(f.type)),
          thinkingEnabled: !!thinking,
          context1mEnabled: false,
          effortSet: !!effort,
        });

        const errorMessage = formatClassifiedError(classified);
        controller.enqueue(formatSSE({
          type: 'error',
          data: JSON.stringify({
            category: classified.category,
            userMessage: classified.userMessage,
            actionHint: classified.actionHint,
            retryable: classified.retryable,
            providerName: classified.providerName,
            details: classified.details,
            rawMessage: classified.rawMessage,
            _formattedMessage: errorMessage,
          }),
        }));
        controller.enqueue(formatSSE({ type: 'done', data: '' }));

        // Always clear sdk_session_id on crash so the next message starts fresh.
        if (sessionId) {
          try {
            const clearedRaw = setRuntimeSessionId(sdkSessionId, 'codebuddy', '');
            updateSdkSessionId(sessionId, clearedRaw);
            console.warn('[codebuddy-client] Cleared stale sdk_session_id for session', sessionId);
          } catch {
            // best effort
          }
        }

        controller.close();
      } finally {
        unregisterConversation(sessionId);
      }
    },

    cancel() {
      abortController?.abort();
    },
  });
}
