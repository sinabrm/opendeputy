import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'docs', 'brand', 'open-deputy-logo.svg');
const master = await fs.readFile(masterPath);

const glyphSvg = ({ doorway = '#211f1f', cursor = '#b9b9bf', opacity = 1 } = {}) => Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g opacity="${opacity}">
    <path d="M214 178H810V610L656 462V326H418V714H530V846H214Z" fill="${doorway}"/>
    <path d="M564 488L820 742H678L564 856Z" fill="${cursor}"/>
  </g>
</svg>`);

const writeSvg = async (relativePath, data) => {
  const output = path.join(root, relativePath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, data);
};

const writePng = async (relativePath, size, source = master) => {
  const output = path.join(root, relativePath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await sharp(source).resize(size, size).png().toFile(output);
};

const createIco = (png) => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
};

const electronIcons = 'packages/electron/resources/icons';
await writeSvg(`${electronIcons}/app-icon.svg`, master);
await writeSvg(`${electronIcons}/icon-win.svg`, master);
await writePng(`${electronIcons}/app-icon.png`, 1024);
await writePng(`${electronIcons}/icon.png`, 512);
await writePng(`${electronIcons}/dev-icon.png`, 512);
const winPng = await sharp(master).resize(256, 256).png().toBuffer();
await fs.writeFile(path.join(root, electronIcons, 'icon.ico'), createIco(winPng));

const webPublic = 'packages/web/public';
await writeSvg(`${webPublic}/favicon.svg`, glyphSvg());
await writeSvg(`${webPublic}/apple-touch-icon.svg`, master);
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

console.log('Generated OpenDeputy brand assets.');
