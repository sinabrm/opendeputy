import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLinuxDesktopEntry,
  registerLinuxDesktopIntegration,
  resolveLinuxAppImagePath,
  resolveLinuxDesktopIntegrationPaths,
} from './linux-desktop-integration.mjs';

test('resolves the AppImage path only from an absolute APPIMAGE value', () => {
  assert.equal(
    resolveLinuxAppImagePath({ env: { APPIMAGE: '/home/user/Open Deputy.AppImage' } }),
    '/home/user/Open Deputy.AppImage',
  );
  assert.equal(resolveLinuxAppImagePath({ env: { APPIMAGE: 'OpenDeputy.AppImage' } }), '');
});

test('uses XDG data home for the application menu and icon', () => {
  const paths = resolveLinuxDesktopIntegrationPaths({
    env: { XDG_DATA_HOME: '/tmp/open-deputy-data' },
    homeDir: '/home/user',
  });
  assert.equal(paths.desktopFilePath, '/tmp/open-deputy-data/applications/opendeputy.desktop');
  assert.equal(paths.iconPath, '/tmp/open-deputy-data/icons/hicolor/256x256/apps/opendeputy.png');
});

test('does not register into a Snap terminal private data directory', () => {
  const paths = resolveLinuxDesktopIntegrationPaths({
    env: { XDG_DATA_HOME: '/home/user/snap/code/260/.local/share' },
    homeDir: '/home/user',
  });
  assert.equal(paths.desktopFilePath, '/home/user/.local/share/applications/opendeputy.desktop');
});

test('builds a desktop entry that launches the AppImage and preserves spaces', () => {
  const entry = buildLinuxDesktopEntry({
    appImagePath: '/home/user/Open Deputy.AppImage',
    iconPath: '/home/user/.local/share/icons/opendeputy.png',
    appVersion: '1.19.0',
  });
  assert.match(entry, /^Type=Application$/m);
  assert.match(entry, /^Name=OpenDeputy$/m);
  assert.match(entry, /^Exec="\/home\/user\/Open Deputy\.AppImage" %U$/m);
  assert.match(entry, /^Icon=\/home\/user\/\.local\/share\/icons\/opendeputy\.png$/m);
  assert.match(entry, /^X-AppImage-Version=1\.19\.0$/m);
});

test('can use the AppImage extraction fallback when FUSE is unavailable', () => {
  const entry = buildLinuxDesktopEntry({
    appImagePath: '/home/user/Open Deputy.AppImage',
    iconPath: '/home/user/.local/share/icons/opendeputy.png',
    launchWithExtraction: true,
  });
  assert.match(entry, /^Exec="\/home\/user\/Open Deputy\.AppImage" --appimage-extract-and-run %U$/m);
});

test('registers a first-run AppImage desktop entry and icon', async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opendeputy-desktop-'));
  const appImagePath = path.join(homeDir, 'Open Deputy.AppImage');
  const iconSourcePath = path.join(homeDir, 'source-icon.png');
  const env = { APPIMAGE: appImagePath, XDG_DATA_HOME: path.join(homeDir, 'data') };

  try {
    await fs.writeFile(appImagePath, 'appimage');
    await fs.chmod(appImagePath, 0o755);
    await fs.writeFile(iconSourcePath, 'icon');

    const result = await registerLinuxDesktopIntegration({
      env,
      homeDir,
      iconSourcePath,
      appVersion: '1.19.0',
      launchWithExtraction: true,
    });
    assert.equal(result.registered, true);
    assert.equal(await fs.readFile(result.iconPath, 'utf8'), 'icon');
    const desktopEntry = await fs.readFile(result.desktopFilePath, 'utf8');
    assert.match(desktopEntry, /Exec=".*Open Deputy\.AppImage" --appimage-extract-and-run %U/);
    assert.match(desktopEntry, /Icon=.*opendeputy\.png/);
  } finally {
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});
