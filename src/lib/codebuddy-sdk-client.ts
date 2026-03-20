import { query } from '@tencent-ai/agent-sdk';
import fs from 'fs';
import { getSetting, updateSdkSessionId } from './db';
import { getRuntimeSessionId, setRuntimeSessionId } from './cli-runtime';
import { classifyError, formatClassifiedError } from './error-classifier';
import { findCodeBuddyBinary, getExpandedPath } from './platform';
import { resolveForClaudeCode, toCodeBuddyEnv } from './provider-resolver';
import type { ClaudeStreamOptions, SSEEvent, TokenUsage } from '@/types';

interface CodeBuddySdkMessage {
  type?: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  is_error?: boolean;
  error?: string;
  errors?: string[];
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
    content_block?: { type?: string; id?: string; name?: string; input?: unknown };
  };
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

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function sanitizeEnvValue(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') clean[key] = sanitizeEnvValue(value);
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

function extractUsage(msg: CodeBuddySdkMessage): TokenUsage {
  return {
    input_tokens: msg.usage?.input_tokens ?? 0,
    output_tokens: msg.usage?.output_tokens ?? 0,
    cache_read_input_tokens: msg.usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: msg.usage?.cache_creation_input_tokens ?? 0,
  };
}

export function streamCodeBuddySdk(options: ClaudeStreamOptions): ReadableStream<string> {
  const { sessionId, abortController, onRuntimeStatusChange, files, thinking, context1m, effort } = options;

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
            userMessage: 'CodeBuddy 运行环境未检测到。',
            actionHint: '请先安装并登录 CodeBuddy，再重试。',
            retryable: false,
            providerName: 'CodeBuddy SDK',
            rawMessage: 'CodeBuddy runtime not found for SDK mode',
            _formattedMessage: 'CodeBuddy SDK 需要本地 CodeBuddy 运行环境，请先安装并登录。',
          }),
        }));
        controller.enqueue(formatSSE({ type: 'done', data: '' }));
        controller.close();
        return;
      }

      let sdkExecutablePath = codebuddyPath;
      try {
        sdkExecutablePath = fs.realpathSync(codebuddyPath);
      } catch {
        // keep original path
      }

      const sdkEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        PATH: getExpandedPath(),
      };
      delete sdkEnv.CLAUDECODE;
      const env = sanitizeEnv(toCodeBuddyEnv(sdkEnv, resolved));
      const runtimeSessionId = getRuntimeSessionId(options.sdkSessionId, 'codebuddy');

      let closed = false;
      let hasResult = false;
      let stderrBuffer = '';

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
          providerName: 'CodeBuddy SDK',
          hasImages: files && files.some((f) => f.type.startsWith('image/')),
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

      (async () => {
        try {
          const globalSkip = getSetting('dangerously_skip_permissions') === 'true';
          const bypassPermissions = globalSkip || !!options.bypassPermissions;

          const prompt = options.prompt;
          const sdkQuery = query({
            prompt,
            options: {
              cwd: options.workingDirectory,
              model: options.model,
              resume: runtimeSessionId || undefined,
              abortController,
              permissionMode: mapPermissionMode(options.permissionMode, bypassPermissions),
              includePartialMessages: true,
              env,
              pathToCodebuddyCode: sdkExecutablePath,
              systemPrompt: options.systemPrompt?.trim()
                ? { append: options.systemPrompt.trim() }
                : undefined,
              stderr: (data: string) => {
                stderrBuffer += data;
                if (stderrBuffer.length > 8192) stderrBuffer = stderrBuffer.slice(-8192);
              },
            },
          } as never) as AsyncIterable<CodeBuddySdkMessage>;

          for await (const msg of sdkQuery) {
            switch (msg.type) {
              case 'stream_event': {
                const event = msg.event;
                if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
                  controller.enqueue(formatSSE({ type: 'text', data: event.delta.text }));
                }
                if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                  controller.enqueue(formatSSE({
                    type: 'tool_use',
                    data: JSON.stringify({
                      id: event.content_block.id,
                      name: event.content_block.name,
                      input: event.content_block.input ?? {},
                    }),
                  }));
                }
                break;
              }

              case 'assistant': {
                for (const block of msg.message?.content || []) {
                  if (block.type === 'text' && block.text) {
                    controller.enqueue(formatSSE({ type: 'text', data: block.text }));
                  }
                  if (block.type === 'tool_use') {
                    controller.enqueue(formatSSE({
                      type: 'tool_use',
                      data: JSON.stringify({ id: block.id, name: block.name, input: block.input ?? {} }),
                    }));
                  }
                }
                break;
              }

              case 'user': {
                for (const block of msg.message?.content || []) {
                  if (block.type === 'tool_result') {
                    controller.enqueue(formatSSE({
                      type: 'tool_result',
                      data: JSON.stringify({
                        tool_use_id: block.tool_use_id,
                        content: normalizeToolResultContent(block.content),
                        is_error: block.is_error || false,
                      }),
                    }));
                  }
                }
                break;
              }

              case 'system': {
                if (msg.subtype === 'init') {
                  if (msg.session_id) {
                    try {
                      updateSdkSessionId(sessionId, setRuntimeSessionId(options.sdkSessionId, 'codebuddy', msg.session_id));
                    } catch {
                      // best effort
                    }
                  }
                  controller.enqueue(formatSSE({
                    type: 'status',
                    data: JSON.stringify({
                      session_id: msg.session_id,
                      model: msg.model,
                      requested_model: options.model,
                      runtime: 'codebuddy',
                      provider_protocol: 'codebuddy-sdk',
                    }),
                  }));
                  onRuntimeStatusChange?.('codebuddy-sdk-ready');
                }
                break;
              }

              case 'result': {
                hasResult = true;
                if (msg.subtype === 'success' || !msg.is_error) {
                  if (msg.session_id) {
                    try {
                      updateSdkSessionId(sessionId, setRuntimeSessionId(options.sdkSessionId, 'codebuddy', msg.session_id));
                    } catch {
                      // best effort
                    }
                  }
                  controller.enqueue(formatSSE({
                    type: 'result',
                    data: JSON.stringify({
                      is_error: false,
                      session_id: msg.session_id,
                      usage: {
                        ...extractUsage(msg),
                        cost_usd: msg.total_cost_usd,
                      },
                    }),
                  }));
                } else {
                  controller.enqueue(formatSSE({ type: 'error', data: (msg.errors || []).join('; ') || 'CodeBuddy SDK returned an error' }));
                }
                break;
              }

              case 'error': {
                emitClassifiedError(msg.error || 'CodeBuddy SDK stream error');
                break;
              }

              default:
                break;
            }
          }

          emitDone();
          closeController();
        } catch (error) {
          if (!hasResult) {
            emitClassifiedError(error instanceof Error ? error : String(error));
          }
          emitDone();
          closeController();
        }
      })();
    },
    cancel() {
      abortController?.abort();
    },
  });
}
