# rss4u

rss4u is a privacy-friendly, PWA-first RSS/Atom reader built with plain HTML, CSS, and JavaScript.
It runs entirely client-side, can be installed directly from the browser, and works with simple static hosting.
No backend, server-side scripts, or database are required, and your data stays in your browser.

## Screenshots

### Dark Theme

![rss4u dark theme screenshot](./themes/dark/screenshot.webp)

### Light Theme

![rss4u light theme screenshot](./themes/light/screenshot.webp)

Copyright (C) 2026 Frank Winter.

## Live Demo

Try rss4u on GitHub Pages:

- https://fwdotcom.github.io/rss4u/

## License

This project is licensed under the MIT License.

See [LICENSE](./LICENSE).

## Features

- Load RSS and Atom feeds from a URL input
- Installable as a Progressive Web App (manifest + service worker)
- Save/remove favorites and load them from quick-feed chips
- Import/export favorites as JSON
- Theme support
- Language support
- Locale-driven date formatting via translation files
- Per-theme tile templates with placeholders (`{{headline}}`, `{{description}}`, `{{date}}`, `{{image}}`, `{{theme}}`, `{{article_action}}`)
- CORS fallback strategy via proxy attempts
- Faster feed loading via parallel fallback attempts, per-request timeout, and short in-memory XML cache
- Feed sanitization for URL-only descriptions

## Project Structure

- `./`: PWA web root for runtime and static deployment
- `assets/`: static assets (icons, manifest screenshots)
- `js/`: JavaScript runtime files
- `index.html`: app shell and UI layout
- `css/style.css`: base/global styling and shared CSS variables
- `js/index.js`: UI behavior, theme loading, rendering
- `js/rss.js`: RSS logic (URL normalization, fetch, parse)
- `locales/`: translation files (`en`, `de`, `fr`, `es`, `it`, `pl`, `cs`, `nl`)
- `themes/`: theme-specific CSS, templates, and theme documentation
- `themes/README.md`: detailed theming guide
- `tests/`: lightweight Node test suite for locale consistency and source guards

## Run Locally

Use a local web server (recommended) so the PWA runtime (manifest/service worker/fetch/template loading) behaves consistently.

Example with VS Code Live Server:

1. Open the project in VS Code
2. Start `Live Server` on `index.html`
3. Open the shown local URL in your browser

## Run Tests

The project includes lightweight regression tests for localization consistency and key source guards.

Run from the project root:

```bash
node --test tests/*.test.mjs
```

## PWA Focus

rss4u is primarily distributed as a Progressive Web App (PWA).

- No browser-extension packaging is included / needed.
- No standalone binary packaging is included / needed.
- Deployment model is static hosting of the repository root web files.

## PWA Install

rss4u ships with a web app manifest and service worker so it can be installed as a Progressive Web App (PWA).

Deploy:

- Publish the repository root on any static host (for example GitHub Pages).
- Open the live page via HTTPS (`https://fwdotcom.github.io/rss4u/`).

Install:

- In Chrome/Edge desktop: use the install icon in the address bar.
- On mobile: use browser menu action like `Add to Home Screen`.

Note:

- Browser/OS decide exact window chrome behavior, but `display: standalone` requests an app-like window.

## Theming

Theme definitions are in `themes/<theme-name>/` and are registered in `js/index.js`.

Available themes:

- `dark`
- `light`

For full details, see `themes/README.md`.

## Localization

- Default language is English (`en`).
- Available languages: `en`, `de`, `fr`, `es`, `it`, `pl`, `cs`, `nl`.
- Translation resources live in `locales/*.json`.
- Date formatting locale is configured per language in `formats.dateLocale`.

