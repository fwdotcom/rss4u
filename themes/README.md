# Themes System

This folder contains all theme-specific assets for the RSS reader.

## Overview

The app splits styling into two layers:

1. Global/base styling in `../css/style.css`
2. Theme styling and tile markup in `./<theme-name>/`

Each theme folder currently contains:

- `theme.css`: theme-specific CSS variables and tile styles
- `tile.template.html`: HTML template for a single feed card with placeholders

Current themes:

- `light`
- `dark`

## Runtime Flow

1. `js/index.js` selects a theme key (`light` or `dark`).
2. The `<link id="theme-stylesheet">` element is updated to `./themes/<theme>/theme.css`.
3. `js/index.js` loads `./themes/<theme>/tile.template.html` via `fetch`.
4. Feed items are rendered by replacing placeholders in the template.
5. The selected theme is persisted in `localStorage` (`rss4u-theme`).

If a template cannot be loaded, the app uses an internal fallback tile template.

## Template Contract

A theme template is plain HTML with placeholders. Supported placeholders:

- `{{theme}}`: current theme key
- `{{image}}`: complete `<img>` markup or an empty string
- `{{headline}}`: escaped article title
- `{{description}}`: escaped article excerpt
- `{{date}}`: localized date string or fallback text
- `{{article_action}}`: full article action markup (active link or disabled fallback)

Important expectations:

- Keep the CSS class names used by the current styles (`tile`, `tile-content`, `tile-headline`, etc.) unless you also update `theme.css` accordingly.
- Do not include scripts in templates.
- Templates should stay structural; logic stays in `js/index.js` and `js/rss.js`.

## Base CSS Variables (defined in `../css/style.css`)

Theme files usually override these variables in `:root`:

- `--font-sans`: main UI typeface
- `--font-mono`: monospace UI typeface
- `--bg-gradient`: page background
- `--bg-glow-a`: glow color A
- `--bg-glow-b`: glow color B
- `--app-bg`: app container background
- `--app-border`: app container border color
- `--surface`: primary card/surface background
- `--surface-soft`: secondary surface background
- `--text`: primary text color
- `--muted`: secondary text color
- `--accent`: primary accent color
- `--accent-2`: secondary accent color (links/highlights)
- `--line`: divider and border color
- `--input-bg`: input/select background
- `--chip-bg`: quick-feed chip background
- `--chip-text`: quick-feed chip text
- `--shadow`: global shadow color
- `--error`: error text color

## Tile Styling Hooks

The tile template and theme CSS work together through these selectors:

- `.tile`: card wrapper
- `.tile-image`: optional article image
- `.tile-content`: internal content wrapper
- `.tile-headline`: card headline
- `.tile-description`: card excerpt
- `.tile-meta`: meta row layout container
- `.tile-date`: publication date text style
- `.tile-link`: article link style

`tile-meta` is intended for layout only (flex alignment and spacing). Text styling should be done on `.tile-date` and `.tile-link`.

## Feed Header Thumbnail

When available, a channel thumbnail/logo is rendered in the feed meta header (left of the feed title).
The value is parsed from channel-level RSS/Atom image fields and exposed as `channelImageUrl`.

## Creating a New Theme

1. Create a folder under `themes/`, for example `themes/newspaper/`.
2. Add `themes/newspaper/theme.css`.
3. Add `themes/newspaper/tile.template.html` using the documented placeholders.
4. Register the theme in `THEMES` inside `../js/index.js`.
5. Add an option in the theme `<select>` in `../index.html`.

## Common Pitfalls

- Missing placeholder tokens: results in empty fields.
- Renamed CSS classes without matching CSS updates: card layout will break.
- Using unsupported placeholder names: they will stay unreplaced.
- Serving over `file://`: dynamic template loading may fail in some environments.

Date formatting note:

- The locale used for `{{date}}` is configured in each translation file via `formats.dateLocale`.

## Testing Checklist

- Switch between `light` and `dark` and confirm style + template update.
- Load at least one RSS feed and verify all placeholders render.
- Verify cards without images still look correct.
- Confirm `rss4u-theme` persists after page refresh.
- Confirm mobile layout still works for card content and links.
