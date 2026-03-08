/**
 * Gemeinsame Frontend-Bausteine für `index.js` und `legal.js`.
 *
 * Enthält:
 * - zentrale Locale-Konfiguration (`DEFAULT_LANGUAGE`, `LOCALE_PATHS`)
 * - zentrale Placeholder-Schlüssel (`PLACEHOLDER_KEYS`)
 * - allgemeine Hilfsfunktionen für LocalStorage, Theme-Anwendung,
 *   Locale-Laden, Footer-Jahr und Text-Datei-Laden
 *
 * Ziel:
 * Doppelte Logik in den Entry-Dateien vermeiden und gemeinsame
 * Verhaltensregeln an einer Stelle pflegen.
 */

export const DEFAULT_LANGUAGE = "en";

export const LOCALE_PATHS = Object.freeze({
  en: "./locales/en.json",
  de: "./locales/de.json",
  fr: "./locales/fr.json",
  es: "./locales/es.json",
  it: "./locales/it.json",
  pl: "./locales/pl.json",
  cs: "./locales/cs.json",
  nl: "./locales/nl.json"
});

export const PLACEHOLDER_KEYS = Object.freeze({
  common: Object.freeze({
    count: "count",
    invalid: "invalid",
    details: "details",
    status: "status",
    theme: "theme",
    language: "language"
  }),
  indexTile: Object.freeze({
    date: "date",
    headline: "headline",
    description: "description",
    image: "image",
    theme: "theme",
    articleAction: "article_action"
  })
});

/**
 * Ersetzt Mustache-ähnliche Platzhalter in einem String.
 *
 * Beispiel:
 * `replaceLocalizedPlaceholders("Hello {{name}}", { name: "Ada" })`
 * -> `"Hello Ada"`
 *
 * @param {string} template Eingabetext mit Platzhaltern
 * @param {Record<string, string | number | boolean>} replacements Ersetzungswerte
 * @returns {string}
 */
export function replaceLocalizedPlaceholders(template, replacements = {}) {
  return Object.entries(replacements).reduce((text, [key, value]) => {
    return text.replaceAll(`{{${key}}}`, String(value));
  }, String(template));
}

/**
 * Liest einen String-Wert aus localStorage robust aus.
 *
 * Fängt Storage-Fehler (z. B. in restriktiven Browser-Kontexten)
 * ab und liefert in dem Fall den Fallback.
 *
 * @param {string} key localStorage-Key
 * @param {string} fallback Rückgabewert bei Fehler/Leerwert
 * @returns {string}
 */
export function safeLocalStorageGet(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Wendet ein Theme anhand eines gespeicherten Keys auf DOM-Elemente an.
 *
 * Unterstützt zwei Theme-Map-Formate:
 * - `themeName -> "./path/theme.css"`
 * - `themeName -> { cssPath: "./path/theme.css", ... }`
 *
 * @param {string} themeKey localStorage-Key für das Theme
 * @param {Record<string, string | {cssPath?: string}>} themes Theme-Registry
 * @param {HTMLLinkElement | null} themeStylesheetEl `<link>`-Element für Theme-CSS
 * @param {HTMLElement} targetElement Element, auf dem `data-theme` gesetzt wird
 * @param {string} fallbackTheme Theme-Name bei ungültigem Storage-Wert
 * @returns {string} tatsächlich angewendeter Theme-Name
 */
export function applyThemeFromStorage(themeKey, themes, themeStylesheetEl, targetElement = document.body, fallbackTheme = "light") {
  const storedTheme = safeLocalStorageGet(themeKey, fallbackTheme);
  const themeName = Object.prototype.hasOwnProperty.call(themes, storedTheme) ? storedTheme : fallbackTheme;
  const themeConfig = themes[themeName];
  const cssPath = typeof themeConfig === "string" ? themeConfig : themeConfig?.cssPath || "";

  if (themeStylesheetEl && cssPath) {
    themeStylesheetEl.href = cssPath;
  }

  if (targetElement?.setAttribute) {
    targetElement.setAttribute("data-theme", themeName);
  }

  return themeName;
}

/**
 * Lädt Locale-Nachrichten mit Fallback-Strategie.
 *
 * Verhalten:
 * - gewünschte Sprache laden (oder Fallback auf defaultLanguage)
 * - sicherstellen, dass defaultLanguage ebenfalls im Cache vorhanden ist
 * - Ergebnis als `{ language, messages }` zurückgeben
 *
 * @param {string} languageCode gewünschter Sprachcode
 * @param {{
 *   defaultLanguage?: string,
 *   localePaths?: Record<string, string>,
 *   cache?: Record<string, any>
 * }} options Konfiguration
 * @returns {Promise<{language: string, messages: any}>}
 */
export async function loadLocaleMessages(languageCode, options = {}) {
  const {
    defaultLanguage = DEFAULT_LANGUAGE,
    localePaths = LOCALE_PATHS,
    cache = {}
  } = options;

  const safeLanguage = localePaths[languageCode] ? languageCode : defaultLanguage;

  if (!cache[safeLanguage]) {
    const response = await fetch(localePaths[safeLanguage], { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Locale could not be loaded (HTTP ${response.status}).`);
    }

    cache[safeLanguage] = await response.json();
  }

  if (!cache[defaultLanguage]) {
    const fallbackResponse = await fetch(localePaths[defaultLanguage], { cache: "no-store" });
    if (fallbackResponse.ok) {
      cache[defaultLanguage] = await fallbackResponse.json();
    }
  }

  return {
    language: safeLanguage,
    messages: cache[safeLanguage] || cache[defaultLanguage] || {}
  };
}

/**
 * Schreibt das aktuelle Jahr in ein Footer-Element.
 *
 * @param {HTMLElement | null} yearElement Ziel-Element für den Jahreswert
 * @returns {void}
 */
export function setFooterYear(yearElement) {
  if (!yearElement) {
    return;
  }

  yearElement.textContent = String(new Date().getFullYear());
}

/**
 * Lädt Textinhalt einer Datei per Fetch.
 *
 * Wird für einfache textbasierte Inhalte genutzt (z. B. `VERSION`, `LICENSE`).
 * Bei Fehlern oder leeren Antworten wird der Fallback zurückgegeben.
 *
 * @param {string} path relative URL zur Textdatei
 * @param {string} fallback Rückgabewert bei Fehlern
 * @param {boolean} trim wenn true, wird `.trim()` auf den Text angewendet
 * @returns {Promise<string>}
 */
export async function fetchTextContent(path, fallback = "", trim = false) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      return fallback;
    }

    const text = await response.text();
    if (!text) {
      return fallback;
    }

    return trim ? text.trim() : text;
  } catch {
    return fallback;
  }
}
