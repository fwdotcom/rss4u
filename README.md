# rss4u

A browser-based RSS reader built with plain HTML, CSS, and JavaScript.

## short description

rss4u is a privacy-friendly RSS reader that runs entirely in the browser.
It only needs a simple static web server and does not require server-side scripts or a database.
Your data and feed files stay in your browser, not on some cloud service.

Copyright (C) 2026 Frank Winter.

## Live Demo

Try rss4u on GitHub Pages:

- https://fwdotcom.github.io/rss4u/

## License

This project is licensed under the MIT License.

See [LICENSE](./LICENSE).

## Features

- Load RSS and Atom feeds from a URL input
- Save/remove favorites and load them from quick-feed chips
- Import/export favorites as JSON
- Theme support
- Language support
- Locale-driven date formatting via translation files
- Per-theme tile templates with placeholders (`{{headline}}`, `{{description}}`, `{{date}}`, `{{link}}`, `{{image}}`, `{{theme}}`, `{{article_label}}`)
- CORS fallback strategy via proxy attempts
- Feed sanitization for URL-only descriptions

## Screenshots

### Dark Theme

![rss4u dark theme screenshot](./themes/dark/screenshot.webp)

### Light Theme

![rss4u light theme screenshot](./themes/light/screenshot.webp)

## Project Structure

- `index.html`: app shell and UI layout
- `style.css`: base/global styling and shared CSS variables
- `script.js`: UI behavior, theme loading, rendering
- `rss.js`: RSS logic (URL normalization, fetch, parse)
- `locales/`: translation files (`en`, `de`, `fr`, `es`, `it`, `pl`, `cs`, `nl`)
- `themes/`: theme-specific CSS, templates, and theme documentation
- `themes/README.md`: detailed theming guide
- `tests/`: lightweight Node test suite for locale consistency and source guards

## Run Locally

Use a local web server (recommended) so dynamic template loading and fetch calls behave consistently.

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

## Theming

Theme definitions are in `themes/<theme-name>/` and are registered in `script.js`.

Available themes:

- `dark`
- `light`

For full details, see `themes/README.md`.

## Localization

- Default language is English (`en`).
- Available languages: `en`, `de`, `fr`, `es`, `it`, `pl`, `cs`, `nl`.
- Translation resources live in `locales/*.json`.
- Date formatting locale is configured per language in `formats.dateLocale`.

