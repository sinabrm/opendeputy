import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PYTHON_VERSION = '3.12.10';
const PYTHON_ARCHIVE = `python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_ARCHIVE_SHA256 = '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ARCHIVE}`;
const TOUCHPOINT_VERSION = '0.3.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const resourcesRoot = path.join(electronRoot, 'resources');
const runtimeRoot = path.join(resourcesRoot, 'touchpoint-runtime');
const cacheRoot = path.join(electronRoot, '.cache', 'touchpoint-runtime');
const archivePath = path.join(cacheRoot, PYTHON_ARCHIVE);
const requirementsPath = path.join(electronRoot, 'touchpoint-requirements.txt');
const stampPath = path.join(runtimeRoot, 'opendeputy-touchpoint-runtime.json');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${stderr}${stdout}`);
  }
  return result;
};

const sha256File = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex');

const download = async (url, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const temporaryPath = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temporaryPath, destination);
};

const verifyArchive = () => {
  const actual = sha256File(archivePath);
  if (actual !== PYTHON_ARCHIVE_SHA256) {
    throw new Error(`Python runtime checksum mismatch: expected ${PYTHON_ARCHIVE_SHA256}, got ${actual}`);
  }
};

const probeBuildPython = (candidate) => {
  const result = spawnSync(candidate, [
    '-c',
    'import json, struct, sys; print(json.dumps({"version": list(sys.version_info[:3]), "bits": struct.calcsize("P") * 8}))',
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  try {
    const details = JSON.parse(result.stdout.trim());
    if (details.version?.[0] !== 3 || details.version?.[1] !== 12 || details.bits !== 64) return null;
    return { binary: candidate, details };
  } catch {
    return null;
  }
};

const findBuildPython = () => {
  const candidates = [];
  if (process.env.OPENDEPUTY_TOUCHPOINT_BUILD_PYTHON) {
    candidates.push(process.env.OPENDEPUTY_TOUCHPOINT_BUILD_PYTHON);
  }
  const where = spawnSync('where.exe', ['python.exe'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  if (where.status === 0) {
    candidates.push(...where.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
  }
  candidates.push('python.exe');

  for (const candidate of [...new Set(candidates)]) {
    const probe = probeBuildPython(candidate);
    if (probe) return probe;
  }
  throw new Error(
    'Python 3.12 x64 is required to prepare the bundled TouchPoint runtime. '
    + 'Install it or set OPENDEPUTY_TOUCHPOINT_BUILD_PYTHON to python.exe.',
  );
};

const verifyRuntime = (root) => {
  const python = path.join(root, 'python.exe');
  if (!fs.existsSync(python)) return false;
  const result = spawnSync(python, [
    '-c',
    [
      'import json, touchpoint',
      'import importlib.metadata as metadata',
      `assert metadata.version("touchpoint-py") == "${TOUCHPOINT_VERSION}"`,
      'report = touchpoint.diagnostics()',
      'assert report["backend"]["available"] is True',
      'assert report["input_provider"]["available"] is True',
      `print(json.dumps({"touchpoint": "${TOUCHPOINT_VERSION}", "backend": report["backend"]["name"]}))`,
    ].join('; '),
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONUTF8: '1',
      TOUCHPOINT_CDP_DISCOVER: 'true',
      TOUCHPOINT_FALLBACK_INPUT: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    windowsHide: true,
  });
  return result.status === 0;
};

const removeBytecodeCaches = (root) => {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name === '__pycache__') {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      removeBytecodeCaches(entryPath);
    } else if (/\.py[co]$/i.test(entry.name)) {
      fs.rmSync(entryPath, { force: true });
    }
  }
};

const readStamp = () => {
  try {
    return JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  } catch {
    return null;
  }
};

const main = async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`The bundled TouchPoint runtime currently requires a Windows x64 build host, got ${process.platform}/${process.arch}`);
  }
  const requirementsSha256 = sha256File(requirementsPath);
  const expectedStamp = {
    pythonVersion: PYTHON_VERSION,
    pythonArchiveSha256: PYTHON_ARCHIVE_SHA256,
    touchpointVersion: TOUCHPOINT_VERSION,
    requirementsSha256,
  };
  const currentStamp = readStamp();
  if (JSON.stringify(currentStamp) === JSON.stringify(expectedStamp) && verifyRuntime(runtimeRoot)) {
    console.log(`[electron] bundled TouchPoint runtime already prepared: ${runtimeRoot}`);
    return;
  }

  if (fs.existsSync(archivePath) && sha256File(archivePath) !== PYTHON_ARCHIVE_SHA256) {
    fs.rmSync(archivePath, { force: true });
  }
  if (!fs.existsSync(archivePath)) {
    console.log(`[electron] downloading Python ${PYTHON_VERSION} embeddable runtime`);
    await download(PYTHON_URL, archivePath);
  }
  verifyArchive();

  const buildPython = findBuildPython();
  const temporaryRoot = path.join(resourcesRoot, `touchpoint-runtime.prepare-${process.pid}`);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  fs.mkdirSync(temporaryRoot, { recursive: true });

  try {
    run('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(temporaryRoot)} -Force`,
    ]);

    fs.writeFileSync(
      path.join(temporaryRoot, 'python312._pth'),
      'python312.zip\n.\nLib\\site-packages\nimport site\n',
      'utf8',
    );
    const sitePackages = path.join(temporaryRoot, 'Lib', 'site-packages');
    fs.mkdirSync(sitePackages, { recursive: true });
    run(buildPython.binary, [
      '-m',
      'pip',
      'install',
      '--isolated',
      '--disable-pip-version-check',
      '--no-input',
      '--only-binary=:all:',
      '--requirement',
      requirementsPath,
      '--target',
      sitePackages,
    ], {
      env: {
        ...process.env,
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_NO_INPUT: '1',
        PYTHONNOUSERSITE: '1',
      },
    });
    removeBytecodeCaches(sitePackages);
    if (!verifyRuntime(temporaryRoot)) {
      throw new Error('Prepared TouchPoint runtime failed Windows backend diagnostics');
    }
    fs.writeFileSync(
      path.join(temporaryRoot, path.basename(stampPath)),
      `${JSON.stringify(expectedStamp, null, 2)}\n`,
      'utf8',
    );

    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.renameSync(temporaryRoot, runtimeRoot);
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }

  console.log(`[electron] prepared TouchPoint ${TOUCHPOINT_VERSION} with Python ${PYTHON_VERSION}: ${runtimeRoot}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
