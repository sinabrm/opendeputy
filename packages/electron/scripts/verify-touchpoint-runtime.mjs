import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '../agent-kit/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../agent-kit/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';

const REQUIRED_TOOLS = [
  'apps',
  'diagnostics',
  'windows',
  'find',
  'get_element',
  'snapshot',
  'screenshot',
  'click',
  'set_value',
  'read_text',
  'type_text',
  'press_key',
  'scroll',
  'activate_window',
  'wait_for',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const runtimeRoot = packaged
  ? path.join(electronRoot, 'dist', 'win-unpacked', 'resources', 'touchpoint-runtime')
  : path.join(electronRoot, 'resources', 'touchpoint-runtime');
const python = path.join(runtimeRoot, 'python.exe');

if (!fs.existsSync(python)) {
  throw new Error(`Bundled TouchPoint Python runtime is missing: ${python}`);
}

const transport = new StdioClientTransport({
  command: python,
  args: ['-m', 'touchpoint.mcp.server'],
  env: {
    PYTHONNOUSERSITE: '1',
    PYTHONUTF8: '1',
    TOUCHPOINT_CDP_DISCOVER: 'true',
    TOUCHPOINT_FALLBACK_INPUT: 'false',
  },
  stderr: 'pipe',
});
const client = new Client({ name: 'opendeputy-touchpoint-validator', version: '1.0.0' });

try {
  await client.connect(transport);
  const response = await client.listTools();
  const toolNames = response.tools.map((tool) => tool.name);
  const missing = REQUIRED_TOOLS.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`TouchPoint MCP is missing required tools: ${missing.join(', ')}`);
  }
  console.log(`[electron] TouchPoint MCP ready with ${toolNames.length} tools: ${python}`);
} finally {
  await client.close();
}
