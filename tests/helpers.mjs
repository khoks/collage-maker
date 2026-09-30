// Shared helpers for the end-to-end tests. Test photos are generated inside the page with a
// canvas, so the suite needs no image fixtures.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const APP_URL = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'index.html')).href;

// Opens the app and records page errors and console errors so tests can assert there were none.
export async function openApp(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(APP_URL);
  await page.waitForFunction(() => !!window.__collage);
  return errors;
}

// Installs page-side helpers: makePhoto() builds a JPEG File of a given size and colour,
// withOrientation() adds an EXIF orientation tag, drop() fires a real drop event on the window.
export async function installPhotoKit(page) {
  await page.evaluate(() => {
    window.makePhoto = async (name, w, h, color = '#3366cc', { half } = {}) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      if (half) { x.fillStyle = half; x.fillRect(w / 2, 0, w / 2, h); }
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
      return new File([blob], name, { type: 'image/jpeg' });
    };
    // Inserts a minimal little-endian EXIF block with one Orientation entry right after the SOI marker.
    window.withOrientation = async (file, orientation) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00,
        0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
      const len = 2 + exif.length + tiff.length;
      const app1 = [0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...exif, ...tiff];
      const out = new Uint8Array(bytes.length + app1.length);
      out.set(bytes.subarray(0, 2), 0);
      out.set(app1, 2);
      out.set(bytes.subarray(2), 2 + app1.length);
      return new File([out], file.name, { type: 'image/jpeg' });
    };
    window.drop = (files) => {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    // Waits until every queued drop has been decoded and the preview repainted.
    window.settle = async () => {
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 25));
        if (!document.body.classList.contains('busy')) break;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    };
  });
}

// Drops `count` photos of the given size (built in the page) and waits for them to load.
export async function dropPhotos(page, specs) {
  await page.evaluate(async (list) => {
    const files = [];
    for (const s of list) files.push(await window.makePhoto(s.name, s.w, s.h, s.color));
    window.drop(files);
    await window.settle();
  }, specs);
}

export const status = (page) => page.locator('#status').textContent();

// Reads width and height from a JPEG's SOF marker.
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

// Decodes a JPEG in the page and returns RGB values at the given points.
export async function samplePixels(page, buf, points) {
  return page.evaluate(async ({ b64, pts }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    return pts.map(([px, py]) => Array.from(x.getImageData(px, py, 1, 1).data.slice(0, 3)));
  }, { b64: buf.toString('base64'), pts: points });
}

export const readBytes = (path) => readFile(path);
