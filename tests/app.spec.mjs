import { expect, test } from '@playwright/test';
import { dropPhotos, installPhotoKit, jpegSize, openApp, readBytes, samplePixels, status } from './helpers.mjs';

const landscape = (n, color) => Array.from({ length: n }, (_, i) => ({ name: `photo-${i + 1}.jpg`, w: 1600, h: 1200, color }));
const nearly = (rgb, target, tol = 12) => rgb.every((v, i) => Math.abs(v - target[i]) <= tol);

// Forces the "download" save path (Firefox and Safari always use it; Chromium would open a Save As dialog).
async function useDownloadSave(page) {
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
}

async function saveViaDownload(page) {
  await useDownloadSave(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#saveBtn').click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: await readBytes(path) };
}

test.describe('Collage Maker', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = await openApp(page);
    await installPhotoKit(page);
  });
  test.afterEach(() => {
    if (errors) expect(errors, 'no page or console errors').toEqual([]);
  });

  test('starts empty with Save disabled', async ({ page }) => {
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#saveBtn')).toBeDisabled();
    await expect(page.locator('#status')).toHaveText('Drop photos to start.');
    await expect(page.locator('#about')).toHaveText(/Collage Maker \d+\.\d+\.\d+/);
  });

  test('four same-shape photos fill a 2x2 grid with nothing cropped', async ({ page }) => {
    await dropPhotos(page, landscape(4));
    await expect(page.locator('#preview')).toBeVisible();
    await expect(page.locator('#saveBtn')).toBeEnabled();
    expect(await status(page)).toMatch(/^4 photos · Fit 7680 × 58\d\d · padding 80 px · nothing cropped$/);
    const counts = await page.evaluate(() => window.__collage.view().counts);
    expect(counts).toEqual([2, 2]);
  });

  test('fixed canvases are exactly 8K', async ({ page }) => {
    await dropPhotos(page, landscape(2));
    const sizes = await page.evaluate(() => ['landscape', 'portrait', 'square'].map((m) => {
      const p = window.__collage.plan(m, 80);
      return [p.W, p.H];
    }));
    expect(sizes).toEqual([[7680, 4320], [4320, 7680], [7680, 7680]]);
  });

  test('saved JPEG is 8K with white borders and even gaps', async ({ page }) => {
    await dropPhotos(page, landscape(2, '#cc3333'));
    await page.locator('#modeSeg button[data-mode="landscape"]').click();
    const { name, bytes } = await saveViaDownload(page);
    expect(name).toMatch(/^collage-\d{8}-\d{6}\.jpg$/);
    expect(jpegSize(bytes)).toEqual({ width: 7680, height: 4320 });

    const rects = await page.evaluate(() => window.__collage.plan('landscape', 80).rects);
    const [a, b] = rects;
    expect(a.x).toBe(80);
    expect(b.x - (a.x + a.w)).toBe(80);
    expect(7680 - (b.x + b.w)).toBe(80);
    const [corner, gap, bottom, inA, inB] = await samplePixels(page, bytes, [
      [40, 40], [a.x + a.w + 40, 2000], [3000, 4320 - 40], [a.x + 400, 2000], [b.x + 400, 2000],
    ]);
    for (const white of [corner, gap, bottom]) expect(nearly(white, [255, 255, 255])).toBe(true);
    expect(nearly(inA, [204, 51, 51], 20)).toBe(true);
    expect(nearly(inB, [204, 51, 51], 20)).toBe(true);
    await expect(page.locator('#status')).toHaveText(/Downloaded collage-.*7680 × 4320/);
  });

  test('padding slider changes the gaps without changing the grid', async ({ page }) => {
    await dropPhotos(page, landscape(4));
    const before = await page.evaluate(() => window.__collage.view().counts.join('+'));
    await page.locator('#pad').evaluate((el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(page.locator('#padVal')).toHaveText('0 px');
    await expect(page.locator('#status')).toContainText('padding 0 px');
    await page.locator('#pad').evaluate((el) => { el.value = '400'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(page.locator('#status')).toContainText('padding 400 px');
    const after = await page.evaluate(() => { window.__collage.render(); return window.__collage.view().counts.join('+'); });
    expect(after).toBe(before);
    const r = await page.evaluate(() => window.__collage.view().rects[0]);
    expect([r.x, r.y]).toEqual([400, 400]);
  });

  test('New clears the canvas and undo brings the photos back', async ({ page }) => {
    await dropPhotos(page, landscape(3));
    await page.locator('#newBtn').click();
    await expect(page.locator('#empty')).toBeVisible();
    await expect(page.locator('#saveBtn')).toBeDisabled();
    await page.evaluate(() => window.__collage.undo());
    await expect(page.locator('#status')).toContainText('Restored 3 photos');
    expect(await page.evaluate(() => window.__collage.state.photos.length)).toBe(3);
  });

  test('right-click removes a photo and undo restores it in place', async ({ page }) => {
    await dropPhotos(page, landscape(3));
    const box = await page.locator('#preview').boundingBox();
    const r = await page.evaluate(() => window.__collage.view().rects[1]);
    const W = await page.evaluate(() => window.__collage.view().W);
    const H = await page.evaluate(() => window.__collage.view().H);
    await page.mouse.click(box.x + (r.x + r.w / 2) * box.width / W, box.y + (r.y + r.h / 2) * box.height / H, { button: 'right' });
    await expect(page.locator('#status')).toContainText('Removed photo-2.jpg');
    expect(await page.evaluate(() => window.__collage.state.photos.map((p) => p.name))).toEqual(['photo-1.jpg', 'photo-3.jpg']);
    await page.evaluate(() => window.__collage.undo());
    expect(await page.evaluate(() => window.__collage.state.photos.map((p) => p.name))).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg']);
  });

  test('dragging one photo onto another swaps them', async ({ page }) => {
    await dropPhotos(page, landscape(4));
    const box = await page.locator('#preview').boundingBox();
    const v = await page.evaluate(() => { const v = window.__collage.view(); return { W: v.W, H: v.H, rects: v.rects }; });
    const centre = (i) => [box.x + (v.rects[i].x + v.rects[i].w / 2) * box.width / v.W,
      box.y + (v.rects[i].y + v.rects[i].h / 2) * box.height / v.H];
    const [x0, y0] = centre(0), [x3, y3] = centre(3);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x3) / 2, (y0 + y3) / 2, { steps: 5 });
    await page.mouse.move(x3, y3, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.__collage.state.photos.map((p) => p.name)))
      .toEqual(['photo-4.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-1.jpg']);
  });

  test('photos are added in natural filename order', async ({ page }) => {
    await dropPhotos(page, ['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg'].map((name) => ({ name, w: 400, h: 300 })));
    expect(await page.evaluate(() => window.__collage.state.photos.map((p) => p.name))).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg']);
  });

  test('EXIF orientation is respected', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // 400x200: red left half, blue right half. Orientation 6 = rotate 90° clockwise -> 200x400, red on top.
      const raw = await window.makePhoto('rotated.jpg', 400, 200, '#ff0000', { half: '#0000ff' });
      window.drop([await window.withOrientation(raw, 6)]);
      await window.settle();
      const p = window.__collage.state.photos[0];
      const c = document.createElement('canvas');
      c.width = p.w; c.height = p.h;
      const x = c.getContext('2d');
      x.drawImage(p.img, 0, 0);
      return { w: p.w, h: p.h, top: Array.from(x.getImageData(100, 50, 1, 1).data.slice(0, 3)), bottom: Array.from(x.getImageData(100, 350, 1, 1).data.slice(0, 3)) };
    });
    expect([result.w, result.h]).toEqual([200, 400]);
    expect(nearly(result.top, [255, 0, 0], 40)).toBe(true);
    expect(nearly(result.bottom, [0, 0, 255], 40)).toBe(true);
  });

  test('unreadable files are reported, not added', async ({ page }) => {
    await page.evaluate(async () => {
      window.drop([new File(['hello'], 'notes.txt', { type: 'text/plain' })]);
      await window.settle();
    });
    await expect(page.locator('#status')).toHaveText(/Skipped 1 file .*notes\.txt/);
    await page.evaluate(async () => {
      window.drop([new File([new Uint8Array([1, 2, 3])], 'broken.jpg', { type: 'image/jpeg' })]);
      await window.settle();
    });
    await expect(page.locator('#status')).toHaveText(/Skipped 1 file .*broken\.jpg/);
    expect(await page.evaluate(() => window.__collage.state.photos.length)).toBe(0);
  });

  test('HEIC files get a helpful message when the browser cannot read them', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Safari can decode real HEIC files');
    await page.evaluate(async () => {
      window.drop([new File([new Uint8Array([0, 0, 0, 24])], 'IMG_0001.HEIC', { type: 'image/heic' })]);
      await window.settle();
    });
    await expect(page.locator('#status')).toContainText('HEIC photos, which this browser cannot open');
  });

  test('dropping a link does not navigate away', async ({ page }) => {
    const prevented = await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/uri-list', 'https://example.com/');
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
    expect(page.url()).toMatch(/index\.html$/);
  });

  test('Save As dialog path writes the JPEG to the chosen file', async ({ page }) => {
    await dropPhotos(page, landscape(2));
    await page.evaluate(() => {
      window.__written = null;
      window.showSaveFilePicker = async (opts) => ({
        name: opts.suggestedName,
        createWritable: async () => ({ write: async (blob) => { window.__written = blob; }, close: async () => {} }),
      });
    });
    await page.locator('#saveBtn').click();
    await expect(page.locator('#status')).toHaveText(/^Saved collage-.*\.jpg \(\d+ × \d+, [\d.]+ MB\)$/);
    const info = await page.evaluate(async () => ({ type: window.__written.type, size: window.__written.size }));
    expect(info.type).toBe('image/jpeg');
    expect(info.size).toBeGreaterThan(10_000);
  });

  test('Save is blocked while photos are still loading', async ({ page }) => {
    await dropPhotos(page, landscape(1));
    const result = await page.evaluate(async () => {
      const big = await window.makePhoto('big.jpg', 4000, 3000);
      const pending = window.__collage.addFiles([big]);
      await new Promise((r) => setTimeout(r, 0));
      const disabled = document.getElementById('saveBtn').disabled;
      await window.__collage.save();
      const msg = document.getElementById('status').textContent;
      await pending;
      return { disabled, msg };
    });
    expect(result.disabled).toBe(true);
    expect(result.msg).toContain('still loading');
  });

  test('keyboard: Enter on the drop area opens the file chooser', async ({ page }) => {
    await page.locator('#empty').focus();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
    expect(chooser.isMultiple()).toBe(true);
  });
});
