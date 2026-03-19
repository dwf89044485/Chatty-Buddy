import type { CliRuntime, ClaudeStreamOptions } from '@/types';
import { getCliRuntime, normalizeCliRuntime } from './cli-runtime';
import { streamClaude, generateTextViaSdk as generateTextViaClaudeSdk, invalidateClaudeClientCache } from './claude-client';
import { streamCodeBuddy } from './codebuddy-client';
import { invalidateCodeBuddyPathCache } from './platform';

export function resolveCliRuntime(runtime?: CliRuntime): CliRuntime {
  return normalizeCliRuntime(runtime || getCliRuntime());
}

export function streamAgentRuntime(options: ClaudeStreamOptions): ReadableStream<string> {
  const runtime = resolveCliRuntime(options.runtime);
  if (runtime === 'codebuddy') {
    return streamCodeBuddy({ ...options, runtime });
  }
  return streamClaude({ ...options, runtime: 'claude' });
}

export async function generateTextViaRuntime(params: {
  providerId?: string;
  model?: string;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  runtime?: CliRuntime;
}): Promise<string> {
  const runtime = resolveCliRuntime(params.runtime);
  if (runtime === 'codebuddy') {
    throw new Error('CodeBuddy runtime does not support SDK text generation for this endpoint yet.');
  }
  return generateTextViaClaudeSdk(params);
}

export function invalidateAgentRuntimeCache(): void {
  invalidateClaudeClientCache();
  invalidateCodeBuddyPathCache();
}
