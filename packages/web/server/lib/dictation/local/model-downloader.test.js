import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLocalSttModelSpec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('./model-catalog.js', () => ({
  getLocalSttModelSpec: mocks.getLocalSttModelSpec,
}));

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}));

import { ensureLocalSttModel } from './model-downloader.js';

const trustedArchive = Buffer.from('trusted model archive fixture');
const trustedSha256 = createHash('sha256').update(trustedArchive).digest('hex');
const archiveFilename = 'fixture-model.tar.bz2';
const modelSpec = {
  id: 'fixture-model',
  archiveUrl: `https://example.test/${archiveFilename}`,
  archiveIntegrity: {
    algorithm: 'sha256',
    sha256: trustedSha256,
    bytes: trustedArchive.length,
  },
  extractedDir: 'fixture-model',
  files: { model: 'model.onnx' },
  requiredFiles: ['model.onnx'],
};

let modelsDir;

beforeEach(async () => {
  modelsDir = await mkdtemp(path.join(os.tmpdir(), 'opendeputy-model-downloader-'));
  mocks.getLocalSttModelSpec.mockReturnValue(modelSpec);
  mocks.spawn.mockImplementation((_command, args) => {
    const child = new EventEmitter();
    const destination = args[3];
    const extractedDir = path.join(destination, modelSpec.extractedDir);
    mkdirSync(extractedDir, { recursive: true });
    writeFileSync(path.join(extractedDir, modelSpec.requiredFiles[0]), 'model data');
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await rm(modelsDir, { recursive: true, force: true });
});

function responseFor(bytes) {
  return new Response(bytes, {
    status: 200,
    headers: { 'content-length': String(bytes.length) },
  });
}

async function expectNoDownloadTemporaryFiles() {
  const downloadsDir = path.join(modelsDir, '.downloads');
  const entries = existsSync(downloadsDir) ? await readdir(downloadsDir) : [];
  expect(entries.filter((entry) => entry.includes('.tmp-'))).toEqual([]);
}

describe('ensureLocalSttModel archive integrity', () => {
  it('verifies size and SHA-256 before extracting a downloaded archive', async () => {
    const fetchMock = vi.fn(async () => responseFor(trustedArchive));
    vi.stubGlobal('fetch', fetchMock);
    const progress = [];

    const installedDir = await ensureLocalSttModel({
      modelsDir,
      modelId: modelSpec.id,
      onProgress: (downloadedBytes, totalBytes) => progress.push([downloadedBytes, totalBytes]),
    });

    expect(installedDir).toBe(path.join(modelsDir, modelSpec.extractedDir));
    expect(fetchMock).toHaveBeenCalledWith(modelSpec.archiveUrl);
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(progress.at(-1)).toEqual([trustedArchive.length, trustedArchive.length]);
    expect(existsSync(path.join(installedDir, modelSpec.requiredFiles[0]))).toBe(true);
    expect(existsSync(path.join(modelsDir, '.downloads', archiveFilename))).toBe(false);
    await expectNoDownloadTemporaryFiles();
  });

  it('rejects a same-size archive with the wrong SHA-256 and removes temporary data', async () => {
    const tamperedArchive = Buffer.from(trustedArchive);
    tamperedArchive[0] ^= 0xff;
    vi.stubGlobal('fetch', vi.fn(async () => responseFor(tamperedArchive)));

    await expect(
      ensureLocalSttModel({ modelsDir, modelId: modelSpec.id }),
    ).rejects.toThrow('SHA-256 mismatch');

    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(existsSync(path.join(modelsDir, '.downloads', archiveFilename))).toBe(false);
    await expectNoDownloadTemporaryFiles();
  });

  it('rejects a response with the wrong byte size before extraction', async () => {
    const shortArchive = trustedArchive.subarray(0, trustedArchive.length - 1);
    vi.stubGlobal('fetch', vi.fn(async () => responseFor(shortArchive)));

    await expect(
      ensureLocalSttModel({ modelsDir, modelId: modelSpec.id }),
    ).rejects.toThrow(`expected ${trustedArchive.length} bytes, server reported ${shortArchive.length}`);

    expect(mocks.spawn).not.toHaveBeenCalled();
    await expectNoDownloadTemporaryFiles();
  });

  it('fails closed before network access when pinned integrity metadata is missing', async () => {
    mocks.getLocalSttModelSpec.mockReturnValue({ ...modelSpec, archiveIntegrity: null });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      ensureLocalSttModel({ modelsDir, modelId: modelSpec.id }),
    ).rejects.toThrow('refusing an unverified download');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('discards an invalid cached archive and replaces it with a verified download', async () => {
    const downloadsDir = path.join(modelsDir, '.downloads');
    await mkdir(downloadsDir, { recursive: true });
    await writeFile(path.join(downloadsDir, archiveFilename), Buffer.alloc(trustedArchive.length, 0));
    const fetchMock = vi.fn(async () => responseFor(trustedArchive));
    vi.stubGlobal('fetch', fetchMock);

    await ensureLocalSttModel({ modelsDir, modelId: modelSpec.id });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(existsSync(path.join(modelsDir, modelSpec.extractedDir, modelSpec.requiredFiles[0]))).toBe(true);
    await expectNoDownloadTemporaryFiles();
  });
});
