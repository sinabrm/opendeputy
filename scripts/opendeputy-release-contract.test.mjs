import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));

test('release scope contains desktop web and UI workspaces only', () => {
  const packageJson = json('package.json');
  const scripts = JSON.stringify(packageJson.scripts);
  assert.equal(fs.existsSync(path.join(root, 'packages/mobile/package.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'packages/vscode/package.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'packages/docs/package.json')), false);
  assert.doesNotMatch(scripts, /mobile|vscode/i);
  for (const workspace of ['electron', 'web', 'ui']) {
    assert.equal(fs.existsSync(path.join(root, `packages/${workspace}/package.json`)), true);
  }
});

test('Windows package is branded and self-contained', () => {
  const electronPackage = json('packages/electron/package.json');
  assert.equal(electronPackage.name, 'open-deputy');
  assert.equal(electronPackage.build.appId, 'com.ghostblinkcode.opendeputy');
  assert.equal(electronPackage.build.productName, 'OpenDeputy');
  assert.deepEqual(Object.keys(electronPackage.build).filter((key) => ['mac', 'linux'].includes(key)), []);
  assert.equal(electronPackage.build.publish.owner, 'GhostBlinkCode');
  assert.equal(electronPackage.build.publish.repo, 'open-deputy');

  const resources = electronPackage.build.extraResources.map((entry) => entry.to);
  for (const expected of ['web-dist', 'opencode-cli', 'open-computer-use', 'icons/icon.ico', 'icons/tray']) {
    assert.ok(resources.includes(expected), `missing packaged resource: ${expected}`);
  }
});

test('repository ownership and release automation are OpenDeputy-only', () => {
  assert.match(read('.github/CODEOWNERS'), /@GhostBlinkCode/);
  assert.doesNotMatch(read('SECURITY.md'), /security@openchamber\.dev|@btriapitsyn/);

  const workflowDirectory = path.join(root, '.github/workflows');
  const workflows = fs.readdirSync(workflowDirectory).sort();
  assert.deepEqual(workflows, ['ci.yml', 'windows-release.yml']);
  const releaseWorkflow = read('.github/workflows/windows-release.yml');
  assert.match(releaseWorkflow, /runs-on: windows-latest/);
  assert.match(releaseWorkflow, /draft: true/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
});

test('tracked environment secrets are excluded', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.equal(fs.existsSync(path.join(root, '.env.example')), true);
});

test('required Windows release documentation exists', () => {
  for (const relativePath of [
    'docs/WINDOWS_INSTALL.md',
    'docs/OPTIONAL_TOOLS.md',
    'docs/SAFETY_AND_PRIVACY.md',
    'CONTRIBUTING.md',
    'THIRD_PARTY_NOTICES.md',
    'UPSTREAM_CHANGELOG.md',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `missing ${relativePath}`);
  }
});

test('Persian and Unicode text round-trip without conversion', () => {
  const message = 'سلام، OpenDeputy می‌تواند متن فارسی را بدون تغییر نگه دارد.';
  const roundTrip = JSON.parse(JSON.stringify({ message }));
  assert.equal(roundTrip.message, message);
  assert.equal(Buffer.from(message, 'utf8').toString('utf8'), message);
});

test('Windows icon includes common native sizes', () => {
  const icon = fs.readFileSync(path.join(root, 'packages/electron/resources/icons/icon.ico'));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4);
  assert.ok(count >= 7, `expected at least 7 icon frames, found ${count}`);
  const sizes = new Set();
  for (let index = 0; index < count; index += 1) {
    const width = icon.readUInt8(6 + (index * 16)) || 256;
    const height = icon.readUInt8(7 + (index * 16)) || 256;
    assert.equal(width, height);
    sizes.add(width);
  }
  for (const expected of [16, 24, 32, 48, 64, 128, 256]) {
    assert.ok(sizes.has(expected), `missing ${expected}x${expected} icon frame`);
  }
});
