import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const distributionDirectory = path.join(repositoryRoot, 'packages', 'electron', 'dist');

const findArtifact = (suffix) => {
  const artifact = fs.readdirSync(distributionDirectory).find((entry) => (
    entry.startsWith('OpenDeputy-') && entry.endsWith(suffix)
  ));
  assert.ok(artifact, `Linux ${suffix} artifact was not found in ${distributionDirectory}`);
  const artifactPath = path.join(distributionDirectory, artifact);
  const stats = fs.statSync(artifactPath);
  assert.ok(stats.isFile() && stats.size > 0, `${artifact} is empty`);
  return artifactPath;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.error,
    undefined,
    `${command} could not be started: ${result.error?.message || 'unknown error'}`,
  );
  return result;
};

assert.equal(process.platform, 'linux', 'Linux package validation must run on Linux');
assert.equal(process.arch, 'x64', 'The Linux desktop target currently supports x64 only');
assert.ok(fs.existsSync(distributionDirectory), `Missing package output directory: ${distributionDirectory}`);

const appImage = findArtifact('.AppImage');
const deb = findArtifact('.deb');
const appImageMode = fs.statSync(appImage).mode;
assert.ok((appImageMode & 0o111) !== 0, `${path.basename(appImage)} is not executable`);

const appImageVersion = run(appImage, ['--appimage-version'], { timeout: 30_000 });
assert.equal(
  appImageVersion.status,
  0,
  `AppImage runtime check failed:\n${appImageVersion.stderr || appImageVersion.stdout || ''}`,
);
assert.match(`${appImageVersion.stdout}\n${appImageVersion.stderr}`, /Version:\s*\S+/i);

const dpkgDeb = run('sh', ['-c', 'command -v dpkg-deb >/dev/null 2>&1']);
if (dpkgDeb.status === 0) {
  const packageInfo = run('dpkg-deb', ['--info', deb]);
  assert.equal(packageInfo.status, 0, `dpkg-deb could not inspect ${path.basename(deb)}`);
  assert.match(packageInfo.stdout, /Package:\s*opendeputy/);
  assert.match(packageInfo.stdout, /Version:\s*\d+\.\d+\.\d+/);
} else {
  console.warn('[linux-package] dpkg-deb is unavailable; skipped .deb metadata validation.');
}

const extractionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opendeputy-appimage-'));
try {
  const extraction = run(appImage, ['--appimage-extract'], {
    cwd: extractionDirectory,
    timeout: 60_000,
  });
  assert.equal(
    extraction.status,
    0,
    `AppImage extraction failed:\n${extraction.stderr || extraction.stdout || ''}`,
  );

  const extractedRoot = path.join(extractionDirectory, 'squashfs-root');
  assert.ok(fs.existsSync(path.join(extractedRoot, 'opendeputy')), 'AppImage is missing the Linux executable');
  const desktopEntry = fs.readFileSync(path.join(extractedRoot, 'opendeputy.desktop'), 'utf8');
  assert.match(desktopEntry, /^Name=OpenDeputy$/m, 'AppImage is missing its desktop application name');
  assert.match(desktopEntry, /^Exec=AppRun --no-sandbox %U$/m, 'AppImage desktop entry has an unexpected launcher');
  assert.ok(
    fs.existsSync(path.join(extractedRoot, 'resources', 'opencode-cli', 'opencode')),
    'AppImage is missing the bundled Linux OpenCode CLI',
  );
  assert.ok(
    (fs.statSync(path.join(extractedRoot, 'resources', 'opencode-cli', 'opencode')).mode & 0o111) !== 0,
    'Bundled Linux OpenCode CLI is not executable',
  );
  assert.ok(
    fs.existsSync(path.join(extractedRoot, 'resources', 'agent-kit', 'package.json')),
    'AppImage is missing the bundled agent kit',
  );
  const browserHelper = path.join(
    extractedRoot,
    'resources',
    'agent-kit',
    'node_modules',
    'open-browser-use',
    'native',
    'linux-amd64',
    'open-browser-use',
  );
  assert.ok(fs.existsSync(browserHelper), 'AppImage is missing the Linux browser-use helper');
  assert.ok((fs.statSync(browserHelper).mode & 0o111) !== 0, 'Linux browser-use helper is not executable');
  assert.ok(
    fs.existsSync(path.join(extractedRoot, 'resources', 'legal', 'THIRD_PARTY_LICENSES.linux-x64.txt')),
    'AppImage is missing the Linux third-party license inventory',
  );
} finally {
  fs.rmSync(extractionDirectory, { recursive: true, force: true });
}

console.log(`[linux-package] validated ${path.basename(appImage)} and ${path.basename(deb)}`);
