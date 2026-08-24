import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createWorkspaceToolsService } from './service.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const createService = async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opendeputy-workspace-'));
  temporaryDirectories.push(dataDir);
  return createWorkspaceToolsService({
    dataDir,
    env: {},
    fetch: async () => { throw new Error('offline'); },
  });
};

describe('OpenDeputy workspace tools', () => {
  it('moves a legacy hyphenated data directory to the current OpenDeputy directory', async () => {
    const homeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendeputy-home-'));
    temporaryDirectories.push(homeDirectory);
    const legacyDirectory = path.join(homeDirectory, ['.open', 'deputy'].join('-'));
    await fs.mkdir(legacyDirectory);
    await fs.writeFile(path.join(legacyDirectory, 'keep.txt'), 'existing data');

    const service = createWorkspaceToolsService({
      os: { ...os, homedir: () => homeDirectory },
      env: {},
      fetch: async () => { throw new Error('offline'); },
    });

    expect(service.dataRoot).toBe(path.join(homeDirectory, '.opendeputy', 'workspace-tools'));
    expect(await fs.readFile(path.join(homeDirectory, '.opendeputy', 'keep.txt'), 'utf8')).toBe('existing data');
    service.close();
  });

  it('keeps using legacy data when its directory cannot be moved safely', async () => {
    const homeDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'opendeputy-home-'));
    temporaryDirectories.push(homeDirectory);
    const legacyDirectory = path.join(homeDirectory, ['.open', 'deputy'].join('-'));
    await fs.mkdir(legacyDirectory);
    const blockedFs = { ...fsSync, renameSync: () => { throw new Error('blocked'); } };

    const service = createWorkspaceToolsService({
      fs: blockedFs,
      os: { ...os, homedir: () => homeDirectory },
      env: {},
      fetch: async () => { throw new Error('offline'); },
    });

    expect(service.dataRoot).toBe(path.join(legacyDirectory, 'workspace-tools'));
    service.close();
  });

  it('stores, searches, and deletes local memory', async () => {
    const service = await createService();
    const added = await service.execute('memory.add', {
      content: 'Use Persian for spoken summaries',
      kind: 'preference',
      tags: ['voice', 'persian'],
    });

    const found = await service.execute('memory.search', { query: 'Persian' });
    expect(found.memories).toEqual([
      expect.objectContaining({
        id: added.id,
        kind: 'preference',
        content: 'Use Persian for spoken summaries',
        tags: ['voice', 'persian'],
      }),
    ]);

    expect(await service.execute('memory.delete', { id: added.id })).toEqual({ deleted: true, id: added.id });
    expect((await service.execute('memory.search', { query: 'Persian' })).count).toBe(0);
    service.close();
  });

  it('reports optional capabilities without starting activity tracking', async () => {
    const service = await createService();
    const status = await service.execute('workspace.status');
    expect(status).toEqual(expect.objectContaining({
      historyRunning: false,
      historyOptional: true,
      voices: expect.any(Array),
    }));
    service.close();
  });

  it('rejects writes that are empty or too large', async () => {
    const service = await createService();
    await expect(service.execute('memory.add', { content: '' })).rejects.toThrow('content is required');
    await expect(service.execute('memory.add', { content: 'x'.repeat(10_001) })).rejects.toThrow('at most 10000');
    service.close();
  });
});
