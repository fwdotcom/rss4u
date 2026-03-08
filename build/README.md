# Build System

This folder contains packaging and release scripts.

Current areas:

- `scripts/extensions/`: browser extension build scripts
- `configs/extensions/`: extension build inputs (manifests and background script)
- `dist/extensions/`: generated extension ZIP files
- `dist/standalone/`: generated standalone binaries
- `tmp/`: temporary build workspace

The shared web root remains `../public/`.

Version source:

- `VERSION` in repository root (for example `1.0.2`)
- Extension build scripts set manifest `version` and inject footer version text in staged `public/index.html`
- Source files in `public/` are not modified by the build

Unified pre-build step:

- Script: `build/scripts/common/pre-build.ps1`
- Purpose: sync `public/index.html` footer to `Version x.y.z | Copyright ...` using `VERSION`
- Executed by: extension build scripts and `.githooks/pre-commit`

Unified package-all orchestrator:

- Script: `build/scripts/common/package-all.ps1`
- Runs pre-build once per runtime context (checks `RSS4U_PREBUILD_DONE`)
- Builds extension packages and standalone binaries by default
- Use `-ExtensionsOnly` to skip standalone binaries

Pre-commit hook for website footer version:

- Hook file: `.githooks/pre-commit`
- Activation: `git config core.hooksPath .githooks`
- Behavior: runs `build/scripts/common/pre-build.ps1` and stages `public/index.html`
- Footer format in `public/index.html`: `Version x.y.z | Copyright ...`

All commands should be run from the repository root.

Go workspace note:

- The repository root contains `go.work` with `use ./standalone`.
- This helps VS Code/gopls resolve `standalone/main.go` correctly and avoid false editor diagnostics.

## Build All Packages (recommended)

```bat
build\scripts\common\package-all.bat
```

Alternative (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File ./build/scripts/common/package-all.ps1
```

Outputs:

- `build/dist/extensions/rss4u-chromium-<version>.zip`
- `build/dist/extensions/rss4u-firefox-<version>.zip`
- `build/dist/standalone/rss4u-<version>-windows-amd64.exe`
- `build/dist/standalone/rss4u-<version>-windows-arm64.exe`
- `build/dist/standalone/rss4u-<version>-linux-amd64`
- `build/dist/standalone/rss4u-<version>-linux-arm64`
- `build/dist/standalone/rss4u-<version>-darwin-amd64`
- `build/dist/standalone/rss4u-<version>-darwin-arm64`

## Build Extension Packages Only

```powershell
powershell -ExecutionPolicy Bypass -File ./build/scripts/common/package-all.ps1 -ExtensionsOnly
```

Outputs:

- `build/dist/extensions/rss4u-chromium-<version>.zip`
- `build/dist/extensions/rss4u-firefox-<version>.zip`

## Build Standalone Binaries Only

```bat
build\scripts\standalone\build-standalone-all.bat
```

Output directory:

- `build/dist/standalone/`

## Build Chromium Package (Chrome/Edge)

```powershell
powershell -ExecutionPolicy Bypass -File ./build/scripts/extensions/package-chromium.ps1
```

Output:

- `build/dist/extensions/rss4u-chromium-<version>.zip`

## Build Firefox Package

```powershell
powershell -ExecutionPolicy Bypass -File ./build/scripts/extensions/package-firefox.ps1
```

Output:

- `build/dist/extensions/rss4u-firefox-<version>.zip`

Each package includes a browser-specific `manifest.json` generated from files in `build/configs/extensions/`.
