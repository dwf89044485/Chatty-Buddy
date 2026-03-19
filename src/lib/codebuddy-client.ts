import { spawn } from 'child_process';
import type { ChildProcessByStdio } from 'child_process';
import type { Readable } from 'stream';
import path from 'path';
import { getSetting, updateSdkSessionId } from './db';
import { getRuntimeSessionId, setRuntimeSessionId } from './cli-runtime';
import { classifyError, formatClassifiedError } from './error-classifier';
import { findCodeBuddyBinary, getExpandedPath } from './platform';
import { resolveForClaudeCode, toCodeBuddyEnv } from './provider-resolver';
import type {
  ClaudeStreamOptions,
  FileAttachment,
  SSEEvent,
  TokenUsage,
} from '@/types';

interface CodeBuddyEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  is_error?: boolean;
  result?: string;
  errors?: string[];
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  num_turns?: number;
  duration_ms?: number;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }>;
  };
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function sanitizeEnvValue(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      clean[key] = sanitizeEnvValue(value);
    }
  }
  return clean;
}

function normalizeToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item) {
          return typeof item.text === 'string' ? item.text : JSON.stringify(item.text ?? '');
        }
        return JSON.stringify(item);
      })
      .join('\n');
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

function mapPermissionMode(permissionMode?: string, bypassPermissions?: boolean): 'default' | 'acceptEdits' | 'plan' {
  if (bypassPermissions) return 'acceptEdits';
  if (permissionMode === 'acceptEdits' || permissionMode === 'plan') return permissionMode;
  return 'default';
}

function shouldRetryFreshSession(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes('resume') && lower.includes('session')) ||
    lower.includes('different model') ||
    lower.includes('no such session')
  );
}

function buildPrompt(prompt: string, files?: FileAttachment[]): string {
  if (!files || files.length === 0) return prompt;

  const nonImageFiles = files.filter((file) => !IMAGE_MIME_TYPES.has(file.type));
  if (nonImageFiles.length === 0) return prompt;

  const refs = nonImageFiles
    .map((file) => {
      const refPath = file.filePath || file.name;
      return `[User attached file: ${refPath} (${path.basename(file.name)})]`;
    })
    .join('\n');

  return `${refs}\n\nPlease read the attached file(s) above using your available tools, then respond to the user's message:\n\n${prompt}`;
}

function buildArgs(options: ClaudeStreamOptions): string[] {
  const globalSkip = getSetting('dangerously_skip_permissions') === 'true';
  const bypassPermissions = globalSkip || !!options.bypassPermissions;
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--permission-mode',
    mapPermissionMode(options.permissionMode, bypassPermissions),
  ];

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.sdkSessionId) {
    args.push('--resume', options.sdkSessionId);
  }

  const systemPrompt = options.systemPrompt?.trim();
  if (systemPrompt) {
    args.push('--append-system-prompt', systemPrompt);
  }

  args.push(buildPrompt(options.prompt, options.files));
  return args;
}

function extractUsage(event: CodeBuddyEvent): TokenUsage {
  return {
    input_tokens: event.usage?.input_tokens ?? 0,
    output_tokens: event.usage?.output_tokens ?? 0,
    cache_read_input_tokens: event.usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: event.usage?.cache_creation_input_tokens ?? 0,
  };
}

export function streamCodeBuddy(options: ClaudeStreamOptions): ReadableStream<string> {
  const {
    sessionId,
    workingDirectory,
    abortController,
    onRuntimeStatusChange,
    files,
    thinking,
    context1m,
    effort,
  } = options;

  return new ReadableStream<string>({
    start(controller) {
      const resolved = resolveForClaudeCode(options.provider, {
        providerId: options.providerId,
        sessionProviderId: options.sessionProviderId,
        model: options.model,
      });
      const codebuddyPath = findCodeBuddyBinary();
      if (!codebuddyPath) {
        controller.enqueue(formatSSE({
          type: 'error',
          data: JSON.stringify({
            category: 'cli_not_found',
            userMessage: 'CodeBuddy CLI 未检测到。',
            actionHint: '请先安装并登录 CodeBuddy CLI，或切回 Claude Code。',
            retryable: false,
            providerName: 'CodeBuddy CLI',
            rawMessage: 'CodeBuddy CLI not found',
            _formattedMessage: 'CodeBuddy CLI 未检测到，请先安装并登录，或切回 Claude Code。',
          }),
        }));
        controller.enqueue(formatSSE({ type: 'done', data: '' }));
        controller.close();
        return;
      }

      const sdkEnv: Record<string, string> = {
        ...process.env as Record<string, string>,
        PATH: getExpandedPath(),
      };
      delete sdkEnv.CLAUDECODE;
      const env = sanitizeEnv(toCodeBuddyEnv(sdkEnv, resolved));
      const runtimeSessionId = getRuntimeSessionId(options.sdkSessionId, 'codebuddy');

      let child: ChildProcessByStdio<null, Readable, Readable> | null = null;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let closed = false;
      let hasResult = false;
      let retriedFresh = false;
      const pendingTodoWrites = new Map<string, Array<{ content: string; status: string; activeForm?: string }>>();

      const closeController = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      const emitDone = () => {
        controller.enqueue(formatSSE({ type: 'done', data: '' }));
      };

      const emitClassifiedError = (error: Error | string) => {
        const rawMessage = typeof error === 'string' ? error : error.message;
        const classified = classifyError({
          error: typeof error === 'string' ? new Error(error) : error,
          stderr: stderrBuffer,
          providerName: 'CodeBuddy CLI',
          hasImages: files && files.some(f => IMAGE_MIME_TYPES.has(f.type)),
          thinkingEnabled: !!thinking,
          context1mEnabled: !!context1m,
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
            rawMessage: classified.rawMessage || rawMessage,
            _formattedMessage: errorMessage,
          }),
        }));
      };

      const handleEvent = (event: CodeBuddyEvent) => {
        switch (event.type) {
          case 'system': {
            if (event.subtype === 'init') {
              if (event.session_id) {
                try { updateSdkSessionId(sessionId, setRuntimeSessionId(options.sdkSessionId, 'codebuddy', event.session_id)); } catch { /* best effort */ }
              }
              controller.enqueue(formatSSE({
                type: 'status',
                data: JSON.stringify({
                  session_id: event.session_id,
                  model: event.model,
                  requested_model: options.model,
                  runtime: 'codebuddy',
                }),
              }));
            }
            break;
          }

          case 'assistant': {
            for (const block of event.message?.content ?? []) {
              if (block.type === 'text' && block.text) {
                controller.enqueue(formatSSE({ type: 'text', data: block.text }));
              }

              if (block.type === 'tool_use' && block.id && block.name) {
                controller.enqueue(formatSSE({
                  type: 'tool_use',
                  data: JSON.stringify({
                    id: block.id,
                    name: block.name,
                    input: block.input ?? {},
                  }),
                }));

                if (block.name === 'TodoWrite') {
                  try {
                    const toolInput = block.input as {
                      todos?: Array<{ content: string; status: string; activeForm?: string }>;
                    };
                    if (toolInput?.todos && Array.isArray(toolInput.todos)) {
                      pendingTodoWrites.set(block.id, toolInput.todos);
                    }
                  } catch {
                    // ignore
                  }
                }
              }
            }
            break;
          }

          case 'user': {
            for (const block of event.message?.content ?? []) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                controller.enqueue(formatSSE({
                  type: 'tool_result',
                  data: JSON.stringify({
                    tool_use_id: block.tool_use_id,
                    content: normalizeToolResultContent(block.content),
                    is_error: block.is_error || false,
                  }),
                }));

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
            break;
          }

          case 'result': {
            hasResult = true;
            if (event.session_id) {
              try { updateSdkSessionId(sessionId, setRuntimeSessionId(options.sdkSessionId, 'codebuddy', event.session_id)); } catch { /* best effort */ }
            }
            controller.enqueue(formatSSE({
              type: 'result',
              data: JSON.stringify({
                subtype: event.subtype,
                is_error: event.is_error || false,
                num_turns: event.num_turns,
                duration_ms: event.duration_ms,
                usage: extractUsage(event),
                session_id: event.session_id,
              }),
            }));
            if (event.is_error) {
              emitClassifiedError(event.result || event.errors?.join('; ') || 'CodeBuddy returned an error result');
            }
            break;
          }

          case 'error': {
            emitClassifiedError(event.result || event.errors?.join('; ') || 'CodeBuddy returned an error event');
            break;
          }

          default:
            break;
        }
      };

      const run = (freshSession = false) => {
        stdoutBuffer = '';
        stderrBuffer = '';
        hasResult = false;
        onRuntimeStatusChange?.('running');

        const cliOptions: ClaudeStreamOptions = freshSession
          ? { ...options, sdkSessionId: undefined }
          : { ...options, sdkSessionId: runtimeSessionId };

        child = spawn(codebuddyPath, buildArgs(cliOptions), {
          cwd: workingDirectory,
          env: env as NodeJS.ProcessEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        if (abortController) {
          abortController.signal.addEventListener('abort', () => {
            if (child && !child.killed) {
              child.kill('SIGTERM');
            }
          }, { once: true });
        }

        if (!child) throw new Error('CodeBuddy process failed to start');

        child.stdout.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString('utf-8');
          while (true) {
            const newlineIndex = stdoutBuffer.indexOf('\n');
            if (newlineIndex === -1) break;
            const line = stdoutBuffer.slice(0, newlineIndex).trim();
            stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
            if (!line) continue;
            try {
              handleEvent(JSON.parse(line) as CodeBuddyEvent);
            } catch (error) {
              console.warn('[codebuddy-client] Failed to parse NDJSON line:', line, error);
            }
          }
        });

        child.stderr.on('data', (chunk: Buffer) => {
          const cleaned = chunk
            .toString('utf-8')
            .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .trim();
          if (!cleaned) return;
          stderrBuffer += `${cleaned}\n`;
          if (stderrBuffer.length > 4096) {
            stderrBuffer = stderrBuffer.slice(-4096);
          }
          controller.enqueue(formatSSE({
            type: 'tool_output',
            data: cleaned,
          }));
        });

        child.on('error', (error) => {
          emitClassifiedError(error);
          emitDone();
          closeController();
        });

        child.on('close', (code, signal) => {
          if (closed) return;

          const trailing = stdoutBuffer.trim();
          if (trailing) {
            try {
              handleEvent(JSON.parse(trailing) as CodeBuddyEvent);
            } catch {
              // ignore partial trailing json
            }
          }

          if (abortController?.signal.aborted) {
            emitDone();
            closeController();
            return;
          }

          if (hasResult) {
            emitDone();
            closeController();
            return;
          }

          const failureMessage = [
            code != null ? `CodeBuddy exited with code ${code}` : undefined,
            signal ? `signal: ${signal}` : undefined,
            stderrBuffer.trim() || undefined,
          ]
            .filter(Boolean)
            .join('\n');

          if (runtimeSessionId && !freshSession && !retriedFresh && shouldRetryFreshSession(failureMessage)) {
            retriedFresh = true;
            try { updateSdkSessionId(sessionId, setRuntimeSessionId(options.sdkSessionId, 'codebuddy', '')); } catch { /* best effort */ }
            controller.enqueue(formatSSE({
              type: 'status',
              data: JSON.stringify({
                _internal: true,
                resumeFallback: true,
                title: 'Session fallback',
                message: 'Previous session could not be resumed. Starting fresh conversation.',
              }),
            }));
            run(true);
            return;
          }

          emitClassifiedError(failureMessage || 'CodeBuddy exited before returning a result');
          emitDone();
          closeController();
        });
      };

      try {
        run(false);
      } catch (error) {
        emitClassifiedError(error instanceof Error ? error : String(error));
        emitDone();
        closeController();
      }
    },

    cancel() {
      abortController?.abort();
    },
  });
}