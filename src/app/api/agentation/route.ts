import { NextResponse } from 'next/server';
import {
  startAgentationServer,
  stopAgentationServer,
  getAgentationStatus,
} from '@/lib/agentation-server';

/**
 * GET /api/agentation — Get server status
 */
export async function GET() {
  try {
    const status = await getAgentationStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agentation — Start or stop the server
 * Body: { action: 'start' | 'stop', port?: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, port } = body;

    if (action === 'start') {
      const result = await startAgentationServer(port);
      return NextResponse.json({
        running: true,
        port: result.port,
        pid: result.pid,
      });
    }

    if (action === 'stop') {
      await stopAgentationServer();
      return NextResponse.json({ running: false, port: null, pid: null });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
