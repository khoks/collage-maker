#!/bin/sh
# CI helper: installs Formula/collage-maker.rb from a throwaway tap, pointed at the tarball that
# scripts/build.mjs just built, then tests and uninstalls it. Homebrew refuses to install formulae
# straight from a file path, hence the temporary tap.
set -eu

version=$(cat VERSION)
tarball="$PWD/dist/collage-maker.tar.gz"
if command -v sha256sum >/dev/null 2>&1; then sha=$(sha256sum "$tarball" | cut -d ' ' -f 1)
else sha=$(shasum -a 256 "$tarball" | cut -d ' ' -f 1); fi

brew tap-new --no-git khoks/ci
tap_dir=$(brew --repository khoks/ci)
# A file:// URL carries no version number, so the CI copy states it explicitly.
perl -pe "s|^  url \".*\"|  url \"file://$tarball\"\n  version \"$version\"|; s|^  sha256 \".*\"|  sha256 \"$sha\"|" \
  Formula/collage-maker.rb >"$tap_dir/Formula/collage-maker.rb"
# Homebrew 6+ only loads formulae from third-party taps that you trust.
brew trust khoks/ci 2>/dev/null || true

brew install --formula khoks/ci/collage-maker
brew test khoks/ci/collage-maker
collage-maker --version
test -f "$(collage-maker --path)"
collage-maker --dry-run
brew uninstall --formula collage-maker
brew untap khoks/ci
