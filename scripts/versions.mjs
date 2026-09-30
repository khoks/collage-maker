// Every place the version number appears. scripts/build.mjs checks they all match VERSION,
// and scripts/set-version.mjs rewrites them. Each regex captures the version in group 1.
export const VERSION_SITES = [
  ['package.json', /"version":\s*"([^"]+)"/],
  ['app/index.html', /const VERSION = '([^']+)'/],
  ['app/sw.js', /const CACHE = 'collage-maker-([^']+)'/],
  ['bin/collage-maker', /^VERSION=(\S+)$/m],
  ['bin/collage-maker.cmd', /^set "VERSION=([^"]+)"/m],
];
