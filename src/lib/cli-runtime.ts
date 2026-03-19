import { getSetting } from '@/lib/db';
import type { CliRuntime } from '@/types';

export const DEFAULT_CLI_RUNTIME: CliRuntime = 'claude';

export interface RuntimeSessionMap {
  claude?: string;
  codebuddy?: string;
}

export function normalizeCliRuntime(value: string | null | undefined): CliRuntime {
  return value === 'codebuddy' ? 'codebuddy' : 'claude';
}

export function getCliRuntime(): CliRuntime {
  return normalizeCliRuntime(getSetting('cli_runtime'));
}

export function getCliRuntimeLabel(runtime: CliRuntime): string {
  return runtime === 'codebuddy' ? 'CodeBuddy CLI' : 'Claude Code';
}

export function parseRuntimeSessionMap(value: string | null | undefined): RuntimeSessionMap {
  const trimmed = value?.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as RuntimeSessionMap;
      return {
        claude: typeof parsed.claude === 'string' && parsed.claude ? parsed.claude : undefined,
        codebuddy: typeof parsed.codebuddy === 'string' && parsed.codebuddy ? parsed.codebuddy : undefined,
      };
    } catch {
      return { claude: trimmed };
    }
  }

  if (trimmed.startsWith('codebuddy:')) {
    return { codebuddy: trimmed.slice('codebuddy:'.length) || undefined };
  }

  if (trimmed.startsWith('claude:')) {
    return { claude: trimmed.slice('claude:'.length) || undefined };
  }

  return { claude: trimmed };
}

export function serializeRuntimeSessionMap(value: RuntimeSessionMap): string {
  const normalized: RuntimeSessionMap = {};
  if (value.claude) normalized.claude = value.claude;
  if (value.codebuddy) normalized.codebuddy = value.codebuddy;

  if (!normalized.claude && !normalized.codebuddy) return '';
  if (normalized.claude && !normalized.codebuddy) return normalized.claude;
  if (!normalized.claude && normalized.codebuddy) return `codebuddy:${normalized.codebuddy}`;
  return JSON.stringify(normalized);
}

export function getRuntimeSessionId(
  storedValue: string | null | undefined,
  runtime: CliRuntime,
): string | undefined {
  return parseRuntimeSessionMap(storedValue)[runtime] || undefined;
}

export function setRuntimeSessionId(
  storedValue: string | null | undefined,
  runtime: CliRuntime,
  nextSessionId: string | null | undefined,
): string {
  const current = parseRuntimeSessionMap(storedValue);
  if (nextSessionId) {
    current[runtime] = nextSessionId;
  } else {
    delete current[runtime];
  }
  return serializeRuntimeSessionMap(current);
}
