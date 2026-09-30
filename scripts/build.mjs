// Builds the release files into dist/:
//
//   collage-maker.tar.gz   portable bundle for macOS/Linux (Homebrew, install.sh)
//   collage-maker.zip      portable bundle for Windows (Scoop, install.ps1) and anyone who just wants the files
//   collage-maker.deb      Debian/Ubuntu package (sudo apt install ./collage-maker.deb)
//   SHA256SUMS
//
//   node scripts/build.mjs           build
//   node scripts/build.mjs --check   only check that every file agrees on the version in VERSION
//
// No dependencies: tar, zip and ar archives are written directly, so this runs the same on any OS.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { VERSION_SITES } from './versions.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(join(root, p));
const readText = async (p) => (await read(p)).toString('utf8');

const REPO = 'https://github.com/khoks/collage-maker';
const MAINTAINER = 'Rahul Singh Khokhar <rahulsinghkhokhar@gmail.com>';

// ---------------------------------------------------------------- version check
const VERSION = (await readText('VERSION')).trim();
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error(`VERSION must look like 1.2.3, got "${VERSION}"`);


async function checkVersions() {
  const problems = [];
  for (const [file, re] of VERSION_SITES) {
    const m = (await readText(file)).match(re);
    if (!m) problems.push(`${file}: no version found`);
    else if (m[1] !== VERSION) problems.push(`${file}: has ${m[1]}, VERSION says ${VERSION}`);
  }
  if (!(await readText('CHANGELOG.md')).includes(`## [${VERSION}]`)) problems.push(`CHANGELOG.md: no "## [${VERSION}]" section`);
  if (problems.length) {
    throw new Error(`Version mismatch (run "npm run set-version -- ${VERSION}"):\n  ${problems.join('\n  ')}`);
  }
}
await checkVersions();
if (process.argv.includes('--check')) {
  console.log(`All files agree on version ${VERSION}.`);
  process.exit(0);
}

// ---------------------------------------------------------------- timestamps
// Use the last commit time so repeated builds of the same commit produce identical archives.
function buildTime() {
  if (process.env.SOURCE_DATE_EPOCH) return Number(process.env.SOURCE_DATE_EPOCH);
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^\d+$/.test(out)) return Number(out);
    return Math.floor(Date.now() / 1000);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}
const MTIME = buildTime();

// ---------------------------------------------------------------- file tree
// Entries: { path, data?, mode, type: 'file' | 'dir' | 'symlink', target? }
const file = (path, data, mode = 0o644) => ({ path, data: Buffer.from(data), mode, type: 'file' });
const crlf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r?\n/g, '\r\n'));
const lf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'));

function withDirs(entries) {
  const dirs = new Set();
  for (const e of entries) {
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const dirEntries = [...dirs].filter((d) => d && d !== '.').map((d) => ({ path: d, mode: 0o755, type: 'dir' }));
  return [...dirEntries, ...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const top = `collage-maker-${VERSION}`;
const icons = {
  svg: await read('app/icons/icon.svg'),
  png: await read('packaging/icons/hicolor/512.png'),
  ico: await read('packaging/icons/collage-maker.ico'),
  icns: await read('packaging/icons/collage-maker.icns'),
};

// The portable bundle: everything sits in one folder, the launchers find the HTML next to themselves.
const bundle = withDirs([
  file(`${top}/collage-maker.html`, await read('app/index.html')),
  file(`${top}/collage-maker`, lf(await read('bin/collage-maker')), 0o755),
  file(`${top}/collage-maker.cmd`, crlf(await read('bin/collage-maker.cmd'))),
  file(`${top}/install.sh`, lf(await read('install.sh')), 0o755),
  file(`${top}/install.ps1`, crlf(await read('install.ps1'))),
  file(`${top}/icons/collage-maker.svg`, icons.svg),
  file(`${top}/icons/collage-maker.png`, icons.png),
  file(`${top}/icons/collage-maker.ico`, icons.ico),
  file(`${top}/icons/collage-maker.icns`, icons.icns),
  file(`${top}/README.md`, await read('README.md')),
  file(`${top}/LICENSE`, await read('LICENSE')),
]);

// ---------------------------------------------------------------- tar
function tarHeader(name, { size = 0, mode, type, linkname = '' }) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 154);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`path too long for tar: ${name}`);
  }
  const put = (str, off, len) => h.write(str, off, len, 'utf8');
  const oct = (n, off, len) => put(n.toString(8).padStart(len - 1, '0') + '\0', off, len);
  put(name, 0, 100);
  oct(mode, 100, 8);
  oct(0, 108, 8);
  oct(0, 116, 8);
  oct(size, 124, 12);
  oct(MTIME, 136, 12);
  put('        ', 148, 8);
  put({ file: '0', dir: '5', symlink: '2' }[type], 156, 1);
  put(linkname, 157, 100);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  put('root', 265, 32);
  put('root', 297, 32);
  put(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

function tar(entries, { dotSlash = false } = {}) {
  const chunks = [];
  for (const e of entries) {
    const name = e.path === '' ? './' : (dotSlash ? './' : '') + e.path + (e.type === 'dir' ? '/' : '');
    const size = e.type === 'file' ? e.data.length : 0;
    chunks.push(tarHeader(name, { size, mode: e.mode, type: e.type, linkname: e.target || '' }));
    if (size) {
      chunks.push(e.data);
      if (size % 512) chunks.push(Buffer.alloc(512 - (size % 512)));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

const gzip = (buf) => gzipSync(buf, { level: 9 });

// ---------------------------------------------------------------- zip
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(epoch) {
  const d = new Date(epoch * 1000);
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

function zip(entries) {
  const { time, date } = dosTime(MTIME);
  const local = [], central = [];
  let offset = 0;
  for (const e of entries) {
    if (e.type === 'symlink') continue;
    const name = Buffer.from(e.path + (e.type === 'dir' ? '/' : ''), 'utf8');
    const raw = e.type === 'file' ? e.data : Buffer.alloc(0);
    const packed = raw.length ? deflateRawSync(raw, { level: 9 }) : raw;
    const method = raw.length ? 8 : 0;
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(packed.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, name, packed);

    const unixMode = (e.type === 'dir' ? 0o040000 : 0o100000) | e.mode;
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(packed.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(((unixMode << 16) | (e.type === 'dir' ? 0x10 : 0)) >>> 0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const count = central.length / 2;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// ---------------------------------------------------------------- deb
function ar(members) {
  const parts = [Buffer.from('!<arch>\n')];
  for (const { name, data } of members) {
    const h = Buffer.alloc(60, 0x20);
    h.write(name, 0);
    h.write(String(MTIME), 16);
    h.write('0', 28);
    h.write('0', 34);
    h.write('100644', 40);
    h.write(String(data.length), 48);
    h.write('`\n', 58);
    parts.push(h, data);
    if (data.length % 2) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}

const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function rfc2822(epoch) {
  const d = new Date(epoch * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

async function deb() {
  const license = (await readText('LICENSE')).trim().split('\n').map((l) => (l.trim() ? ` ${l}` : ' .')).join('\n');
  const copyright = `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: collage-maker
Upstream-Contact: ${REPO}/issues
Source: ${REPO}

Files: *
Copyright: ${new Date(MTIME * 1000).getUTCFullYear()} Rahul Singh Khokhar and Collage Maker contributors
License: MIT
${license}
`;
  const changelog = `collage-maker (${VERSION}) unstable; urgency=low

  * New upstream release ${VERSION}.
    See ${REPO}/releases/tag/v${VERSION}

 -- ${MAINTAINER}  ${rfc2822(MTIME)}
`;
  const desktop = await read('packaging/linux/collage-maker.desktop');
  const share = 'usr/share/collage-maker';
  const files = [
    { path: 'usr/bin/collage-maker', type: 'symlink', target: '../share/collage-maker/collage-maker', mode: 0o777 },
    file(`${share}/collage-maker`, lf(await read('bin/collage-maker')), 0o755),
    file(`${share}/collage-maker.html`, await read('app/index.html')),
    file(`${share}/icons/collage-maker.svg`, icons.svg),
    file(`${share}/icons/collage-maker.png`, icons.png),
    file('usr/share/applications/collage-maker.desktop', lf(desktop)),
    file('usr/share/icons/hicolor/scalable/apps/collage-maker.svg', icons.svg),
    file('usr/share/doc/collage-maker/copyright', copyright),
    file('usr/share/doc/collage-maker/changelog.gz', gzipSync(Buffer.from(changelog), { level: 9 })),
  ];
  for (const size of [48, 64, 128, 256, 512]) {
    files.push(file(`usr/share/icons/hicolor/${size}x${size}/apps/collage-maker.png`, await read(`packaging/icons/hicolor/${size}.png`)));
  }
  const data = withDirs(files);
  const installedKiB = data.reduce((s, e) => s + (e.type === 'file' ? Math.ceil(e.data.length / 1024) : 1), 0);
  const control = `Package: collage-maker
Version: ${VERSION}
Architecture: all
Maintainer: ${MAINTAINER}
Installed-Size: ${installedKiB}
Recommends: xdg-utils
Suggests: chromium | google-chrome-stable | microsoft-edge-stable | firefox
Section: graphics
Priority: optional
Homepage: ${REPO}
Description: make clean photo collages with white borders, offline
 Drop two, four or any number of photos into the window and Collage Maker
 lays them out in an even grid with white padding, then saves an 8K JPEG.
 A slider sets the padding; Fit, Landscape, Portrait and Square canvases
 are available.
 .
 The whole app is a single HTML file that runs in your web browser without
 a network connection. Your photos never leave your computer.
`;
  const md5sums = data.filter((e) => e.type === 'file').map((e) => `${md5(e.data)}  ${e.path}\n`).join('');
  // Both tars start with the "./" root entry, like the ones dpkg-deb writes.
  const rootDir = { path: '', mode: 0o755, type: 'dir' };
  const controlTar = tar([rootDir, file('control', control), file('md5sums', md5sums)], { dotSlash: true });
  const dataTar = tar([rootDir, ...data], { dotSlash: true });
  return ar([
    { name: 'debian-binary', data: Buffer.from('2.0\n') },
    { name: 'control.tar.gz', data: gzip(controlTar) },
    { name: 'data.tar.gz', data: gzip(dataTar) },
  ]);
}

// ---------------------------------------------------------------- write
const dist = join(root, 'dist');
if (existsSync(dist)) await rm(dist, { recursive: true });
await mkdir(dist, { recursive: true });

const outputs = {
  'collage-maker.tar.gz': gzip(tar(bundle)),
  'collage-maker.zip': zip(bundle),
  'collage-maker.deb': await deb(),
};
let sums = '';
for (const [name, buf] of Object.entries(outputs)) {
  await writeFile(join(dist, name), buf);
  sums += `${sha256(buf)}  ${name}\n`;
  console.log(`${name.padEnd(22)} ${String(buf.length).padStart(8)} bytes  sha256 ${sha256(buf)}`);
}
await writeFile(join(dist, 'SHA256SUMS'), sums);
console.log(`Built Collage Maker ${VERSION} into dist/`);
