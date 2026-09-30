// Sets the version everywhere it appears:  npm run set-version -- 1.2.3
// Afterwards add a "## [1.2.3]" section to CHANGELOG.md, commit, then tag v1.2.3 and push the tag.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION_SITES } from './versions.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Usage: npm run set-version -- 1.2.3');
  process.exit(1);
}

await writeFile(join(root, 'VERSION'), `${version}\n`);
for (const [file, re] of VERSION_SITES) {
  const path = join(root, file);
  const text = await readFile(path, 'utf8');
  const m = text.match(re);
  if (!m) throw new Error(`${file}: version pattern not found`);
  const at = m.index + m[0].indexOf(m[1]);
  await writeFile(path, text.slice(0, at) + version + text.slice(at + m[1].length));
  console.log(`${file}: ${m[1]} -> ${version}`);
}
console.log(`Now add a "## [${version}]" section to CHANGELOG.md.`);
