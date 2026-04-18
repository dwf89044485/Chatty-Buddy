/**
 * Build the agentation npm package into a self-executing IIFE bundle
 * that can be injected into webview pages via executeJavaScript().
 *
 * Output: public/agentation-bundle.js (~150KB)
 *
 * This runs at build time, not runtime. The bundle includes React
 * since the target page may not be a React application.
 */

import { build } from 'esbuild';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public');
const OUT_FILE = path.join(OUT_DIR, 'agentation-bundle.js');

async function main() {
  // Ensure the agentation package exists
  let entryPoint: string;
  try {
    entryPoint = require.resolve('agentation', { paths: [ROOT] });
  } catch {
    console.warn('[build-agentation] agentation package not found, creating stub bundle');
    // Create a stub that does nothing — the real bundle will be created
    // once the agentation package is installed
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(
      OUT_FILE,
      `// Agentation stub — install the "agentation" package to enable visual feedback\n(function(){})();\n`
    );
    console.log(`[build-agentation] Wrote stub to ${OUT_FILE}`);
    return;
  }

  console.log(`[build-agentation] Building from ${entryPoint}`);

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: '__Agentation',
    outfile: OUT_FILE,
    platform: 'browser',
    target: ['chrome120'],
    minify: true,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    // Include React in the bundle since target pages may not have it
    external: [],
    loader: {
      '.css': 'text',
    },
  });

  const stats = fs.statSync(OUT_FILE);
  const sizeKB = (stats.size / 1024).toFixed(1);
  console.log(`[build-agentation] Bundle written to ${OUT_FILE} (${sizeKB} KB)`);
}

main().catch((err) => {
  console.error('[build-agentation] Build failed:', err);
  // Don't fail the overall build — agentation is optional
  const OUT_DIR_PATH = path.join(ROOT, 'public');
  fs.mkdirSync(OUT_DIR_PATH, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR_PATH, 'agentation-bundle.js'),
    `// Agentation build failed: ${String(err).replace(/\n/g, ' ')}\n(function(){})();\n`
  );
});
