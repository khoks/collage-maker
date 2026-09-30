# Contributing to Collage Maker

Thanks for helping! Bug reports, ideas, fixes and documentation improvements are all welcome.

## Ground rules

Collage Maker stays deliberately small. Changes should keep these properties:

- **One HTML file.** Everything the app needs is in [`app/index.html`](app/index.html): no build step, no frameworks,
  no runtime dependencies. Anyone should be able to download that one file and double-click it.
- **Private and offline.** Photos never leave the computer. The app sends nothing anywhere; the only network traffic
  is the hosted web version loading its own files.
- **Simple to use.** New options need a strong reason; "nothing fancy" is a feature.
- **Works everywhere.** Current Chrome, Edge, Firefox and Safari on Windows, macOS and Linux.

If you want to add something bigger, please open an issue first so we can talk it through.

## Project layout

| Path | What it is |
|---|---|
| `app/index.html` | The whole app. |
| `app/manifest.webmanifest`, `app/sw.js`, `app/icons/` | Extras for the hosted web version (install button, offline cache). |
| `bin/collage-maker`, `bin/collage-maker.cmd` | Launchers that open the app in its own window (macOS/Linux and Windows). |
| `install.sh`, `install.ps1` | One-line installers for macOS/Linux and Windows. |
| `Formula/`, `bucket/`, `packaging/` | Homebrew formula, Scoop manifest, Linux desktop entry and icons. |
| `scripts/` | Build and release helpers (plain Node.js, no dependencies), icon and screenshot helpers (use Playwright), and CI helper scripts. |
| `tests/` | End-to-end tests with Playwright. |

## Working on the app

1. Fork and clone the repository.
2. Open `app/index.html` in your browser. Edit, save, reload. That's the whole loop.
3. To try the web-app features (install button, offline mode), run `npm run serve` and open http://localhost:8080/.

## Running the tests

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npx playwright install chromium firefox webkit
npm test
```

Run one browser with `npx playwright test --project=chromium`. To use a browser you already have instead of
downloading one, set `PW_CHANNEL=msedge` or `PW_CHANNEL=chrome` and run the `chromium` project.

Please add or update a test in `tests/app.spec.mjs` for any change in behaviour.

## Building the packages

```sh
npm run build        # writes dist/collage-maker.zip, .tar.gz, .deb and SHA256SUMS
npm run check        # checks that every file agrees on the version number
```

For each pull request, CI builds everything and installs it through every channel (the `.deb`, Homebrew, Scoop and
both install scripts) on Windows, macOS and Linux, so you don't need all three systems yourself.

## Pull requests

- Keep each pull request focused on one change.
- Describe what changed and why, and how you checked it.
- Make sure `npm test` passes.
- Update `CHANGELOG.md` under "Unreleased" if users will notice the change.

## Releasing (maintainers)

1. `npm run set-version -- 1.2.3` (updates every file that carries the version, including `package-lock.json`).
2. Move the "Unreleased" notes in `CHANGELOG.md` under a new `## [1.2.3] - YYYY-MM-DD` heading, and update the
   comparison links at the bottom of the file.
3. Commit, then `git tag v1.2.3 && git push origin main v1.2.3`.

The release workflow builds everything, publishes the GitHub release, points Homebrew and Scoop at it, and then
installs it through every channel on all three systems to check it.

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
