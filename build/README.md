# Extension Packaging

This folder contains browser packaging scripts.

The shared web root is `../public/`.

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

## Build All

```powershell
powershell -ExecutionPolicy Bypass -File ./build/package-all.ps1
```

Output:

- `build/dist/rss4u-chromium.zip`
- `build/dist/rss4u-firefox.zip`

Each package includes a browser-specific `manifest.json` generated from:

- `build/manifests/manifest.chrome.json`
- `build/manifests/manifest.firefox.json`
