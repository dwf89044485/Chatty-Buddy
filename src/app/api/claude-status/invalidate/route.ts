import { NextResponse } from 'next/server';
import { invalidateClaudeClientCache } from '@/lib/claude-client';
import { invalidateCodeBuddyPathCache } from '@/lib/platform';
import { invalidateCodeBuddyClientCache } from '@/lib/codebuddy-client'; // [CodeBuddy]

/**
 * POST /api/claude-status/invalidate
 * Clears all cached binary paths (Claude + CodeBuddy) so the next status check
 * or SDK call picks up a freshly-installed binary. Called by the install wizard.
 */
export async function POST() {
  invalidateClaudeClientCache();
  invalidateCodeBuddyPathCache();
  invalidateCodeBuddyClientCache(); // [CodeBuddy]
  return NextResponse.json({ ok: true });
}
