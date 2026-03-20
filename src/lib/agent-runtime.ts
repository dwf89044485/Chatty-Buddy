import type { CliRuntime, ClaudeStreamOptions } from '@/types';
import { getCliRuntime, normalizeCliRuntime } from './cli-runtime';
import { streamClaude, generateTextViaSdk as generateTextViaClaudeSdk, invalidateClaudeClientCache } from './claude-client';
import { streamCodeBuddySdk } from './codebuddy-sdk-client';
import { invalidateCodeBuddyPathCache } from './platform';

export function resolveCliRuntime(runtime?: CliRuntime): CliRuntime {
  return normalizeCliRuntime(runtime || getCliRuntime());
}

export function streamAgentRuntime(options: ClaudeStreamOptions): ReadableStream<string> {
  const providerProtocol = options.provider?.protocol;

  if (providerProtocol === 'codebuddy-sdk') {
    return streamCodeBuddySdk({ ...options, runtime: 'codebuddy' });
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
  return generateTextViaClaudeSdk(params);
}

export function invalidateAgentRuntimeCache(): void {
  invalidateClaudeClientCache();
  invalidateCodeBuddyPathCache();
}
