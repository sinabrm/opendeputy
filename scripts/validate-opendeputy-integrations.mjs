import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createWorkspaceToolsService } from '../packages/web/server/lib/workspace-tools/service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'opendeputy-integration-'));
const report = { ok: true, checks: {} };
const service = createWorkspaceToolsService({ dataDir: temporaryRoot, env: process.env });

try {
  const status = await service.execute('workspace.status');
  report.checks.workspaceStatus = status;

  const memory = await service.execute('memory.add', {
    content: 'OpenDeputy integration validation record',
    kind: 'test',
    tags: ['temporary'],
  });
  const memorySearch = await service.execute('memory.search', { query: 'integration validation' });
  const memoryDelete = await service.execute('memory.delete', { id: memory.id });
  if (memorySearch.count !== 1 || memoryDelete.deleted !== true) throw new Error('Local memory validation failed');
  report.checks.memory = { ok: true };

  const legacyTestData = path.join(process.env.LOCALAPPDATA || '', 'OpenChamberTools', 'workspace-tools', 'testdata');
  const document = fs.existsSync(legacyTestData)
    ? fs.readdirSync(legacyTestData).find((name) => /\.(docx|xlsx|pptx|html)$/i.test(name))
    : null;
  if (status.libreOffice && document) {
    const converted = await service.execute('document.preview', {
      inputPath: path.join(legacyTestData, document),
      previewFormat: 'pdf',
    });
    report.checks.documentPreview = { ok: fs.existsSync(converted.output), format: converted.format };
  } else {
    report.checks.documentPreview = { ok: null, skipped: 'LibreOffice or a sample Office document is unavailable' };
  }

  if (status.piper && status.voices.length > 0) {
    const voice = await service.execute('voice.synthesize', {
      text: 'OpenDeputy integration test.',
      voice: status.voices[0],
      outputName: 'validation',
    });
    report.checks.voice = { ok: fs.existsSync(voice.output), voice: voice.voice };
  } else {
    report.checks.voice = { ok: null, skipped: 'Piper or a voice model is unavailable' };
  }

  const computerUseBinary = path.join(
    root,
    'packages', 'electron', 'node_modules', 'open-computer-use', 'dist', 'windows',
    process.arch === 'x64' ? 'amd64' : process.arch,
    'open-computer-use.exe',
  );
  if (process.platform === 'win32' && fs.existsSync(computerUseBinary)) {
    const computer = spawnSync(computerUseBinary, ['call', 'list_apps'], {
      encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    if (computer.status !== 0 || !computer.stdout.includes('content')) throw new Error(computer.stderr || 'Open Computer Use validation failed');
    report.checks.computerUse = { ok: true };
  } else {
    report.checks.computerUse = { ok: null, skipped: 'Bundled Windows runtime is unavailable on this host' };
  }

  const history = await service.execute('history.status');
  report.checks.activityHistory = { installed: Boolean(history.installed), running: history.running };
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  service.close();
  const resolvedTemp = path.resolve(temporaryRoot);
  const safePrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (resolvedTemp.startsWith(safePrefix) && path.basename(resolvedTemp).startsWith('opendeputy-integration-')) {
    await fsp.rm(resolvedTemp, { recursive: true, force: true });
  }
}

console.log(JSON.stringify(report, null, 2));
