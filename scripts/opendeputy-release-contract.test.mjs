import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  assert.equal(electronPackage.build.publish.owner, 'sinabrm');
  assert.equal(electronPackage.build.publish.repo, 'open-deputy');

  const resources = electronPackage.build.extraResources.map((entry) => entry.to);
  for (const expected of [
    'web-dist',
    'opencode-cli',
    'open-computer-use',
    'touchpoint-runtime',
    'agent-kit',
    'icons/icon.ico',
    'icons/tray',
    'legal/LICENSE',
    'legal/THIRD_PARTY_NOTICES.md',
    'legal/THIRD_PARTY_LICENSES.txt',
    'legal/OPEN_SOURCE_COMPONENTS.md',
    'legal/third-party',
  ]) {
    assert.ok(resources.includes(expected), `missing packaged resource: ${expected}`);
  }
});

test('repository ownership and release automation are OpenDeputy-only', () => {
  assert.match(read('.github/CODEOWNERS'), /@sinabrm/);
  assert.doesNotMatch(read('SECURITY.md'), /security@openchamber\.dev|@btriapitsyn/);

  const workflowDirectory = path.join(root, '.github/workflows');
  const workflows = fs.readdirSync(workflowDirectory).sort();
  assert.deepEqual(workflows, ['ci.yml', 'windows-release.yml']);
  const releaseWorkflow = read('.github/workflows/windows-release.yml');
  assert.match(releaseWorkflow, /runs-on: windows-latest/);
  assert.match(releaseWorkflow, /draft: true/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /THIRD_PARTY_LICENSES\.txt/);
  assert.match(releaseWorkflow, /OPEN_SOURCE_COMPONENTS\.md/);
  assert.match(releaseWorkflow, /legal\/third-party/);
});

test('green main pushes create short-lived private Windows artifacts', () => {
  const ciWorkflow = read('.github/workflows/ci.yml');
  const packagingScript = read('packages/electron/scripts/package.mjs');
  const packageVerifier = read('scripts/test-windows-package.ps1');
  assert.match(ciWorkflow, /contents: read/);
  assert.match(ciWorkflow, /cancel-in-progress: true/);
  assert.match(ciWorkflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(ciWorkflow, /needs: \[validate, validate-docker\]/);
  assert.match(ciWorkflow, /bun run electron:build/);
  assert.match(ciWorkflow, /bun run test:windows-package/);
  assert.match(ciWorkflow, /actions\/upload-artifact@v4/);
  assert.match(ciWorkflow, /retention-days: 7/);
  assert.match(ciWorkflow, /compression-level: 0/);
  assert.match(ciWorkflow, /THIRD_PARTY_LICENSES\.txt/);
  assert.doesNotMatch(ciWorkflow, /action-gh-release|release create/);
  assert.match(packagingScript, /builderArgs\.push\('--publish=never'\)/);
  assert.match(packagingScript, /argument === '--publish'/);
  assert.match(packageVerifier, /System\.Security\.Cryptography\.SHA256/);
  assert.doesNotMatch(packageVerifier, /Get-FileHash/);
});

test('tracked environment secrets are excluded', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.equal(fs.existsSync(path.join(root, '.env.example')), true);

  const gitCandidates = process.platform === 'win32'
    ? ['git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe']
    : ['git'];
  let result = null;
  for (const candidate of gitCandidates) {
    result = spawnSync(candidate, ['ls-files', '--', '.env'], { cwd: root, encoding: 'utf8' });
    if (!result.error) break;
  }
  assert.equal(result?.status, 0, result?.error?.message || result?.stderr || 'git ls-files failed');
  assert.equal(result.stdout.trim(), '', '.env must never be tracked');
});

test('external runtime installers use reviewed exact versions and platform gates', () => {
  const dockerfile = read('Dockerfile');
  const optionalToolsInstaller = read('scripts/install-optional-windows-tools.ps1');

  assert.match(dockerfile, /npm install -g opencode-ai@1\.18\.18/);
  assert.match(dockerfile, /--target=docker-linux-x64/);
  assert.match(dockerfile, /THIRD_PARTY_LICENSES\.docker-linux-x64\.txt/);
  assert.match(dockerfile, /\/usr\/share\/licenses\/opendeputy/);
  assert.match(optionalToolsInstaller, /\$piperVersion = '1\.7\.0'/);
  assert.match(optionalToolsInstaller, /piper-tts==\$piperVersion/);
  assert.match(optionalToolsInstaller, /GPL-3\.0-or-later/);
  assert.match(optionalToolsInstaller, /RuntimeInformation\]::OSArchitecture/);
  assert.match(optionalToolsInstaller, /\$windowsArchitecture -ne 'X64'/);
  assert.match(optionalToolsInstaller, /OPENDEPUTY_PIPER_BINARY/);
});

test('component documentation follows the exact shipped dependency pins', () => {
  const rootPackage = json('package.json');
  const electronPackage = json('packages/electron/package.json');
  const agentKitPackage = json('packages/electron/agent-kit/package.json');
  const webPackage = json('packages/web/package.json');
  const notices = read('THIRD_PARTY_NOTICES.md');
  const componentMap = read('docs/OPEN_SOURCE_COMPONENTS.md');
  const dockerfile = read('Dockerfile');

  const openCode = rootPackage.dependencies['@opencode-ai/sdk'];
  const openComputerUse = electronPackage.dependencies['open-computer-use'];
  const playwrightMcp = agentKitPackage.dependencies['@playwright/mcp'];
  const openBrowserUse = agentKitPackage.dependencies['open-browser-use'];
  const computerUseMcp = agentKitPackage.dependencies['@zavora-ai/computer-use-mcp'];
  const touchpointRequirements = read('packages/electron/touchpoint-requirements.txt');
  const sherpa = webPackage.dependencies['sherpa-onnx-node'];
  for (const [name, version] of [
    ['OpenCode', openCode],
    ['Open Computer Use', openComputerUse],
    ['Playwright MCP', playwrightMcp],
    ['Open Browser Use', openBrowserUse],
    ['computer-use-mcp', computerUseMcp],
    ['TouchPoint', '0.3.0'],
    ['sherpa-onnx', sherpa],
  ]) {
    assert.ok(componentMap.includes(version), `${name} ${version} is missing from the component map`);
    assert.ok(notices.includes(version), `${name} ${version} is missing from third-party notices`);
  }
  assert.ok(dockerfile.includes(`opencode-ai@${openCode}`), 'Docker OpenCode pin differs from the SDK pin');
  assert.match(touchpointRequirements, /^touchpoint-py==0\.3\.0$/m);
});

test('CI builds the Linux x64 image and checks its artifact-specific legal bundle', () => {
  const ciWorkflow = read('.github/workflows/ci.yml');

  assert.match(ciWorkflow, /docker build --platform linux\/amd64 --tag opendeputy:ci/);
  assert.match(ciWorkflow, /THIRD_PARTY_LICENSES\.docker-linux-x64\.txt/);
  assert.match(ciWorkflow, /third-party\/OpenCode-1\.18\.18-LICENSE\.txt/);
  assert.match(ciWorkflow, /! grep -q "\^electron@"/);
});

test('required Windows release documentation exists', () => {
  for (const relativePath of [
    'docs/WINDOWS_INSTALL.md',
    'docs/OPTIONAL_TOOLS.md',
    'docs/SAFETY_AND_PRIVACY.md',
    'CONTRIBUTING.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'THIRD_PARTY_LICENSES.txt',
    'docs/OPEN_SOURCE_COMPONENTS.md',
    'legal/third-party/README.md',
    'legal/third-party/OpenCode-1.18.18-LICENSE.txt',
    'legal/third-party/Apache-2.0-LICENSE.txt',
    'legal/third-party/Flexoki-8d723bac-LICENSE.txt',
    'legal/third-party/Vitesse-2862595c-LICENSE.txt',
    'legal/third-party/Remix-Icon-4.9.0-LICENSE.txt',
    'UPSTREAM_CHANGELOG.md',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `missing ${relativePath}`);
  }
});

test('generated third-party license inventory is current and release-scoped', () => {
  const rootPackage = json('package.json');
  for (const scriptName of ['test', 'test:release-contract', 'licenses:generate', 'licenses:check']) {
    assert.match(
      rootPackage.scripts[scriptName],
      /bun run prepare:agent-kit/,
      `${scriptName} must prepare the managed agent kit before checking its shipped dependencies`,
    );
  }
  const electronPackage = json('packages/electron/package.json');
  assert.ok(
    electronPackage.scripts.package.indexOf('bun run prepare:agent-kit')
      < electronPackage.scripts.package.indexOf('generate-third-party-licenses.mjs'),
    'Electron packaging must prepare the managed agent kit before checking its license inventory',
  );

  const result = spawnSync(process.execPath, [
    'scripts/generate-third-party-licenses.mjs',
    '--target=windows-x64',
    '--check',
  ], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const report = read('THIRD_PARTY_LICENSES.txt');
  assert.match(report, /^OpenDeputy Third-Party Dependency License Inventory \(windows-x64\)$/m);
  for (const dependency of [
    'electron@',
    'open-computer-use@',
    '@playwright/mcp@',
    'open-browser-use@',
    '@zavora-ai/computer-use-mcp@',
    'sherpa-onnx-node@',
    '@opencode-ai/sdk@',
    '@remixicon/react@',
    'workbox-window@',
  ]) {
    assert.ok(report.includes(`\n${dependency}`), `missing shipped dependency: ${dependency}`);
  }
  assert.doesNotMatch(report, /^electron-builder@/m);
  assert.doesNotMatch(report, /License: \(not declared\)/);
  assert.match(report, /Reviewed exception:/);
});

test('fork license preserves upstream and OpenDeputy contributor notices', () => {
  const license = read('LICENSE');

  assert.match(license, /Copyright \(c\) 2025 Bohdan Triapitsyn/);
  assert.match(license, /Copyright \(c\) 2026 OpenDeputy contributors/);
  assert.equal(read('packages/web/LICENSE'), license);
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
