# Changelog

All notable changes to Collage Maker are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-09-30

First public release.

- Drop, paste or browse for photos; they are laid out in an even grid with white borders and gaps.
- Padding slider from 0 to 400 px, applied to the outer border and the gaps alike.
- Four canvas shapes: **Fit** (follows your photos, so photos of the same shape are usually not cropped at all; 7680 px long edge),
  **Landscape** 7680 × 4320, **Portrait** 4320 × 7680 and **Square** 7680 × 7680.
- Saves a full-resolution JPEG, with a Save As dialog in Edge and Chrome and a download elsewhere.
- Drag a photo onto another to swap them, right-click to remove one, Ctrl/⌘+Z to undo a removal or New.
- Respects EXIF orientation; explains HEIC files the browser cannot read.
- Works offline as a single HTML file on Windows, macOS and Linux, and as an installable web app.
- Installers: Homebrew (macOS and Linux), a `.deb` for Debian and Ubuntu, Scoop and a PowerShell installer for Windows,
  a shell installer for macOS and Linux, and a portable zip.

[Unreleased]: https://github.com/khoks/collage-maker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/khoks/collage-maker/releases/tag/v1.0.0
