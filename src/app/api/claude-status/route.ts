import { NextResponse } from 'next/server';
import {
  findClaudeBinary,
  getClaudeVersion,
  findAllClaudeBinaries,
  classifyClaudePath,
  isWindows,
  findGitBash,
  findCodeBuddyBinary,
  getCodeBuddyVersion,
  findAllCodeBuddyBinaries,
  classifyCodeBuddyPath,
} from '@/lib/platform';
import type { ClaudeInstallInfo, CodeBuddyInstallInfo } from '@/lib/platform';
import { getCliRuntime } from '@/lib/cli-runtime';

/** Minimum CLI versions for optional features */
const FEATURE_MIN_VERSIONS: Record<string, string> = {
  thinking: '1.0.10',
  context1m: '1.0.20',
  effort: '1.0.15',
};

/** Compare two semver-like version strings. Returns true if a >= b */
function versionGte(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true;
}

export async function GET() {
  try {
    const runtime = getCliRuntime();
    const claudePath = findClaudeBinary();
    const codebuddyPath = findCodeBuddyBinary();

    // On Windows, check for Git Bash (bash.exe) using the same detection as the SDK runtime.
    // This avoids false negatives when Git is installed but git.exe isn't on PATH.
    const missingGit = isWindows && findGitBash() === null;

    const claudeVersion = claudePath ? await getClaudeVersion(claudePath) : null;
    const claudeInstallType = claudePath ? classifyClaudePath(claudePath) : null;

    let claudeOtherInstalls: ClaudeInstallInfo[] = [];
    try {
      const all = findAllClaudeBinaries();
      claudeOtherInstalls = all.filter(i => i.path !== claudePath);
    } catch {
      // non-critical
    }

    const claudeFeatures: Record<string, boolean> = {};
    if (claudeVersion) {
      for (const [feature, minVersion] of Object.entries(FEATURE_MIN_VERSIONS)) {
        claudeFeatures[feature] = versionGte(claudeVersion, minVersion);
      }
    }

    const claudeWarnings: string[] = [];
    if (missingGit) {
      claudeWarnings.push('Git Bash not found — some features may not work');
    }
    if (claudeOtherInstalls.length > 0) {
      claudeWarnings.push(`${claudeOtherInstalls.length} other Claude CLI installation(s) detected`);
    }

    const codebuddyVersion = codebuddyPath ? await getCodeBuddyVersion(codebuddyPath) : null;
    const codebuddyInstallType = codebuddyPath ? classifyCodeBuddyPath(codebuddyPath) : null;
    let codebuddyOtherInstalls: CodeBuddyInstallInfo[] = [];
    try {
      const all = findAllCodeBuddyBinaries();
      codebuddyOtherInstalls = all.filter(i => i.path !== codebuddyPath);
    } catch {
      // non-critical
    }

    const codebuddyWarnings: string[] = [];
    if (codebuddyOtherInstalls.length > 0) {
      codebuddyWarnings.push(`${codebuddyOtherInstalls.length} other CodeBuddy installation(s) detected`);
    }

    const active = runtime === 'codebuddy'
      ? {
          connected: !!codebuddyVersion,
          version: codebuddyVersion,
          binaryPath: codebuddyPath,
          installType: codebuddyInstallType,
          otherInstalls: codebuddyOtherInstalls,
          missingGit: false,
          warnings: codebuddyWarnings,
          features: {},
        }
      : {
          connected: !!claudeVersion,
          version: claudeVersion,
          binaryPath: claudePath,
          installType: claudeInstallType,
          otherInstalls: claudeOtherInstalls,
          missingGit,
          warnings: claudeWarnings,
          features: claudeFeatures,
        };

    return NextResponse.json({
      runtime,
      connected: active.connected,
      version: active.version,
      binaryPath: active.binaryPath,
      installType: active.installType,
      otherInstalls: active.otherInstalls,
      missingGit: active.missingGit,
      warnings: active.warnings,
      features: active.features,
      runtimes: {
        claude: {
          connected: !!claudeVersion,
          version: claudeVersion,
          binaryPath: claudePath,
          installType: claudeInstallType,
          otherInstalls: claudeOtherInstalls,
          missingGit,
          warnings: claudeWarnings,
          features: claudeFeatures,
        },
        codebuddy: {
          connected: !!codebuddyVersion,
          version: codebuddyVersion,
          binaryPath: codebuddyPath,
          installType: codebuddyInstallType,
          otherInstalls: codebuddyOtherInstalls,
          missingGit: false,
          warnings: codebuddyWarnings,
          features: {},
        },
      },
    });
  } catch {
    return NextResponse.json({
      runtime: 'claude',
      connected: false,
      version: null,
      binaryPath: null,
      installType: null,
      otherInstalls: [],
      missingGit: false,
      warnings: [],
      features: {},
      runtimes: {
        claude: { connected: false, version: null, binaryPath: null, installType: null, otherInstalls: [], missingGit: false, warnings: [], features: {} },
        codebuddy: { connected: false, version: null, binaryPath: null, installType: null, otherInstalls: [], missingGit: false, warnings: [], features: {} },
      },
    });
  }
}