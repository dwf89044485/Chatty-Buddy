/**
 * Agentation MCP server lifecycle manager.
 *
 * Manages the agentation-mcp child process:
 * - Auto-start when browser panel opens
 * - Auto-stop when browser panel closes
 * - Health checking
 * - Port allocation
 */

import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import net from 'net';

const DEFAULT_PORT = 4747;
const MAX_PORT_ATTEMPTS = 10;
const HEALTH_CHECK_TIMEOUT = 3000;
const HEALTH_CHECK_INTERVAL = 5000;

let serverProcess: ChildProcess | null = null;
let currentPort: number | null = null;
let healthCheckTimer: NodeJS.Timeout | null = null;
let isStarting = false;

/**
 * Check if a port is available.
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port starting from the default.
 */
async function findAvailablePort(startPort: number = DEFAULT_PORT): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  // Fall back to OS-assigned port
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.once('listening', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.listen(0, '127.0.0.1');
  });
}

/**
 * Health check the agentation-mcp server.
 */
async function healthCheck(port: number): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const http = require('http');
    return await new Promise<boolean>((resolve) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/health',
          timeout: HEALTH_CHECK_TIMEOUT,
        },
        (res: { statusCode?: number }) => {
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Start periodic health checking.
 */
function startHealthCheck(port: number) {
  stopHealthCheck();
  healthCheckTimer = setInterval(async () => {
    const healthy = await healthCheck(port);
    if (!healthy && serverProcess) {
      console.warn('[agentation] Health check failed, server may have crashed');
    }
  }, HEALTH_CHECK_INTERVAL);
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

/**
 * Start the agentation-mcp server.
 */
export async function startAgentationServer(
  preferredPort?: number
): Promise<{ port: number; pid: number | undefined }> {
  if (serverProcess && currentPort) {
    const healthy = await healthCheck(currentPort);
    if (healthy) {
      return { port: currentPort, pid: serverProcess.pid };
    }
    // Server is dead, clean up
    await stopAgentationServer();
  }

  if (isStarting) {
    throw new Error('Agentation server is already starting');
  }

  isStarting = true;

  try {
    const port = await findAvailablePort(preferredPort ?? DEFAULT_PORT);

    // Try to resolve agentation-mcp from node_modules
    let serverBin: string;
    try {
      serverBin = require.resolve('agentation-mcp/bin/server');
    } catch {
      // Fallback: try npx
      serverBin = 'agentation-mcp';
    }

    const isResolved = serverBin !== 'agentation-mcp';

    const child = isResolved
      ? spawn(process.execPath, [serverBin], {
          env: {
            ...process.env,
            PORT: String(port),
            HOST: '127.0.0.1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn('npx', ['agentation-mcp'], {
          env: {
            ...process.env,
            PORT: String(port),
            HOST: '127.0.0.1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        });

    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[agentation] ${data.toString().trim()}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[agentation:err] ${data.toString().trim()}`);
    });

    child.on('exit', (code) => {
      console.log(`[agentation] Server exited with code ${code}`);
      serverProcess = null;
      currentPort = null;
      stopHealthCheck();
    });

    child.on('error', (err) => {
      console.error(`[agentation] Failed to start server:`, err);
      serverProcess = null;
      currentPort = null;
    });

    serverProcess = child;
    currentPort = port;

    // Wait for server to be ready
    const startTime = Date.now();
    const timeout = 15000;
    while (Date.now() - startTime < timeout) {
      if (await healthCheck(port)) {
        startHealthCheck(port);
        return { port, pid: child.pid };
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // Timeout - kill the process
    child.kill();
    serverProcess = null;
    currentPort = null;
    throw new Error(`Agentation server failed to start within ${timeout / 1000}s`);
  } finally {
    isStarting = false;
  }
}

/**
 * Stop the agentation-mcp server gracefully.
 */
export async function stopAgentationServer(): Promise<void> {
  stopHealthCheck();

  if (!serverProcess) {
    currentPort = null;
    return;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (serverProcess?.pid) {
        try {
          process.kill(serverProcess.pid, 'SIGKILL');
        } catch {
          /* already dead */
        }
      }
      serverProcess = null;
      currentPort = null;
      resolve();
    }, 3000);

    serverProcess!.on('exit', () => {
      clearTimeout(timeout);
      serverProcess = null;
      currentPort = null;
      resolve();
    });

    serverProcess!.kill('SIGTERM');
  });
}

/**
 * Get the current agentation server port, or null if not running.
 */
export function getAgentationPort(): number | null {
  return currentPort;
}

/**
 * Check if the agentation server is running.
 */
export async function isAgentationRunning(): Promise<boolean> {
  if (!currentPort) return false;
  return healthCheck(currentPort);
}

/**
 * Get the agentation server status.
 */
export async function getAgentationStatus(): Promise<{
  running: boolean;
  port: number | null;
  pid: number | undefined;
}> {
  const running = await isAgentationRunning();
  return {
    running,
    port: currentPort,
    pid: serverProcess?.pid,
  };
}
