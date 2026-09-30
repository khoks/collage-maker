// Points the Homebrew formula and the Scoop manifest at a published release.
// Used by .github/workflows/release.yml after the release assets are uploaded:
//
//   node scripts/update-packages.mjs 1.2.3 path/to/SHA256SUMS
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [version, sumsPath] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !sumsPath) {
  console.error('Usage: node scripts/update-packages.mjs 1.2.3 path/to/SHA256SUMS');
  process.exit(1);
}

const sums = Object.fromEntries((await readFile(sumsPath, 'utf8')).trim().split('\n')
  .map((line) => line.trim().split(/\s+\*?/)).map(([hash, name]) => [name, hash]));
for (const name of ['collage-maker.tar.gz', 'collage-maker.zip']) {
  if (!/^[0-9a-f]{64}$/.test(sums[name] || '')) throw new Error(`No SHA-256 for ${name} in ${sumsPath}`);
}
const base = `https://github.com/khoks/collage-maker/releases/download/v${version}`;

// Read and check both files before writing either, so a problem never leaves a half-updated tree.
const formulaPath = join(root, 'Formula', 'collage-maker.rb');
const bucketPath = join(root, 'bucket', 'collage-maker.json');
const manifest = JSON.parse(await readFile(bucketPath, 'utf8'));
let formula = await readFile(formulaPath, 'utf8');
if (!/^ {2}url "[^"]*"$/m.test(formula) || !/^ {2}sha256 "[^"]*"$/m.test(formula)) {
  throw new Error('Formula/collage-maker.rb: url or sha256 line not found');
}
formula = formula
  .replace(/^( {2}url )"[^"]*"$/m, `$1"${base}/collage-maker.tar.gz"`)
  .replace(/^( {2}sha256 )"[^"]*"$/m, `$1"${sums['collage-maker.tar.gz']}"`);
await writeFile(formulaPath, formula);

manifest.version = version;
manifest.url = `${base}/collage-maker.zip`;
manifest.hash = sums['collage-maker.zip'];
manifest.extract_dir = `collage-maker-${version}`;
await writeFile(bucketPath, `${JSON.stringify(manifest, null, 4)}\n`);

console.log(`Formula and Scoop manifest now point at ${version}`);
