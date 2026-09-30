// Regenerates every raster icon from the two SVG sources in app/icons/.
//
//   npm run icons
//
// Output (all committed to the repo, so this only needs re-running when the SVGs change):
//   app/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png   (web app)
//   packaging/icons/collage-maker.ico                                                   (Windows shortcuts)
//   packaging/icons/collage-maker.icns                                                  (macOS app bundle)
//   packaging/icons/hicolor/<size>.png                                                  (Linux desktop menus)
//
// Uses Playwright's Chromium to rasterise the SVG. Set PW_CHANNEL=msedge or chrome to use an
// installed browser instead of Playwright's own download.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appIcons = join(root, 'app', 'icons');
const pkgIcons = join(root, 'packaging', 'icons');

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(svgFile, size) {
  const svg = (await readFile(join(appIcons, svgFile), 'utf8'))
    .replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// Windows .ico with PNG-compressed entries (supported since Windows Vista).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

// macOS .icns built from PNG elements.
function icns(entries) {
  const parts = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const cache = new Map();
const png = async (file, size) => {
  const key = `${file}@${size}`;
  if (!cache.has(key)) cache.set(key, await render(file, size));
  return cache.get(key);
};

await mkdir(join(pkgIcons, 'hicolor'), { recursive: true });

// Web app icons.
await writeFile(join(appIcons, 'icon-192.png'), await png('icon.svg', 192));
await writeFile(join(appIcons, 'icon-512.png'), await png('icon.svg', 512));
await writeFile(join(appIcons, 'icon-maskable-512.png'), await png('icon-maskable.svg', 512));
await writeFile(join(appIcons, 'apple-touch-icon.png'), await png('icon-maskable.svg', 180));

// Windows.
const icoSizes = [16, 24, 32, 48, 64, 256];
await writeFile(join(pkgIcons, 'collage-maker.ico'),
  ico(await Promise.all(icoSizes.map(async (size) => ({ size, png: await png('icon.svg', size) })))));

// macOS.
const icnsTypes = [['icp4', 16], ['icp5', 32], ['ic11', 32], ['ic12', 64], ['ic07', 128],
  ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024]];
const icnsEntries = [];
for (const [type, size] of icnsTypes) icnsEntries.push({ type, png: await png('icon.svg', size) });
await writeFile(join(pkgIcons, 'collage-maker.icns'), icns(icnsEntries));

// Linux (freedesktop hicolor theme).
for (const size of [48, 64, 128, 256, 512]) {
  await writeFile(join(pkgIcons, 'hicolor', `${size}.png`), await png('icon.svg', size));
}

await browser.close();
console.log('Icons written to app/icons and packaging/icons');
