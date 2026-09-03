import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DESKTOP_FILE_NAME = 'opendeputy.desktop';
const ICON_FILE_NAME = 'opendeputy.png';

const resolveXdgDataHome = ({ env = process.env, homeDir = os.homedir() } = {}) => {
  const configured = typeof env.XDG_DATA_HOME === 'string' ? env.XDG_DATA_HOME.trim() : '';
  // Snap-packaged terminals (notably VS Code) export their private
  // XDG_DATA_HOME. GNOME's host shell does not scan that sandbox directory,
  // so an app registered there never appears in the host's application menu.
  // Use the normal per-user data directory in that case.
  const snapPrivateDataHome = /(?:^|\/)snap\/[^/]+\/[^/]+(?:\/\.local\/share)?\/?$/i.test(configured);
  return configured && !snapPrivateDataHome
    ? configured
    : path.join(homeDir || os.homedir(), '.local', 'share');
};

export const resolveLinuxDesktopIntegrationPaths = ({
  env = process.env,
  homeDir = os.homedir(),
} = {}) => {
  const dataHome = resolveXdgDataHome({ env, homeDir });
  return {
    applicationsDirectory: path.join(dataHome, 'applications'),
    desktopFilePath: path.join(dataHome, 'applications', DESKTOP_FILE_NAME),
    iconDirectory: path.join(dataHome, 'icons', 'hicolor', '256x256', 'apps'),
    iconPath: path.join(dataHome, 'icons', 'hicolor', '256x256', 'apps', ICON_FILE_NAME),
  };
};

export const resolveLinuxAppImagePath = ({ env = process.env } = {}) => {
  const appImage = typeof env.APPIMAGE === 'string' ? env.APPIMAGE.trim() : '';
  return appImage && path.isAbsolute(appImage) ? path.resolve(appImage) : '';
};

const quoteDesktopExecArg = (value) => {
  const text = String(value ?? '');
  if (!/[ \t\n"$\\]/.test(text)) return text;
  return `"${text.replace(/(["\\$`])/g, '\\$1')}"`;
};

const escapeDesktopValue = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r');

export const buildLinuxDesktopEntry = ({
  appImagePath,
  iconPath,
  appName = 'OpenDeputy',
  appVersion = '',
  launchWithExtraction = false,
} = {}) => {
  const launchArguments = [quoteDesktopExecArg(appImagePath)];
  if (launchWithExtraction) launchArguments.push('--appimage-extract-and-run');
  launchArguments.push('%U');
  const lines = [
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    `Name=${escapeDesktopValue(appName)}`,
    `Exec=${launchArguments.join(' ')}`,
    `Icon=${escapeDesktopValue(iconPath)}`,
    'Terminal=false',
    'Categories=Development;',
    'StartupWMClass=opendeputy',
    'MimeType=x-scheme-handler/openchamber;',
  ];
  if (String(appVersion).trim()) {
    lines.push(`X-AppImage-Version=${escapeDesktopValue(appVersion)}`);
  }
  lines.push('');
  return lines.join('\n');
};

/**
 * AppImages contain a desktop file, but the file is not installed into the
 * user's application menu. Register the running AppImage on first launch so
 * it behaves like a normally installed Linux desktop application. The entry
 * is refreshed every launch, which also repairs a moved or replaced image.
 */
export const registerLinuxDesktopIntegration = async ({
  env = process.env,
  homeDir = os.homedir(),
  appImagePath = resolveLinuxAppImagePath({ env }),
  iconSourcePath,
  appName = 'OpenDeputy',
  appVersion = '',
  launchWithExtraction = false,
} = {}) => {
  if (!appImagePath || !iconSourcePath) {
    return { registered: false, reason: 'not-an-appimage' };
  }

  let appImageStat;
  try {
    appImageStat = await fsp.stat(appImagePath);
    await fsp.access(appImagePath, fs.constants.X_OK);
  } catch {
    return { registered: false, reason: 'appimage-unavailable' };
  }
  if (!appImageStat.isFile()) {
    return { registered: false, reason: 'appimage-unavailable' };
  }

  const paths = resolveLinuxDesktopIntegrationPaths({ env, homeDir });
  await fsp.mkdir(paths.applicationsDirectory, { recursive: true });
  await fsp.mkdir(paths.iconDirectory, { recursive: true });
  await fsp.copyFile(iconSourcePath, paths.iconPath);
  await fsp.writeFile(paths.desktopFilePath, buildLinuxDesktopEntry({
    appImagePath,
    iconPath: paths.iconPath,
    appName,
    appVersion,
    launchWithExtraction,
  }), { mode: 0o644 });
  await fsp.chmod(paths.desktopFilePath, 0o644);
  await fsp.chmod(paths.iconPath, 0o644);

  return { registered: true, ...paths, appImagePath, launchWithExtraction };
};
