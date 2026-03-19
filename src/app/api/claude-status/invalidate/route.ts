import { NextResponse } from 'next/server';
import { invalidateAgentRuntimeCache } from '@/lib/agent-runtime';

/**
 * POST /api/claude-status/invalidate
 * Clears all cached Claude binary paths so the next status check or SDK call
 * picks up a freshly-installed binary. Called by the install wizard on success.
 */
export async function POST() {
  invalidateAgentRuntimeCache();
  return NextResponse.json({ ok: true });
}