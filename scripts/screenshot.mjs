// Regenerates docs/screenshot.png for the README: four painted "photos" dropped into the app.
//   npm run screenshot            (PW_CHANNEL=msedge or chrome to use an installed browser)
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(root, 'app', 'index.html')).href);
await page.waitForFunction(() => !!window.__collage);

await page.evaluate(async () => {
  const W = 1600, H = 1200;
  const grad = (x, stops, x0, y0, x1, y1) => {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  };
  const ridge = (x, base, amp, freq, phase, color) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0, H);
    for (let i = 0; i <= W; i += 8) {
      x.lineTo(i, base + Math.sin(i / freq + phase) * amp + Math.sin(i / (freq / 2.7) + phase * 2) * amp * 0.35);
    }
    x.lineTo(W, H);
    x.fill();
  };
  const scenes = {
    sunset(x) {
      x.fillStyle = grad(x, [[0, '#2b1055'], [0.45, '#d53369'], [0.75, '#f5a25d'], [1, '#fcd784']], 0, 0, 0, H);
      x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(255, 236, 170, .95)';
      x.beginPath(); x.arc(1050, 700, 150, 0, Math.PI * 2); x.fill();
      ridge(x, 760, 60, 240, 0.4, '#7a2e5c');
      ridge(x, 880, 50, 190, 1.9, '#4a1f45');
      ridge(x, 1010, 40, 150, 3.1, '#26122b');
    },
    ocean(x) {
      x.fillStyle = grad(x, [[0, '#74b9ff'], [1, '#dff3ff']], 0, 0, 0, 640);
      x.fillRect(0, 0, W, 640);
      x.fillStyle = grad(x, [[0, '#0f6ba8'], [1, '#063a5c']], 0, 640, 0, H);
      x.fillRect(0, 640, W, H - 640);
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 5;
      for (let r = 0; r < 9; r++) {
        x.beginPath();
        const y = 700 + r * 55;
        for (let i = 0; i <= W; i += 10) x.lineTo(i, y + Math.sin(i / 38 + r) * 5);
        x.stroke();
      }
      x.fillStyle = '#fff';
      x.beginPath(); x.moveTo(760, 330); x.lineTo(760, 610); x.lineTo(600, 610); x.fill();
      x.beginPath(); x.moveTo(780, 380); x.lineTo(780, 610); x.lineTo(900, 610); x.fill();
      x.fillStyle = '#2d3436';
      x.beginPath(); x.moveTo(570, 625); x.lineTo(930, 625); x.lineTo(880, 670); x.lineTo(620, 670); x.fill();
      x.fillStyle = 'rgba(255,255,255,.85)';
      [[250, 180, 60], [330, 160, 80], [420, 185, 55], [1200, 250, 70], [1290, 230, 90]].forEach(([cx, cy, r]) => {
        x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      });
    },
    mountains(x) {
      x.fillStyle = grad(x, [[0, '#a8e0ff'], [1, '#eef9ff']], 0, 0, 0, H);
      x.fillRect(0, 0, W, H);
      const peak = (px, py, w, color, snow) => {
        x.fillStyle = color;
        x.beginPath(); x.moveTo(px - w, H); x.lineTo(px, py); x.lineTo(px + w, H); x.fill();
        x.fillStyle = snow;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px - w * 0.18, py + 120); x.lineTo(px - w * 0.06, py + 95);
        x.lineTo(px + w * 0.05, py + 125); x.lineTo(px + w * 0.18, py + 120); x.fill();
      };
      peak(450, 260, 700, '#6c7a89', '#ffffff');
      peak(1150, 330, 650, '#57606f', '#f1f2f6');
      x.fillStyle = '#2e5e3e';
      for (let i = 0; i < 26; i++) {
        const tx = 30 + i * 62, ty = 930 + (i % 3) * 30, s = 1 + (i % 4) * 0.15;
        x.beginPath(); x.moveTo(tx, ty - 190 * s); x.lineTo(tx - 55 * s, ty); x.lineTo(tx + 55 * s, ty); x.fill();
      }
      x.fillStyle = '#1e3d2a';
      x.fillRect(0, 1010, W, H - 1010);
    },
    desert(x) {
      x.fillStyle = grad(x, [[0, '#0b1d3a'], [0.6, '#27466e'], [1, '#6a5a8c']], 0, 0, 0, H);
      x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 160; i++) {
        const sx = (i * 977) % W, sy = (i * 571) % 700, r = (i % 5 === 0) ? 3 : 1.6;
        x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = '#fdf6d8';
      x.beginPath(); x.arc(1180, 260, 95, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#27466e';
      x.beginPath(); x.arc(1215, 235, 85, 0, Math.PI * 2); x.fill();
      ridge(x, 860, 70, 300, 0.2, '#c98b52');
      ridge(x, 980, 55, 230, 2.4, '#a8663a');
      ridge(x, 1090, 35, 170, 4.0, '#7d4527');
    },
  };
  const files = [];
  for (const [name, paint] of Object.entries(scenes)) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    paint(c.getContext('2d'));
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    files.push(new File([blob], `${Object.keys(scenes).indexOf(name) + 1}-${name}.jpg`, { type: 'image/jpeg' }));
  }
  await window.__collage.addFiles(files);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.waitForTimeout(300);
await mkdir(join(root, 'docs'), { recursive: true });
await page.screenshot({ path: join(root, 'docs', 'screenshot.png') });
await browser.close();
console.log('Wrote docs/screenshot.png');
