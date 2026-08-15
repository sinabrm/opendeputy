import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'docs', 'brand', 'open-deputy-logo-source.png');
const vectorPath = path.join(root, 'docs', 'brand', 'open-deputy-logo.svg');
const vectorMaster = await fs.readFile(vectorPath);

const sourceImage = sharp(sourcePath).ensureAlpha();
const { data: sourcePixels, info: sourceInfo } = await sourceImage.raw().toBuffer({ resolveWithObject: true });

// The approved source is opaque artwork on white. Remove only near-white pixels,
// retaining its original dark gradient, grey pointer, geometry, and antialiasing.
for (let offset = 0; offset < sourcePixels.length; offset += 4) {
  const brightness = Math.min(sourcePixels[offset], sourcePixels[offset + 1], sourcePixels[offset + 2]);
  if (brightness >= 235) {
    sourcePixels[offset + 3] = 0;
  } else if (brightness > 210) {
    sourcePixels[offset + 3] = Math.round(((235 - brightness) / 25) * 255);
  } else {
    sourcePixels[offset + 3] = 255;
  }
}

const transparentMaster = await sharp(sourcePixels, {
  raw: {
    width: sourceInfo.width,
    height: sourceInfo.height,
    channels: 4,
  },
}).png().toBuffer();

const glyphSvg = ({ doorway = '#211f1f', cursor = '#b9b9bf', opacity = 1 } = {}) => Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g opacity="${opacity}">
    <path d="M184 130H616V528.5L508 424.5V238.5H292V562H379V670H184Z" fill="${doorway}"/>
    <path d="M419.5 397.5L616 590H501.5L419.5 670Z" fill="${cursor}"/>
  </g>
</svg>`);

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

await fs.writeFile(path.join(root, 'docs', 'brand', 'open-deputy-logo.png'), transparentMaster);

const electronIcons = 'packages/electron/resources/icons';
await writeSvg(`${electronIcons}/app-icon.svg`, vectorMaster);
await writeSvg(`${electronIcons}/icon-win.svg`, vectorMaster);
await writePng(`${electronIcons}/app-icon.png`, 1024);
await writePng(`${electronIcons}/icon.png`, 512);
await writePng(`${electronIcons}/dev-icon.png`, 512);

const windowsIconFrames = await Promise.all([16, 24, 32, 48, 64, 128, 256].map(async (size) => ({
  size,
  png: await sharp(transparentMaster).resize(size, size).png().toBuffer(),
})));
await fs.writeFile(path.join(root, electronIcons, 'icon.ico'), createIco(windowsIconFrames));

const webPublic = 'packages/web/public';
await writeSvg(`${webPublic}/favicon.svg`, glyphSvg());
await writeSvg(`${webPublic}/apple-touch-icon.svg`, vectorMaster);
await writeSvg(`${webPublic}/logo-light-512x512.svg`, glyphSvg());
await writeSvg(`${webPublic}/logo-dark-512x512.svg`, glyphSvg({ doorway: '#ffffff', cursor: '#b9b9bf' }));
for (const [name, size] of [
  ['favicon.png', 64], ['favicon-16.png', 16], ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180], ['apple-touch-icon-120x120.png', 120],
  ['apple-touch-icon-152x152.png', 152], ['apple-touch-icon-167x167.png', 167],
  ['apple-touch-icon-180x180.png', 180], ['logo-light-192x192.png', 192],
  ['logo-dark-192x192.png', 192], ['pwa-192.png', 192], ['pwa-512.png', 512],
  ['pwa-maskable-192.png', 192], ['pwa-maskable-512.png', 512],
]) await writePng(`${webPublic}/${name}`, size);

await writeSvg('docs/references/badges/open-deputy-logo-light.svg', glyphSvg());
await writeSvg('docs/references/badges/open-deputy-logo-dark.svg', glyphSvg({ doorway: '#ffffff', cursor: '#b9b9bf' }));
await writePng('docs/references/badges/open-deputy-logo.png', 512);

const trayDir = `${electronIcons}/tray`;
await writeSvg(`${trayDir}/tray-glyph.svg`, glyphSvg({ doorway: '#000000', cursor: '#000000' }));
await writePng(`${trayDir}/trayTemplate-idle.png`, 16, glyphSvg({ doorway: '#000000', cursor: '#000000', opacity: 0.72 }));
await writePng(`${trayDir}/trayTemplate-idle@2x.png`, 32, glyphSvg({ doorway: '#000000', cursor: '#000000', opacity: 0.72 }));
await writePng(`${trayDir}/trayTemplate-unseen.png`, 16, glyphSvg({ doorway: '#000000', cursor: '#000000' }));
await writePng(`${trayDir}/trayTemplate-unseen@2x.png`, 32, glyphSvg({ doorway: '#000000', cursor: '#000000' }));
for (let index = 0; index < 16; index += 1) {
  const opacity = 0.45 + (index / 15) * 0.55;
  const name = String(index).padStart(2, '0');
  await writePng(`${trayDir}/trayTemplate-breath-${name}.png`, 16, glyphSvg({ doorway: '#000000', cursor: '#000000', opacity }));
  await writePng(`${trayDir}/trayTemplate-breath-${name}@2x.png`, 32, glyphSvg({ doorway: '#000000', cursor: '#000000', opacity }));
}

console.log('Generated OpenDeputy brand assets from docs/brand/open-deputy-logo-source.png.');
