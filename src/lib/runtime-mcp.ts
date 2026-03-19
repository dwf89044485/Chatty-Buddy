import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSetting } from './db';
import { getCliRuntime, normalizeCliRuntime } from './cli-runtime';
import type { CliRuntime, MCPServerConfig } from '@/types';

function readJson(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getRuntimeConfigPaths(runtime: CliRuntime): string[] {
  const home = os.homedir();
  if (runtime === 'codebuddy') {
    return [
      path.join(home, '.codebuddy', 'mcp.json'),
      path.join(home, '.codebuddy', 'settings.json'),
      path.join(process.cwd(), '.mcp.json'),
    ];
  }

  return [
    path.join(home, '.claude.json'),
    path.join(home, '.claude', 'settings.json'),
    path.join(process.cwd(), '.mcp.json'),
  ];
}

export function loadRuntimeMcpServers(runtime?: CliRuntime): Record<string, MCPServerConfig> | undefined {
  try {
    const resolvedRuntime = normalizeCliRuntime(runtime || getCliRuntime());
    const [userConfigPath, settingsPath, projectMcpPath] = getRuntimeConfigPaths(resolvedRuntime);
    const userConfig = readJson(userConfigPath);
    const settings = readJson(settingsPath);
    const projectMcp = readJson(projectMcpPath);

    const merged = {
      ...((userConfig.mcpServers || {}) as Record<string, MCPServerConfig>),
      ...((settings.mcpServers || {}) as Record<string, MCPServerConfig>),
      ...((projectMcp.mcpServers || {}) as Record<string, MCPServerConfig>),
    };

    for (const server of Object.values(merged)) {
      if (server.env) {
        for (const [key, value] of Object.entries(server.env)) {
          if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const settingKey = value.slice(2, -1);
            server.env[key] = getSetting(settingKey) || '';
          }
        }
      }
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  } catch {
    return undefined;
  }
}
