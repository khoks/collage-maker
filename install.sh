#!/bin/sh
# Collage Maker installer for macOS and Linux. No root or sudo needed.
#
#   Install:    curl -fsSL https://raw.githubusercontent.com/khoks/collage-maker/main/install.sh | sh
#   Uninstall:  curl -fsSL https://raw.githubusercontent.com/khoks/collage-maker/main/install.sh | sh -s -- --uninstall
#
# It installs into ~/.local (the app in ~/.local/share/collage-maker, the command in ~/.local/bin)
# and adds Collage Maker to Launchpad (macOS) or your desktop's app menu (Linux).
# https://github.com/khoks/collage-maker
set -eu

REPO=khoks/collage-maker
PREFIX=${COLLAGE_MAKER_PREFIX:-$HOME/.local}
VERSION=${COLLAGE_MAKER_VERSION:-}
FROM=
ACTION=install
SHORTCUT=1

say() { printf '%s\n' "$*"; }
die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Collage Maker installer for macOS and Linux.

Usage: install.sh [options]

  --uninstall        remove Collage Maker
  --version X.Y.Z    install this release instead of the latest one
  --from PATH        install from a downloaded collage-maker.tar.gz or an extracted copy
  --prefix DIR       install under DIR instead of ~/.local
  --no-shortcut      do not add Collage Maker to Launchpad / the app menu
  --help             show this help

When piping from curl, pass options after "sh -s --", for example:
  curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --uninstall
EOF
}

while [ $# -gt 0 ]; do
  case $1 in
    --uninstall) ACTION=uninstall ;;
    --no-shortcut) SHORTCUT=0 ;;
    --version) [ $# -ge 2 ] || die "--version needs a value"; VERSION=$2; shift ;;
    --version=*) VERSION=${1#*=} ;;
    --from) [ $# -ge 2 ] || die "--from needs a value"; FROM=$2; shift ;;
    --from=*) FROM=${1#*=} ;;
    --prefix) [ $# -ge 2 ] || die "--prefix needs a value"; PREFIX=$2; shift ;;
    --prefix=*) PREFIX=${1#*=} ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
  shift
done

case $(uname -s) in
  Darwin|Linux) ;;
  *) die "this installer is for macOS and Linux. On Windows run in PowerShell:
  irm https://raw.githubusercontent.com/$REPO/main/install.ps1 | iex" ;;
esac

case $PREFIX in
  /*) ;;
  *) PREFIX=$(pwd)/$PREFIX ;;
esac
APP_DIR=$PREFIX/share/collage-maker
BIN_DIR=$PREFIX/bin
BIN=$BIN_DIR/collage-maker

# Only ever delete a folder that clearly holds Collage Maker.
remove_app_dir() {
  if [ -d "$APP_DIR" ]; then
    if [ -f "$APP_DIR/collage-maker.html" ] || [ -z "$(ls -A "$APP_DIR")" ]; then
      rm -rf "$APP_DIR"
    else
      die "$APP_DIR exists but does not look like Collage Maker; not touching it"
    fi
  fi
}

remove_shortcut() {
  if [ -x "$APP_DIR/collage-maker" ]; then
    "$APP_DIR/collage-maker" --uninstall-shortcut || true
  fi
}

# ------------------------------------------------------------------ uninstall
if [ "$ACTION" = uninstall ]; then
  say "Uninstalling Collage Maker from $PREFIX"
  remove_shortcut
  if [ -L "$BIN" ] || [ -f "$BIN" ]; then rm -f "$BIN"; say "Removed $BIN"; fi
  if [ -d "$APP_DIR" ]; then remove_app_dir; say "Removed $APP_DIR"; fi
  say "Collage Maker has been uninstalled."
  exit 0
fi

# ------------------------------------------------------------------ get the files
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t collage-maker)
trap 'rm -rf "$TMP"' EXIT INT TERM

fetch() {  # url destination
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    die "curl or wget is needed to download Collage Maker"
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d ' ' -f 1
  else openssl dgst -sha256 "$1" | sed 's/.*= //'
  fi
}

# Run from inside an extracted download (./install.sh) without --from: use that copy.
if [ -z "$FROM" ]; then
  case $0 in
    */install.sh|install.sh)
      here=$(cd "$(dirname "$0")" && pwd)
      if [ -f "$here/collage-maker.html" ]; then FROM=$here; fi
      ;;
  esac
fi

if [ -z "$FROM" ]; then
  if [ -n "$VERSION" ]; then
    base=https://github.com/$REPO/releases/download/v${VERSION#v}
  else
    base=https://github.com/$REPO/releases/latest/download
  fi
  say "Downloading Collage Maker from $base"
  fetch "$base/collage-maker.tar.gz" "$TMP/collage-maker.tar.gz"
  fetch "$base/SHA256SUMS" "$TMP/SHA256SUMS"
  expected=$(grep ' \*\{0,1\}collage-maker\.tar\.gz$' "$TMP/SHA256SUMS" | cut -d ' ' -f 1 || true)
  actual=$(sha256_of "$TMP/collage-maker.tar.gz")
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    die "the download is corrupt (SHA-256 mismatch); please try again"
  fi
  say "  checksum verified"
  FROM=$TMP/collage-maker.tar.gz
fi

if [ -d "$FROM" ]; then
  SRC=$FROM
else
  [ -f "$FROM" ] || die "not found: $FROM"
  mkdir "$TMP/unpacked"
  tar -xzf "$FROM" -C "$TMP/unpacked"
  SRC=$(find "$TMP/unpacked" -name collage-maker.html -type f | head -n 1)
  [ -n "$SRC" ] || die "no collage-maker.html inside $FROM"
  SRC=$(dirname "$SRC")
fi
if [ ! -f "$SRC/collage-maker.html" ] || [ ! -f "$SRC/collage-maker" ]; then
  die "$SRC is not a Collage Maker download"
fi
SRC=$(cd "$SRC" && pwd)

# ------------------------------------------------------------------ install
if [ "$SRC" != "$(cd "$APP_DIR" 2>/dev/null && pwd || true)" ]; then
  remove_shortcut
  remove_app_dir
  mkdir -p "$APP_DIR"
  cp -R "$SRC/." "$APP_DIR/"
  # Windows-only files are not needed here.
  rm -f "$APP_DIR/collage-maker.cmd" "$APP_DIR/install.ps1" "$APP_DIR/icons/collage-maker.ico"
fi
chmod 755 "$APP_DIR/collage-maker" "$APP_DIR/install.sh" 2>/dev/null || true
if [ "$(uname -s)" = Darwin ]; then
  # A browser-downloaded copy carries macOS's quarantine flag; it is not needed for local files.
  xattr -dr com.apple.quarantine "$APP_DIR" 2>/dev/null || true
fi

mkdir -p "$BIN_DIR"
ln -sf "$APP_DIR/collage-maker" "$BIN"

version=$("$BIN" --version | sed 's/^collage-maker //')
say "Installed Collage Maker $version"
say "  app:     $APP_DIR"
say "  command: $BIN"
if [ "$SHORTCUT" = 1 ]; then
  "$BIN" --install-shortcut | sed 's/^/  /'
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) say "Start it with: collage-maker" ;;
  *)
    say "Start it with: $BIN"
    say "($BIN_DIR is not on your PATH. Add it to run plain 'collage-maker'.)"
    ;;
esac
if [ "$PREFIX" = "$HOME/.local" ]; then
  say "Uninstall later with: sh \"$APP_DIR/install.sh\" --uninstall"
else
  say "Uninstall later with: sh \"$APP_DIR/install.sh\" --uninstall --prefix \"$PREFIX\""
fi
