import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentKitDirectory = path.resolve(__dirname, '..', 'agent-kit');
const npmCli = [
  process.env.OPENDEPUTY_NPM_CLI,
  // Node installed through nvm keeps npm beside the runtime under
  // ../lib/node_modules rather than in bin/node_modules. Keep the original
  // layout too because system and Windows Node installations use it.
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  '/usr/share/nodejs/npm/bin/npm-cli.js',
].find((candidate) => candidate && fs.existsSync(candidate));

if (!npmCli) {
  throw new Error('npm-cli.js was not found beside the active Node.js runtime');
}

// @zavora-ai/computer-use-mcp 7.0.0 carries its native binaries in the main
// package while also declaring unpublished platform packages as optional.
// npm ci rejects that upstream manifest/lock combination; npm install keeps the
// pinned lockfile versions and correctly treats those missing optional packages
// as optional.
const child = spawn(process.execPath, [
  npmCli,
  'install',
  '--omit=dev',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
], {
  cwd: agentKitDirectory,
  env: {
    ...process.env,
    OPEN_BROWSER_USE_SKIP_POSTINSTALL: '1',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  },
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  console.error('[electron] failed to prepare the bundled agent kit:', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
