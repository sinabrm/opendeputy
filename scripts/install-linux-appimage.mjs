#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { registerLinuxDesktopIntegration } from '../packages/electron/linux-desktop-integration.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const electronPackagePath = path.join(repositoryRoot, 'packages', 'electron', 'package.json');
const distributionDirectory = path.join(repositoryRoot, 'packages', 'electron', 'dist');
const iconSourcePath = path.join(
  repositoryRoot,
  'packages',
  'electron',
  'resources',
  'icons',
  'icon.png',
);

const packageVersion = JSON.parse(await fsp.readFile(electronPackagePath, 'utf8')).version;

const findDefaultAppImage = async () => {
  const entries = await fsp.readdir(distributionDirectory, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^OpenDeputy-.*-linux-x86_64\.AppImage$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return candidates.length > 0 ? path.join(distributionDirectory, candidates.at(-1)) : '';
};

const appImageArgument = process.argv[2] || process.env.OPENDEPUTY_APPIMAGE || await findDefaultAppImage();
if (!appImageArgument) {
  console.error(
    'No Linux AppImage found. Build one with `bun run electron:build:linux`, then run this command again.',
  );
  process.exit(1);
}

const appImagePath = path.resolve(appImageArgument);
if (!fs.existsSync(appImagePath)) {
  console.error(`AppImage not found: ${appImagePath}`);
  process.exit(1);
}
if (!fs.existsSync(iconSourcePath)) {
  console.error(`OpenDeputy icon not found: ${iconSourcePath}`);
  process.exit(1);
}

// AppImage's normal launcher needs libfuse.so.2. On minimal Ubuntu/Debian
// hosts, use the official extraction fallback so the menu item still works
// without requiring a system-wide FUSE package.
const fuseLibraryCandidates = [
  '/lib/x86_64-linux-gnu/libfuse.so.2',
  '/usr/lib/x86_64-linux-gnu/libfuse.so.2',
  '/lib/aarch64-linux-gnu/libfuse.so.2',
  '/usr/lib/aarch64-linux-gnu/libfuse.so.2',
];
const launchWithExtraction = !fuseLibraryCandidates.some((candidate) => fs.existsSync(candidate));

const result = await registerLinuxDesktopIntegration({
  appImagePath,
  iconSourcePath,
  appVersion: packageVersion,
  launchWithExtraction,
});
if (!result.registered) {
  console.error(`Could not register OpenDeputy: ${result.reason}`);
  process.exit(1);
}

const databaseRefresh = spawnSync('update-desktop-database', [result.applicationsDirectory], {
  stdio: 'ignore',
});
if (databaseRefresh.error || databaseRefresh.status !== 0) {
  console.warn('Desktop menu cache refresh was unavailable; the entry should appear after restarting the shell.');
}

console.log(`OpenDeputy added to the application menu: ${result.desktopFilePath}`);
if (launchWithExtraction) {
  console.log('FUSE was not found; the menu entry uses AppImage extraction mode to launch.');
}
