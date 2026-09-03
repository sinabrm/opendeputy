const fs = require('node:fs');
const path = require('node:path');

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
);
const baseBuild = packageJson.build || {};

// The Windows build carries the portable TouchPoint/Python runtime. Linux has
// its own native desktop/browser capabilities and must not require that
// Windows-only resource to be staged before electron-builder runs.
const extraResources = (baseBuild.extraResources || [])
  .filter((entry) => entry?.to !== 'touchpoint-runtime')
  .filter((entry) => entry?.to !== 'legal/THIRD_PARTY_LICENSES.txt')
  .map((entry) => {
    if (entry?.from !== 'agent-kit/node_modules') return entry;

    // The Windows build excludes Linux native helpers. Keep the Linux
    // binaries in this target and discard the other platform variants.
    return {
      ...entry,
      filter: [
        '**/*',
        '!open-browser-use/native/darwin-*/**/*',
        '!open-browser-use/native/windows-*/**/*',
        '!@zavora-ai/computer-use-mcp/*.darwin-*.node',
        '!@zavora-ai/computer-use-mcp/*.win32-*.node',
      ],
    };
  })
  .concat({
    from: '../../THIRD_PARTY_LICENSES.linux-x64.txt',
    to: 'legal/THIRD_PARTY_LICENSES.linux-x64.txt',
  });

module.exports = {
  ...baseBuild,
  extraResources,
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    executableName: 'opendeputy',
    syncDesktopName: true,
    category: 'Development',
    icon: 'resources/icons/app-icon.png',
    artifactName: 'OpenDeputy-${version}-linux-${arch}.${ext}',
    synopsis: 'Open-source AI coworker for projects and desktop work',
    description: 'OpenDeputy combines OpenCode agents with a visual Linux desktop workspace.',
  },
  appImage: {
    artifactName: 'OpenDeputy-${version}-linux-${arch}.${ext}',
  },
  deb: {
    artifactName: 'OpenDeputy-${version}-linux-${arch}.${ext}',
    maintainer: 'OpenDeputy contributors <noreply@github.com>',
  },
};
