const LANGUAGE_KEY = "rss4u-language";
const DEFAULT_LANGUAGE = "en";
const THEME_KEY = "rss4u-theme";

const THEMES = {
  light: "./themes/light/theme.css",
  dark: "./themes/dark/theme.css"
};

const LOCALE_PATHS = {
  en: "./locales/en.json",
  de: "./locales/de.json",
  fr: "./locales/fr.json",
  es: "./locales/es.json",
  it: "./locales/it.json",
  pl: "./locales/pl.json",
  cs: "./locales/cs.json",
  nl: "./locales/nl.json"
};

const legalHeadingEl = document.getElementById("legal-heading");
const legalIntroEl = document.getElementById("legal-intro");
const linkMitReferenceEl = document.getElementById("link-mit-reference");
const linkBackEl = document.getElementById("link-back");
const themeStylesheetEl = document.getElementById("theme-stylesheet");

let legalMessages = {
  pageTitle: "rss4u Legal Information",
  heading: "Legal Information",
  intro: "The authoritative legal text is listed below.",
  mitReference: "MIT reference",
  backToApp: "Back to rss4u"
};

function safeLocalStorageGet(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function applyTheme() {
  const storedTheme = safeLocalStorageGet(THEME_KEY, "light");
  const themeName = Object.prototype.hasOwnProperty.call(THEMES, storedTheme) ? storedTheme : "light";
  themeStylesheetEl.href = THEMES[themeName];
  document.body.setAttribute("data-theme", themeName);
}

async function loadLegalLocale() {
  const stored = safeLocalStorageGet(LANGUAGE_KEY, "").toLowerCase();
  const selectedLanguage = LOCALE_PATHS[stored] ? stored : DEFAULT_LANGUAGE;
  const selectedPath = LOCALE_PATHS[selectedLanguage];
  const fallbackPath = LOCALE_PATHS[DEFAULT_LANGUAGE];

  let fallbackLegal = {};
  try {
    const fallbackResponse = await fetch(fallbackPath, { cache: "no-store" });
    if (fallbackResponse.ok) {
      const fallbackLocale = await fallbackResponse.json();
      fallbackLegal = fallbackLocale.legal || {};
    }
  } catch {
    fallbackLegal = {};
  }

  let selectedLegal = {};
  if (selectedPath) {
    try {
      const response = await fetch(selectedPath, { cache: "no-store" });
      if (response.ok) {
        const locale = await response.json();
        selectedLegal = locale.legal || {};
        document.documentElement.lang = selectedLanguage;
      }
    } catch {
      selectedLegal = {};
    }
  }

  legalMessages = {
    ...legalMessages,
    ...fallbackLegal,
    ...selectedLegal
  };
}

function applyLegalTranslations() {
  document.title = legalMessages.pageTitle;
  legalHeadingEl.textContent = legalMessages.heading;
  legalIntroEl.textContent = legalMessages.intro;
  linkMitReferenceEl.textContent = legalMessages.mitReference;
  linkBackEl.textContent = legalMessages.backToApp;
}

async function initializeLegalPage() {
  applyTheme();

  try {
    await loadLegalLocale();
  } catch {
    // Keep default legal messages when locale loading fails.
  }

  applyLegalTranslations();
}

initializeLegalPage();
