# Extension Packaging

This folder contains browser packaging scripts.

The shared web root is `../public/`.

Packaging inputs:

- `../public/` (app files)
- `./background.js` (opens/focuses app tab)
- `./manifests/manifest.chrome.json`
- `./manifests/manifest.firefox.json`

All commands should be run from the repository root.

## Build All (recommended)

```bat
build\build-browser-extensions.bat
```

Alternative (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File ./build/package-all.ps1
```

Outputs:

- `build/dist/rss4u-chromium.zip`
- `build/dist/rss4u-firefox.zip`

## Build Chromium (Chrome/Edge)

```powershell
powershell -ExecutionPolicy Bypass -File ./build/package-chromium.ps1
```

Output:

- `build/dist/rss4u-chromium.zip`

## Build Firefox

```powershell
powershell -ExecutionPolicy Bypass -File ./build/package-firefox.ps1
```

Output:

- `build/dist/rss4u-firefox.zip`

Each package includes a browser-specific `manifest.json`.
