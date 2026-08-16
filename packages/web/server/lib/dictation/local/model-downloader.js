/**
 * Downloads and extracts local sherpa-onnx STT/TTS model archives.
 * Archives (.tar.bz2) come from the k2-fsa GitHub releases and are extracted
 * with the system `tar` into the speech-models directory. Every archive is
 * checked against its catalog-pinned byte size and SHA-256 before extraction.
 */

import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rename, rm, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';

import { getLocalSttModelSpec } from './model-catalog.js';

async function hasRequiredFiles(modelDir, requiredFiles) {
  const results = await Promise.all(
    requiredFiles.map(async (rel) => {
      try {
        const s = await stat(path.join(modelDir, rel));
        if (s.isDirectory()) {
          return true;
        }
        return s.isFile() && s.size > 0;
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

function parseArchiveIntegrity(spec) {
  const integrity = spec.archiveIntegrity;
  if (
    integrity?.algorithm !== 'sha256' ||
    !/^[a-f0-9]{64}$/i.test(integrity.sha256 || '') ||
    !Number.isSafeInteger(integrity.bytes) ||
    integrity.bytes <= 0
  ) {
    throw new Error(
      `Speech model ${spec.id} has no valid pinned archive SHA-256 and byte size; refusing an unverified download.`,
    );
  }
  return {
    bytes: integrity.bytes,
    sha256: integrity.sha256.toLowerCase(),
  };
}

function assertArchiveIntegrity({ filename, actualBytes, actualSha256, expected }) {
  if (actualBytes !== expected.bytes) {
    throw new Error(
      `Integrity check failed for ${filename}: expected ${expected.bytes} bytes, received ${actualBytes}.`,
    );
  }
  if (actualSha256 !== expected.sha256) {
    throw new Error(
      `Integrity check failed for ${filename}: SHA-256 mismatch (expected ${expected.sha256}, received ${actualSha256}).`,
    );
  }
}

async function verifyArchiveFile(filePath, expected) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`${filePath} is not a file.`);
  }
  if (fileStat.size !== expected.bytes) {
    assertArchiveIntegrity({
      filename: path.basename(filePath),
      actualBytes: fileStat.size,
      actualSha256: '',
      expected,
    });
  }

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  assertArchiveIntegrity({
    filename: path.basename(filePath),
    actualBytes: fileStat.size,
    actualSha256: hash.digest('hex'),
    expected,
  });
}

async function downloadToFile(url, outputPath, expected, onProgress) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error(`Failed to download ${url}: missing response body`);
  }

  const responseBytes = Number.parseInt(res.headers.get('content-length') || '', 10) || null;
  if (responseBytes !== null && responseBytes !== expected.bytes) {
    await res.body.cancel().catch(() => undefined);
    throw new Error(
      `Integrity check failed for ${path.basename(outputPath)}: expected ${expected.bytes} bytes, server reported ${responseBytes}.`,
    );
  }

  let downloadedBytes = 0;
  const hash = createHash('sha256');

  const tmpPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(path.dirname(outputPath), { recursive: true });

  const nodeStream = Readable.fromWeb(res.body);
  nodeStream.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    hash.update(chunk);
    if (typeof onProgress === 'function') {
      onProgress(downloadedBytes, expected.bytes);
    }
  });

  try {
    await pipeline(nodeStream, createWriteStream(tmpPath));
    assertArchiveIntegrity({
      filename: path.basename(outputPath),
      actualBytes: downloadedBytes,
      actualSha256: hash.digest('hex'),
      expected,
    });
    await rename(tmpPath, outputPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function extractTarArchive(archivePath, destDir) {
  await mkdir(destDir, { recursive: true });

  await new Promise((resolve, reject) => {
    const child = spawn('tar', ['xf', archivePath, '-C', destDir], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code}`));
      }
    });
  });
}

async function isNonEmptyFile(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/**
 * Check whether a model is fully installed (all required files present).
 * @param {string} modelsDir
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
export async function isLocalSttModelInstalled(modelsDir, modelId) {
  const spec = getLocalSttModelSpec(modelId);
  return hasRequiredFiles(path.join(modelsDir, spec.extractedDir), spec.requiredFiles);
}

/**
 * Ensure a model is downloaded and extracted. Resolves with the model dir.
 *
 * Download and extraction are staged: the archive is integrity-checked before
 * it is cached, then unpacks into a temporary directory and is verified before
 * being renamed into place. An interrupted or failed tar must
 * never leave partial files at the final path — the installed check only
 * verifies file presence, so a truncated .onnx there would be treated as an
 * installed model forever ("Protobuf parsing failed" at load time).
 *
 * @param {{ modelsDir: string, modelId: string,
 *           onProgress?: (downloadedBytes: number, totalBytes: number | null) => void }} options
 * @returns {Promise<string>}
 */
export async function ensureLocalSttModel({ modelsDir, modelId, onProgress }) {
  const spec = getLocalSttModelSpec(modelId);
  const modelDir = path.join(modelsDir, spec.extractedDir);
  if (await hasRequiredFiles(modelDir, spec.requiredFiles)) {
    return modelDir;
  }
  const expectedIntegrity = parseArchiveIntegrity(spec);

  // A directory that exists but fails the required-files check is a partial
  // extraction from an earlier interrupted attempt — remove it before retrying.
  await rm(modelDir, { recursive: true, force: true }).catch(() => undefined);

  const downloadsDir = path.join(modelsDir, '.downloads');
  const archiveFilename = path.basename(new URL(spec.archiveUrl).pathname);
  const archivePath = path.join(downloadsDir, archiveFilename);

  if (await isNonEmptyFile(archivePath)) {
    try {
      await verifyArchiveFile(archivePath, expectedIntegrity);
    } catch {
      await rm(archivePath, { force: true });
    }
  }

  if (!(await isNonEmptyFile(archivePath))) {
    await downloadToFile(spec.archiveUrl, archivePath, expectedIntegrity, onProgress);
  }

  const stagingDir = path.join(modelsDir, `.staging-${spec.extractedDir}-${Date.now()}`);
  try {
    await extractTarArchive(archivePath, stagingDir);

    const stagedModelDir = path.join(stagingDir, spec.extractedDir);
    if (!(await hasRequiredFiles(stagedModelDir, spec.requiredFiles))) {
      // Bad archive (truncated download / corrupt cache): drop it so the next
      // attempt re-downloads instead of re-extracting the same broken bytes.
      await rm(archivePath, { force: true }).catch(() => undefined);
      throw new Error(
        `Extracted ${archiveFilename}, but required model files are missing or empty. The archive was discarded; retry to re-download.`,
      );
    }

    await rename(stagedModelDir, modelDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    // Any extraction failure means the cached archive can't be trusted
    // (corrupt bz2, truncated download). Discard it so retry re-downloads.
    await rm(archivePath, { force: true }).catch(() => undefined);
    throw error;
  }
  await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);

  await rm(archivePath, { force: true }).catch(() => undefined);

  return modelDir;
}
