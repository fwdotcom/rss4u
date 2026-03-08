# Light Theme

Screenshot:

![Light theme screenshot](./screenshot.webp)

## Supported Placeholders

- `{{theme}}`: current theme key (for example `light`)
- `{{image}}`: full `<img>` markup or empty string when no media exists
- `{{headline}}`: escaped article title
- `{{description}}`: escaped article excerpt
- `{{date}}`: localized publication date or fallback text
- `{{article_action}}`: full article action markup (active link or disabled fallback)

## Notes

- Keep the existing `tile-*` class names unless you also update `theme.css`.
- Keep templates presentation-only (no scripts or inline handlers).
- Placeholder replacement is done in `../../js/index.js`.
