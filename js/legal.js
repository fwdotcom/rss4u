/**
 * Entry-Skript für die Legal-Seite.
 *
 * Verantwortlichkeiten:
 * - Theme gemäß Nutzerpräferenz anwenden
 * - Locale für Legal-Texte laden
 * - Footer-Basisdaten setzen (Jahr + Version)
 * - LICENSE-Datei als autoritativen Lizenztext anzeigen
 */

import {
  DEFAULT_LANGUAGE,
  LOCALE_PATHS,
  replaceLocalizedPlaceholders,
  safeLocalStorageGet,
  applyThemeFromStorage,
  loadLocaleMessages,
  setFooterYear,
  fetchTextContent
} from "./common.js";

const LANGUAGE_KEY = "rss4u-language";
const THEME_KEY = "rss4u-theme";

const THEMES = {
  light: "./themes/light/theme.css",
  dark: "./themes/dark/theme.css"
};

const legalHeadingEl = document.getElementById("legal-heading");
const legalIntroEl = document.getElementById("legal-intro");
const licenseContentEl = document.getElementById("license-content");
const linkMitReferenceEl = document.getElementById("link-mit-reference");
const linkBackEl = document.getElementById("link-back");
const copyrightYearEl = document.getElementById("copyright-year");
const appVersionValueEl = document.getElementById("app-version-value");
const themeStylesheetEl = document.getElementById("theme-stylesheet");

let legalMessages = {
  pageTitle: "rss4u Legal Information",
  heading: "Legal Information",
  intro: "The authoritative legal text is listed below.",
  mitReference: "MIT reference",
  backToApp: "Back to rss4u"
};

/**
 * Wendet das gespeicherte Theme auf die Legal-Seite an.
 *
 * @returns {void}
 */
function applyTheme() {
  applyThemeFromStorage(THEME_KEY, THEMES, themeStylesheetEl, document.body, "light");
}

/**
 * Lädt die locale-spezifischen Legal-Texte.
 *
 * Nutzt den gespeicherten Sprachcode und fällt auf DEFAULT_LANGUAGE zurück,
 * falls kein gültiger Code hinterlegt ist.
 *
 * @returns {Promise<void>}
 */
async function loadLegalLocale() {
  const stored = safeLocalStorageGet(LANGUAGE_KEY, "").toLowerCase();
  const { language, messages } = await loadLocaleMessages(stored, {
    defaultLanguage: DEFAULT_LANGUAGE,
    localePaths: LOCALE_PATHS
  });

  legalMessages = {
    ...legalMessages,
    ...(messages.legal || {})
  };
  document.documentElement.lang = language;
}

/**
 * Überträgt geladene Übersetzungen in den DOM.
 *
 * @returns {void}
 */
function applyLegalTranslations() {
  document.title = replaceLocalizedPlaceholders(legalMessages.pageTitle);
  legalHeadingEl.textContent = replaceLocalizedPlaceholders(legalMessages.heading);
  legalIntroEl.textContent = replaceLocalizedPlaceholders(legalMessages.intro);
  linkMitReferenceEl.textContent = replaceLocalizedPlaceholders(legalMessages.mitReference);
  linkBackEl.textContent = replaceLocalizedPlaceholders(legalMessages.backToApp);
}

/**
 * Setzt statische Footer-Werte (aktuelles Jahr).
 *
 * @returns {void}
 */
function applyFooterDefaults() {
  setFooterYear(copyrightYearEl);
}

/**
 * Lädt die App-Version aus `VERSION` in den Legal-Footer.
 *
 * Bei fehlender Datei bleibt der im HTML hinterlegte Fallback-Wert erhalten.
 *
 * @returns {Promise<void>}
 */
async function loadVersionIntoFooter() {
  if (!appVersionValueEl) {
    return;
  }

  const versionText = await fetchTextContent("./VERSION", "", true);
  if (versionText) {
    appVersionValueEl.textContent = versionText;
  }
}

/**
 * Lädt den Lizenztext aus `LICENSE` und zeigt ihn in der Seite an.
 *
 * @returns {Promise<void>}
 */
async function loadLicenseFromFile() {
  if (!licenseContentEl) {
    return;
  }

  const licenseText = await fetchTextContent("./LICENSE", "", false);
  if (licenseText && licenseText.trim()) {
    licenseContentEl.textContent = licenseText;
  }
}

/**
 * Initialisiert die Legal-Seite in der richtigen Reihenfolge.
 *
 * Reihenfolge:
 * 1. Theme
 * 2. Footer-Basiswerte
 * 3. Version + LICENSE-Inhalt
 * 4. Locale + übersetzte UI-Texte
 *
 * @returns {Promise<void>}
 */
async function initializeLegalPage() {
  applyTheme();
  applyFooterDefaults();

  await loadVersionIntoFooter();
  await loadLicenseFromFile();

  try {
    await loadLegalLocale();
  } catch {
    // Keep default legal messages when locale loading fails.
  }

  applyLegalTranslations();
}

initializeLegalPage();
