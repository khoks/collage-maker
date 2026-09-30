// Prints the release notes for one version: its CHANGELOG.md section plus install instructions.
//   node scripts/release-notes.mjs 1.2.3
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
const start = changelog.indexOf(`## [${version}]`);
if (start < 0) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
const rest = changelog.slice(start);
const next = rest.indexOf('\n## [', 1);
const section = (next < 0 ? rest : rest.slice(0, next)).split('\n').slice(1)
  .filter((line) => !/^\[[^\]]+\]:\s*https?:\/\//.test(line))   // link references at the end of CHANGELOG.md
  .join('\n').trim();

process.stdout.write(`${section}

## Install

- **Try it without installing:** https://khoks.github.io/collage-maker/
- **macOS / Linux (Homebrew):** \`brew tap khoks/collage-maker https://github.com/khoks/collage-maker && brew install khoks/collage-maker/collage-maker\`
- **macOS / Linux (script):** \`curl -fsSL https://raw.githubusercontent.com/khoks/collage-maker/main/install.sh | sh\`
- **Debian / Ubuntu:** download \`collage-maker.deb\` below, then \`sudo apt install ./collage-maker.deb\`
- **Windows (PowerShell):** \`irm https://raw.githubusercontent.com/khoks/collage-maker/main/install.ps1 | iex\`
- **Windows (Scoop):** \`scoop bucket add collage-maker https://github.com/khoks/collage-maker; scoop install collage-maker\`
- **Portable:** download \`collage-maker.zip\`, unzip it, and open \`collage-maker.html\` in any browser.

Checksums are in \`SHA256SUMS\`.
`);
