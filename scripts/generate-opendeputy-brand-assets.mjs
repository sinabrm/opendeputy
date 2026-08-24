import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectorPath = path.join(root, 'docs', 'brand', 'opendeputy-logo.svg');
const vectorMaster = await fs.readFile(vectorPath, 'utf8');

const themeLogo = ({
  doorway = 'rgb(37,33,32)',
  cursor = 'rgb(188,187,188)',
  edge = 'rgb(68,65,64)',
  opacity = 1,
} = {}) => Buffer.from(
  vectorMaster
    .replace('<svg ', `<svg opacity="${opacity}" `)
    .replaceAll('rgb(37,33,32)', doorway)
    .replaceAll('rgb(188,187,188)', cursor)
    .replaceAll('rgb(68,65,64)', edge),
);

const transparentMaster = themeLogo();

// Desktop shells present application icons as tiles in launchers, taskbars,
// shortcuts, and installers. Keep the brand mark itself unchanged, but place
// it on a high-contrast rounded square so it remains distinct from surrounding
// OS chrome on both light and dark desktops. The transparent outer margin lets
// the rounded corners remain real alpha rather than painted corner pixels.
const appIconArtwork = vectorMaster
  .replaceAll('rgb(37,33,32)', '#ffffff')
  .replaceAll('rgb(68,65,64)', '#ffffff');
const appIconMaster = Buffer.from(
  appIconArtwork.replace(
    /(<svg[^>]*>)([\s\S]*)(<\/svg>)/,
    '$1<rect x="4" y="4" width="504" height="504" rx="60" fill="#000000"/>'
      + '<g transform="translate(256 261) scale(0.96) translate(-256 -257)">$2</g>$3',
  ),
);

const writeSvg = async (relativePath, data) => {
  const output = path.join(root, relativePath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, data);
};

const writePng = async (relativePath, size, source = transparentMaster) => {
  const output = path.join(root, relativePath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await sharp(source).resize(size, size).png().toFile(output);
};

const createIco = (frames) => {
  const headerSize = 6 + (frames.length * 16);
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let imageOffset = headerSize;
  frames.forEach(({ size, png }, index) => {
    const entryOffset = 6 + (index * 16);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(png.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([header, ...frames.map((frame) => frame.png)]);
};

await writePng('docs/brand/opendeputy-logo.png', 2048);

const electronIcons = 'packages/electron/resources/icons';
await writeSvg(`${electronIcons}/app-icon.svg`, appIconMaster);
await writeSvg(`${electronIcons}/icon-win.svg`, appIconMaster);
await writePng(`${electronIcons}/app-icon.png`, 1024, appIconMaster);
await writePng(`${electronIcons}/icon.png`, 512, appIconMaster);
await writePng(`${electronIcons}/dev-icon.png`, 512, appIconMaster);

const windowsIconFrames = await Promise.all([16, 24, 32, 48, 64, 128, 256].map(async (size) => ({
  size,
  png: await sharp(appIconMaster).resize(size, size).png().toBuffer(),
})));
await fs.writeFile(path.join(root, electronIcons, 'icon.ico'), createIco(windowsIconFrames));

const webPublic = 'packages/web/public';
await writeSvg(`${webPublic}/favicon.svg`, themeLogo());
await writeSvg(`${webPublic}/apple-touch-icon.svg`, transparentMaster);
await writeSvg(`${webPublic}/logo-light-512x512.svg`, themeLogo());
await writeSvg(`${webPublic}/logo-dark-512x512.svg`, themeLogo({ doorway: '#ffffff', edge: '#cecdcb' }));
const darkLogo = themeLogo({ doorway: '#ffffff', edge: '#cecdcb' });
for (const [name, size, source] of [
  ['favicon.png', 64], ['favicon-16.png', 16], ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180], ['apple-touch-icon-120x120.png', 120],
  ['apple-touch-icon-152x152.png', 152], ['apple-touch-icon-167x167.png', 167],
  ['apple-touch-icon-180x180.png', 180], ['logo-light-192x192.png', 192],
  ['logo-dark-192x192.png', 192, darkLogo], ['pwa-192.png', 192], ['pwa-512.png', 512],
  ['pwa-maskable-192.png', 192], ['pwa-maskable-512.png', 512],
]) await writePng(`${webPublic}/${name}`, size, source);

await writeSvg('docs/references/badges/opendeputy-logo-light.svg', themeLogo());
await writeSvg('docs/references/badges/opendeputy-logo-dark.svg', themeLogo({ doorway: '#ffffff', edge: '#cecdcb' }));
await writePng('docs/references/badges/opendeputy-logo.png', 512);

const trayDir = `${electronIcons}/tray`;
await writeSvg(`${trayDir}/tray-glyph.svg`, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000' }));
await writePng(`${trayDir}/trayTemplate-idle.png`, 16, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000', opacity: 0.72 }));
await writePng(`${trayDir}/trayTemplate-idle@2x.png`, 32, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000', opacity: 0.72 }));
await writePng(`${trayDir}/trayTemplate-unseen.png`, 16, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000' }));
await writePng(`${trayDir}/trayTemplate-unseen@2x.png`, 32, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000' }));
for (let index = 0; index < 16; index += 1) {
  const opacity = 0.45 + (index / 15) * 0.55;
  const name = String(index).padStart(2, '0');
  await writePng(`${trayDir}/trayTemplate-breath-${name}.png`, 16, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000', opacity }));
  await writePng(`${trayDir}/trayTemplate-breath-${name}@2x.png`, 32, themeLogo({ doorway: '#000000', cursor: '#000000', edge: '#000000', opacity }));
}

console.log('Generated OpenDeputy brand assets from docs/brand/opendeputy-logo.svg.');
