import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnOpenBrowserUse } from './open-browser-use-launcher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sessionId = `opendeputy-${process.pid}-${randomBytes(4).toString('hex')}`;

const child = spawnOpenBrowserUse({
  root,
  args: [
  'mcp',
  '--session-id',
  sessionId,
  '--browser',
  'chrome',
  '--profile',
  'Default',
  ],
});

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
