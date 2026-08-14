import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createWorkspaceToolsService } from './service.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const createService = async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-deputy-workspace-'));
  temporaryDirectories.push(dataDir);
  return createWorkspaceToolsService({
    dataDir,
    env: {},
    fetch: async () => { throw new Error('offline'); },
  });
};

describe('OpenDeputy workspace tools', () => {
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
