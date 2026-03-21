/**
 * CLI Runtime — manages dual-runtime (Claude Code / CodeBuddy SDK) switching.
 *
 * Provides:
 * - Runtime type definition and persistence
 * - Runtime-aware session ID isolation (Claude and CodeBuddy sessions stored separately)
 * - Human-readable runtime labels
 */

import { getSetting, setSetting } from './db';

// ── Types ──────────────────────────────────────────────────────

export type CliRuntime = 'claude' | 'codebuddy';

// ── Persistence ────────────────────────────────────────────────

const SETTING_KEY = 'cli_runtime';

/**
 * Read the currently configured CLI runtime.
 * Defaults to 'claude' when not set.
 */
export function getCliRuntime(): CliRuntime {
  const raw = getSetting(SETTING_KEY);
  return raw === 'codebuddy' ? 'codebuddy' : 'claude';
}

/**
 * Persist the desired CLI runtime.
 */
export function setCliRuntime(runtime: CliRuntime): void {
  setSetting(SETTING_KEY, runtime);
}

// ── Labels ─────────────────────────────────────────────────────

/**
 * Human-readable label for a runtime.
 */
export function getRuntimeLabel(runtime: CliRuntime): string {
  return runtime === 'codebuddy' ? 'CodeBuddy SDK' : 'Claude Code';
}

// ── Session ID isolation ───────────────────────────────────────

/**
 * Session IDs from different runtimes are stored together as a
 * JSON object `{ claude?: string; codebuddy?: string }`.
 *
 * This allows a single chat_sessions.sdk_session_id column to hold
 * per-runtime session IDs without schema changes.
 */

interface RuntimeSessionIds {
  claude?: string;
  codebuddy?: string;
}

function parseRuntimeSessionIds(raw: string | undefined | null): RuntimeSessionIds {
  if (!raw) return {};
  // Legacy: plain string = Claude session ID
  if (!raw.startsWith('{')) return { claude: raw };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return { claude: raw };
}

/**
 * Extract the session ID for a specific runtime.
 */
export function getRuntimeSessionId(
  rawSdkSessionId: string | undefined | null,
  runtime: CliRuntime,
): string | undefined {
  const ids = parseRuntimeSessionIds(rawSdkSessionId);
  return ids[runtime] || undefined;
}

/**
 * Update the session ID for a specific runtime and return the
 * serialised value to store back in the DB.
 */
export function setRuntimeSessionId(
  rawSdkSessionId: string | undefined | null,
  runtime: CliRuntime,
  newId: string,
): string {
  const ids = parseRuntimeSessionIds(rawSdkSessionId);
  ids[runtime] = newId;
  return JSON.stringify(ids);
}
