import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PLATFORM_DIRECTORY = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const ARCHITECTURE_DIRECTORY = {
  arm64: 'arm64',
  x64: 'amd64',
};

export const resolveOpenBrowserUseBinary = ({
  root,
  platform = process.platform,
  architecture = process.arch,
  binaryExists = existsSync,
}) => {
  const platformDirectory = PLATFORM_DIRECTORY[platform];
  const architectureDirectory = ARCHITECTURE_DIRECTORY[architecture];
  if (!platformDirectory || !architectureDirectory) {
    throw new Error(`open-browser-use does not ship a binary for ${platform}/${architecture}`);
  }

  const executable = platform === 'win32' ? 'open-browser-use.exe' : 'open-browser-use';
  const binaryPath = path.join(
    root,
    'node_modules',
    'open-browser-use',
    'native',
    `${platformDirectory}-${architectureDirectory}`,
    executable,
  );
  if (!binaryExists(binaryPath)) {
    throw new Error(`open-browser-use binary is missing for ${platform}/${architecture}: ${binaryPath}`);
  }
  return binaryPath;
};

export const spawnOpenBrowserUse = ({
  root,
  args,
  platform = process.platform,
  architecture = process.arch,
  environment = process.env,
  binaryExists = existsSync,
  spawnProcess = spawn,
}) => {
  const binaryPath = resolveOpenBrowserUseBinary({
    root,
    platform,
    architecture,
    binaryExists,
  });

  return spawnProcess(binaryPath, args, {
    env: environment,
    stdio: 'inherit',
    windowsHide: platform === 'win32',
  });
};
