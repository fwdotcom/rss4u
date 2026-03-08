import { loadFeed as loadRssFeed, normalizeFeedUrl, setRssMessages } from "./rss.js?v=20260307b";

const form = document.getElementById("feed-form");
const feedUrlInput = document.getElementById("feed-url");
const favoriteBtn = document.getElementById("favorite-btn");
const favoriteIcon = document.getElementById("favorite-icon");
const statusEl = document.getElementById("status");
const feedMetaEl = document.getElementById("feed-meta");
const itemsEl = document.getElementById("items");
const themeSelect = document.getElementById("theme-select");
const languageSelect = document.getElementById("language-select");
const themeStylesheet = document.getElementById("theme-stylesheet");
const quickFeedsEl = document.getElementById("quick-feeds");
const quickFeedsToolbar = document.querySelector(".quick-feeds-toolbar");
const importFavoritesBtn = document.getElementById("import-favorites-btn");
const exportFavoritesBtn = document.getElementById("export-favorites-btn");
const favoritesFileInput = document.getElementById("favorites-file-input");
const resetAppBtn = document.getElementById("reset-app-btn");
const appTitleText = document.getElementById("app-title-text");
const appSubtitle = document.getElementById("app-subtitle");
const themeLabel = document.getElementById("theme-label");
const languageLabel = document.getElementById("language-label");
const feedUrlLabel = document.getElementById("feed-url-label");
const loadBtn = document.getElementById("load-btn");
const controlsSection = document.getElementById("controls-section");
const resultsSection = document.getElementById("results-section");
const siteFooter = document.getElementById("site-footer");
const footerWebsiteLink = document.getElementById("footer-website-link");
const footerLicenseLink = document.getElementById("footer-license-link");
const copyrightYearEl = document.getElementById("copyright-year");

const SAVED_FEEDS_KEY = "rss4u-saved-feeds";
const FEED_SEED_DONE_KEY = "rss4u-feeds-seeded";
const LANGUAGE_KEY = "rss4u-language";
const THEME_KEY = "rss4u-theme";
const DEFAULT_LANGUAGE = "en";
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
const localeCache = {};
const STATIC_INITIAL_FEEDS = [
	{ label: "Mozilla Blog", url: "https://blog.mozilla.org/feed/" },
	{ label: "BlenderNation", url: "https://www.blendernation.com/feed/" }
];
const LEGACY_DEFAULT_FEED_URLS = new Set([
	"https://xkcd.com/atom.xml",
	"https://hnrss.org/frontpage"
]);

/**
 * Theme-Registry für Stylesheet und Theme-spezifisches Card-Template.
 *
 * Wenn Pfade in einer Map liegen, lassen sich neue Themes hinzufügen,
 * ohne Render-Logik oder Event-Handler anzufassen.
 */
const THEMES = {
	light: {
		cssPath: "./themes/light/theme.css",
		templatePath: "./themes/light/tile.template.html"
	},
	dark: {
		cssPath: "./themes/dark/theme.css",
		templatePath: "./themes/dark/tile.template.html"
	}
};

/**
 * Fallback-Card-Template, falls ein Theme-Template nicht geladen werden kann.
 *
	* Platzhalter im Mustache-Stil werden zur Laufzeit in renderFeed() ersetzt.
 */
const FALLBACK_TEMPLATE = `
<article class="tile">
	{{image}}
	<div class="tile-content">
		<h3 class="tile-headline">{{headline}}</h3>
		<p class="tile-description">{{description}}</p>
		<div class="tile-meta">
			<span class="tile-date">{{date}}</span>
			{{article_action}}
		</div>
	</div>
</article>
`;

let currentTheme = "light";
let currentLanguage = DEFAULT_LANGUAGE;
let activeLocale = {};
let currentTileTemplate = FALLBACK_TEMPLATE;
let lastParsedFeed = null;
let currentLoadedUrl = "";
let latestFeedRequestId = 0;

/**
 * Erzeugt die initiale Feedliste inkl. lokaler XML-Fixtures als absolute URLs.
 */
function getInitialFeeds() {
	const fixtureFeeds = [
		{ label: "Test RSS (XML)", path: "./test-feeds/example-rss.xml" },
		{ label: "Test Atom (XML)", path: "./test-feeds/example-atom.xml" }
	].map((entry) => {
		try {
			return {
				label: entry.label,
				url: new URL(entry.path, window.location.href).toString()
			};
		} catch {
			return null;
		}
	}).filter(Boolean);

	return [...STATIC_INITIAL_FEEDS, ...fixtureFeeds];
}

/**
 * Entfernt veraltete Legacy-Standardfeeds, behält aber benutzerdefinierte Feeds.
 */
function removeLegacyDefaultFeeds(feeds) {
	return feeds.filter((entry) => {
		if (!entry?.url) {
			return false;
		}

		try {
			const normalized = normalizeFeedUrl(entry.url);
			return !LEGACY_DEFAULT_FEED_URLS.has(normalized);
		} catch {
			return true;
		}
	});
}

const STAR_OUTLINE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath d='M12 3.7l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8z' fill='none' stroke='%23ffffff' stroke-width='1.8' stroke-linejoin='round'/%3E%3C/svg%3E";
const STAR_FILLED_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath d='M12 3.7l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8z' fill='%23ffffff'/%3E%3C/svg%3E";

function getNestedValue(obj, dottedPath) {
	return dottedPath.split(".").reduce((value, key) => {
		if (value && typeof value === "object") {
			return value[key];
		}
		return undefined;
	}, obj);
}

function formatTranslation(template, replacements = {}) {
	return Object.entries(replacements).reduce((text, [key, value]) => {
		return text.replaceAll(`{{${key}}}`, String(value));
	}, template);
}

function getDateLocaleTag() {
	const configuredLocale =
		getNestedValue(activeLocale, "formats.dateLocale") ||
		getNestedValue(localeCache[DEFAULT_LANGUAGE], "formats.dateLocale");

	if (typeof configuredLocale === "string" && configuredLocale.trim()) {
		return configuredLocale;
	}

	return "en-US";
}

function t(key, replacements = {}) {
	const translated =
		getNestedValue(activeLocale, key) ||
		getNestedValue(localeCache[DEFAULT_LANGUAGE], key) ||
		key;

	if (typeof translated !== "string") {
		return key;
	}

	return formatTranslation(translated, replacements);
}

async function loadLocale(languageCode) {
	const safeLanguage = LOCALE_PATHS[languageCode] ? languageCode : DEFAULT_LANGUAGE;
	if (!localeCache[safeLanguage]) {
		const response = await fetch(LOCALE_PATHS[safeLanguage], { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`Locale could not be loaded (HTTP ${response.status}).`);
		}

		localeCache[safeLanguage] = await response.json();
	}

	if (!localeCache[DEFAULT_LANGUAGE]) {
		const fallbackResponse = await fetch(LOCALE_PATHS[DEFAULT_LANGUAGE], { cache: "no-store" });
		if (fallbackResponse.ok) {
			localeCache[DEFAULT_LANGUAGE] = await fallbackResponse.json();
		}
	}

	activeLocale = localeCache[safeLanguage] || localeCache[DEFAULT_LANGUAGE] || {};
	currentLanguage = safeLanguage;
	document.documentElement.lang = safeLanguage;
	setRssMessages(activeLocale.rss || {});
}

function applyStaticTranslations() {
	document.title = t("app.name");
	appTitleText.textContent = t("app.name");
	appSubtitle.textContent = t("app.subtitle");

	themeLabel.textContent = t("labels.theme");
	languageLabel.textContent = t("labels.language");
	feedUrlLabel.textContent = t("labels.feedUrl");
	loadBtn.textContent = t("buttons.load");
	feedUrlInput.placeholder = t("placeholders.feedUrl");

	themeSelect.setAttribute("aria-label", t("aria.themeSelect"));
	languageSelect.setAttribute("aria-label", t("aria.languageSelect"));
	quickFeedsEl.setAttribute("aria-label", t("aria.quickFeeds"));
	if (quickFeedsToolbar) {
		quickFeedsToolbar.setAttribute("aria-label", t("aria.favoritesActions"));
	}
	controlsSection.setAttribute("aria-label", t("aria.controls"));
	resultsSection.setAttribute("aria-label", t("aria.results"));
	siteFooter.setAttribute("aria-label", t("aria.footer"));
	resetAppBtn.setAttribute("aria-label", t("aria.resetToDefaults"));

	footerWebsiteLink.textContent = t("buttons.website");
	footerLicenseLink.textContent = t("buttons.license");
	if (copyrightYearEl) {
		copyrightYearEl.textContent = String(new Date().getFullYear());
	}
	resetAppBtn.textContent = t("buttons.reset");
	if (importFavoritesBtn) {
		importFavoritesBtn.setAttribute("title", t("aria.importFavorites"));
		importFavoritesBtn.setAttribute("aria-label", t("aria.importFavorites"));
	}
	if (exportFavoritesBtn) {
		exportFavoritesBtn.setAttribute("title", t("aria.exportFavorites"));
		exportFavoritesBtn.setAttribute("aria-label", t("aria.exportFavorites"));
	}
	favoriteIcon.alt = t("aria.favoriteIcon");

	const lightOption = themeSelect.querySelector('option[value="light"]');
	const darkOption = themeSelect.querySelector('option[value="dark"]');
	if (lightOption) lightOption.textContent = t("themes.light");
	if (darkOption) darkOption.textContent = t("themes.dark");

	languageSelect.querySelectorAll("option").forEach((optionEl) => {
		const key = optionEl.value;
		optionEl.textContent = t(`languages.${key}`);
	});

	updateFavoriteButtonState();
	renderFeedPills();
	if (lastParsedFeed) {
		renderFeed(lastParsedFeed);
	}
}

function getPreferredLanguage() {
	const stored = (localStorage.getItem(LANGUAGE_KEY) || "").toLowerCase();
	if (LOCALE_PATHS[stored]) {
		return stored;
	}

	return DEFAULT_LANGUAGE;
}

async function applyLanguage(languageCode, options = {}) {
	const { persist = true } = options;
	await loadLocale(languageCode);
	languageSelect.value = currentLanguage;
	applyStaticTranslations();

	if (persist) {
		localStorage.setItem(LANGUAGE_KEY, currentLanguage);
	}
}

/**
 * Erzeugt ein kurzes Chip-Label aus URL-Daten.
 */
function createFeedLabel(url) {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.replace(/^www\./i, "");
		if (!parsed.pathname || parsed.pathname === "/") {
			return hostname;
		}

		const path = parsed.pathname.replace(/\/$/, "");
		return `${hostname}${path}`;
	} catch {
		return url;
	}
}

/**
 * Normalisiert ein Feed-Label und fällt bei Bedarf auf URL-Text zurück.
 */
function getSafeFeedLabel(label, url) {
	const trimmed = (label || "").trim();
	return trimmed || createFeedLabel(url);
}

/**
 * Liest gespeicherte Feed-Einträge aus localStorage und validiert die Struktur.
 */
function getSavedFeeds() {
	const raw = localStorage.getItem(SAVED_FEEDS_KEY);
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.filter((entry) => entry && typeof entry.url === "string")
			.map((entry) => ({
				url: entry.url,
				label: getSafeFeedLabel(entry.label, entry.url)
			}));
	} catch {
		return [];
	}
}

/**
 * Schreibt gespeicherte Feed-Einträge in localStorage.
 */
function setSavedFeeds(feeds) {
	localStorage.setItem(SAVED_FEEDS_KEY, JSON.stringify(feeds));
}

/**
 * Bereinigt importiertes Favoriten-JSON und verwirft fehlerhafte Einträge.
 */
function sanitizeImportedFeeds(rawEntries) {
	if (!Array.isArray(rawEntries)) {
		throw new Error(t("status.importInvalidFormat"));
	}

	const byUrl = new Map();
	let invalidCount = 0;

	rawEntries.forEach((entry) => {
		if (!entry || typeof entry.url !== "string") {
			invalidCount += 1;
			return;
		}

		try {
			const normalized = normalizeFeedUrl(entry.url);
			const label = getSafeFeedLabel(typeof entry.label === "string" ? entry.label : "", normalized);
			byUrl.set(normalized, {
				url: normalized,
				label
			});
		} catch {
			invalidCount += 1;
		}
	});

	return {
		feeds: Array.from(byUrl.values()),
		invalidCount
	};
}

/**
 * Lädt aktuelle Favoriten als JSON-Datei herunter.
 */
function exportFavoritesAsJson() {
	const savedFeeds = getSavedFeeds();
	const payload = JSON.stringify(savedFeeds, null, 2);
	const blob = new Blob([payload], { type: "application/json" });
	const blobUrl = URL.createObjectURL(blob);
	const dateStamp = new Date().toISOString().slice(0, 10);
	const linkEl = document.createElement("a");
	linkEl.href = blobUrl;
	linkEl.download = `rss4u-favorites-${dateStamp}.json`;
	document.body.appendChild(linkEl);
	linkEl.click();
	linkEl.remove();
	URL.revokeObjectURL(blobUrl);

	setStatus(t("status.favoritesExported", { count: savedFeeds.length }));
}

/**
 * Importiert Favoriten aus JSON-Text und merged sie per URL.
 */
function importFavoritesFromJsonText(jsonText) {
	let parsed;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		throw new Error(t("status.importInvalidJson"));
	}

	const { feeds: importedFeeds, invalidCount } = sanitizeImportedFeeds(parsed);
	if (!importedFeeds.length) {
		throw new Error(t("status.importNoValidEntries"));
	}

	const mergedByUrl = new Map(getSavedFeeds().map((entry) => [entry.url, entry]));
	importedFeeds.forEach((entry) => {
		mergedByUrl.set(entry.url, entry);
	});

	setSavedFeeds(Array.from(mergedByUrl.values()));
	renderFeedPills();
	updateFavoriteButtonState();
	setStatus(t("status.favoritesImported", { count: importedFeeds.length, invalid: invalidCount }));
}

/**
 * Legt Beispiel-Feeds genau einmal im Storage an und fügt sie nie erneut automatisch hinzu.
 */
function seedInitialFeedsIfNeeded() {
	if (localStorage.getItem(FEED_SEED_DONE_KEY) === "1") {
		return;
	}

	const existingFeeds = removeLegacyDefaultFeeds(getSavedFeeds());
	const existingUrls = new Set(existingFeeds.map((entry) => entry.url));
	const seededFeeds = [
		...getInitialFeeds().filter((entry) => !existingUrls.has(entry.url)),
		...existingFeeds
	].map((entry) => ({
		url: entry.url,
		label: getSafeFeedLabel(entry.label, entry.url)
	}));

	setSavedFeeds(seededFeeds);
	localStorage.setItem(FEED_SEED_DONE_KEY, "1");
}

/**
 * Fügt einen Feed ein oder aktualisiert sein Label, wenn er bereits gespeichert ist.
 */
function upsertSavedFeed(url, label) {
	const savedFeeds = getSavedFeeds();
	const safeLabel = getSafeFeedLabel(label, url);
	const existingIndex = savedFeeds.findIndex((entry) => entry.url === url);

	if (existingIndex >= 0) {
		const hasChanged = savedFeeds[existingIndex].label !== safeLabel;
		if (hasChanged) {
			savedFeeds[existingIndex].label = safeLabel;
			setSavedFeeds(savedFeeds);
		}

		return {
			created: false,
			updated: hasChanged
		};
	}

	savedFeeds.push({
		url,
		label: safeLabel
	});

	setSavedFeeds(savedFeeds);
	return {
		created: true,
		updated: false
	};
}

/**
 * Entfernt eine URL aus den gespeicherten Feeds.
 */
function removeFeed(url) {
	const savedFeeds = getSavedFeeds();
	const nextFeeds = savedFeeds.filter((entry) => entry.url !== url);
	setSavedFeeds(nextFeeds);
}

/**
 * Prüft, ob eine URL aktuell in den gespeicherten Feeds existiert.
 */
function isSavedFeed(url) {
	return getSavedFeeds().some((entry) => entry.url === url);
}

/**
 * Aktualisiert das Favoriten-Symbol basierend auf der aktuellen URL-Eingabe.
 */
function updateFavoriteButtonState() {
	const rawInput = feedUrlInput.value.trim();
	if (!rawInput) {
		favoriteIcon.src = STAR_OUTLINE_ICON;
		favoriteBtn.setAttribute("title", t("aria.saveFavorite"));
		favoriteBtn.setAttribute("aria-label", t("aria.saveFavorite"));
		return;
	}

	try {
		const normalized = normalizeFeedUrl(rawInput);
		const isFavorite = isSavedFeed(normalized);
		favoriteIcon.src = isFavorite ? STAR_FILLED_ICON : STAR_OUTLINE_ICON;
		favoriteBtn.setAttribute("title", isFavorite ? t("aria.removeFavorite") : t("aria.saveFavorite"));
		favoriteBtn.setAttribute("aria-label", isFavorite ? t("aria.removeFavorite") : t("aria.saveFavorite"));
	} catch {
		favoriteIcon.src = STAR_OUTLINE_ICON;
		favoriteBtn.setAttribute("title", t("aria.saveFavorite"));
		favoriteBtn.setAttribute("aria-label", t("aria.saveFavorite"));
	}
}

/**
 * Rendert Standard- und benutzerdefinierte Feeds als klickbare Chips.
 */
function renderFeedPills() {
	const savedFeeds = getSavedFeeds();
	const pills = savedFeeds.map((entry) => {
		const wrapper = document.createElement("div");
		wrapper.className = "feed-pill deletable";
		wrapper.dataset.url = entry.url;

		const chipButton = document.createElement("button");
		chipButton.type = "button";
		chipButton.className = "feed-chip";
		chipButton.dataset.feedAction = "load";
		chipButton.title = entry.url;
		chipButton.textContent = entry.label;

		const deleteLabel = t("aria.deleteFeed");
		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "feed-chip-delete";
		deleteButton.dataset.feedAction = "delete";
		deleteButton.setAttribute("aria-label", deleteLabel);
		deleteButton.title = deleteLabel;
		deleteButton.textContent = "x";

		wrapper.append(chipButton, deleteButton);
		return wrapper;
	});

	quickFeedsEl.replaceChildren(...pills);
}

/**
 * Aktualisiert den Statusbereich und setzt bei Bedarf die Fehlerfarbe.
 */
function setStatus(message, isError = false) {
	statusEl.textContent = message;
	statusEl.style.color = isError ? "var(--error)" : "var(--muted)";
}

/**
 * Maskiert Benutzer-/Inhalts-Strings vor dem Einsetzen in HTML-Vorlagen.
 */
function escapeHtml(value) {
	if (value == null) return "";
	return value
		.toString()
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * Konvertiert HTML-Strings in DOM-Fragmente ohne direkte innerHTML-Zuweisung.
 */
function htmlToFragment(htmlValue) {
	const parser = new DOMParser();
	const parsed = parser.parseFromString(String(htmlValue || ""), "text/html");
	const fragment = document.createDocumentFragment();
	[...parsed.body.childNodes].forEach((node) => {
		fragment.appendChild(node);
	});
	return fragment;
}

/**
 * Formatiert Feed-Daten für die jeweilige Sprache.
 */
function formatDate(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const localeTag = getDateLocaleTag();
	return new Intl.DateTimeFormat(localeTag, {
		day: "2-digit",
		month: "2-digit",
		year: "numeric"
	}).format(date);
}

/**
 * Erzeugt Bild-HTML nur dann, wenn der Feed-Eintrag Mediendaten enthält.
 */
function buildImageMarkup(mediaUrl) {
	if (!mediaUrl) {
		return "";
	}

	return `<img class="tile-image" src="${escapeHtml(mediaUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
}

/**
 * Ersetzt alle {{placeholder}}-Marker in einem Template-String.
 */
function fillTemplate(template, replacements) {
	let output = template;
	Object.entries(replacements).forEach(([placeholder, value]) => {
		output = output.split(placeholder).join(value);
	});
	return output;
}

/**
 * Lädt ein Template-File von Datenträger oder Netzwerk.
 */
async function loadThemeTemplate(templatePath) {
	const response = await fetch(templatePath, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(t("status.templateLoadFailed", { status: response.status }));
	}

	const text = await response.text();
	if (!text.trim()) {
		throw new Error(t("status.templateEmpty"));
	}

	return text;
}

/**
 * Wendet ein ausgewähltes Theme an und rendert den geladenen Feed erneut.
 */
async function applyTheme(themeName) {
	const safeTheme = THEMES[themeName] ? themeName : "light";
	const themeConfig = THEMES[safeTheme];
	let templateLoaded = true;

	themeStylesheet.setAttribute("href", themeConfig.cssPath);
	document.body.dataset.theme = safeTheme;

	try {
		currentTileTemplate = await loadThemeTemplate(themeConfig.templatePath);
	} catch {
		templateLoaded = false;
		currentTileTemplate = FALLBACK_TEMPLATE;
		setStatus(t("status.themeTemplateFallback", { theme: safeTheme }), true);
	}

	currentTheme = safeTheme;
	localStorage.setItem(THEME_KEY, safeTheme);

	if (lastParsedFeed) {
		renderFeed(lastParsedFeed);
	}

	return templateLoaded;
}

/**
 * Rendert geparste RSS-Daten als Karten mit dem aktiven Card-Template.
 */
function renderFeed(feed) {
	lastParsedFeed = feed;
	const metaTopRow = document.createElement("div");
	metaTopRow.className = "feed-meta-top-row";

	const titleWrap = document.createElement("div");
	titleWrap.className = "feed-meta-title-wrap";

	if (feed.channelImageUrl) {
		const channelImage = document.createElement("img");
		channelImage.className = "feed-meta-thumb";
		channelImage.src = feed.channelImageUrl;
		channelImage.alt = "";
		channelImage.loading = "lazy";
		channelImage.referrerPolicy = "no-referrer";
		titleWrap.appendChild(channelImage);
	}

	const heading = document.createElement("h2");
	heading.textContent = feed.channelTitle;
	titleWrap.appendChild(heading);
	metaTopRow.appendChild(titleWrap);

	if (feed.channelLink) {
		const siteLink = document.createElement("a");
		siteLink.className = "feed-meta-site-link";
		siteLink.href = feed.channelLink;
		siteLink.target = "_blank";
		siteLink.rel = "noopener noreferrer";
		siteLink.textContent = t("feed.websiteLink");
		metaTopRow.appendChild(siteLink);
	}

	const description = document.createElement("p");
	description.textContent = feed.channelDescription || t("feed.noDescription");

	feedMetaEl.replaceChildren(metaTopRow, description);

	if (!feed.items.length) {
		const emptyState = document.createElement("li");
		emptyState.className = "empty-state";
		emptyState.textContent = t("feed.noEntries");
		itemsEl.replaceChildren(emptyState);
		return;
	}

	const itemNodes = feed.items
		.slice(0, 24)
		.map((item, index) => {
			const imageMarkup = buildImageMarkup(item.mediaUrl);
			const excerpt = escapeHtml(item.description.slice(0, 190) || t("feed.noPreview"));
			const formattedDate = formatDate(item.pubDate) || t("feed.noDate");
			const articleActionMarkup = item.link
				? `<a class="tile-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("feed.articleLink"))}</a>`
				: `<span class="tile-link tile-link-disabled" aria-disabled="true">${escapeHtml(t("feed.noArticleLink"))}</span>`;
			const tileMarkup = fillTemplate(currentTileTemplate, {
				"{{date}}": formattedDate,
				"{{headline}}": escapeHtml(item.title),
				"{{description}}": excerpt,
				"{{image}}": imageMarkup,
				"{{theme}}": escapeHtml(currentTheme),
				"{{article_action}}": articleActionMarkup
			});

			const listItem = document.createElement("li");
			listItem.className = "item";
			listItem.style.animationDelay = `${Math.min(index * 45, 420)}ms`;
			listItem.appendChild(htmlToFragment(tileMarkup));
			return listItem;
		});

	itemsEl.replaceChildren(...itemNodes);
}

/**
 * Lädt und rendert eine Feed-URL über das RSS-Modul.
 */
async function loadAndRenderFeed(url) {
	const requestId = ++latestFeedRequestId;
	setStatus(t("status.loadingFeed"));
	itemsEl.replaceChildren();
	feedMetaEl.replaceChildren();

	try {
		const parsed = await loadRssFeed(url);
		if (requestId !== latestFeedRequestId) {
			return null;
		}

		currentLoadedUrl = url;
		if (isSavedFeed(url)) {
			upsertSavedFeed(url, parsed.channelTitle);
		}
		renderFeed(parsed);
		renderFeedPills();
		updateFavoriteButtonState();
		setStatus(t("status.feedLoaded", { count: parsed.items.length }));
		return parsed;
	} catch (error) {
		if (requestId !== latestFeedRequestId) {
			return null;
		}

		setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
		return null;
	}
}

/**
 * Normalisiert die aktuell im Eingabefeld eingegebene URL.
 */
function getNormalizedInputUrl() {
	const normalized = normalizeFeedUrl(feedUrlInput.value);
	feedUrlInput.value = normalized;
	return normalized;
}

/**
 * Liefert beim Hinzufügen eines Favoriten ein bevorzugtes Label.
 */
function getFavoriteLabelForUrl(url) {
	if (url === currentLoadedUrl && lastParsedFeed?.channelTitle) {
		return lastParsedFeed.channelTitle;
	}
	return undefined;
}

/**
 * Form-Submit: Eingabe normalisieren und Feed-Load auslösen.
 */
form.addEventListener("submit", (event) => {
	event.preventDefault();
	try {
		const url = getNormalizedInputUrl();
		loadAndRenderFeed(url);
	} catch (error) {
		setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
	}
});

/**
 * Favoriten-Button speichert den Feed und lädt ihn danach.
 */
favoriteBtn.addEventListener("click", () => {
	try {
		const url = getNormalizedInputUrl();
		if (isSavedFeed(url)) {
			removeFeed(url);
			renderFeedPills();
			updateFavoriteButtonState();
			setStatus(t("status.favoriteRemoved"));
			return;
		}

		const label = getFavoriteLabelForUrl(url);
		upsertSavedFeed(url, label);
		renderFeedPills();
		updateFavoriteButtonState();
		setStatus(t("status.favoriteSaved"));
	} catch (error) {
		setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
	}
});

/**
 * Behandelt Load- und Delete-Aktionen für Feed-Chips.
 */
quickFeedsEl.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const actionButton = target.closest("[data-feed-action]");
	if (!(actionButton instanceof HTMLElement)) {
		return;
	}

	const pill = actionButton.closest(".feed-pill");
	if (!(pill instanceof HTMLElement)) {
		return;
	}

	const rawUrl = pill.getAttribute("data-url") || "";
	if (!rawUrl) {
		return;
	}

	const action = actionButton.getAttribute("data-feed-action");

	if (action === "delete") {
		removeFeed(rawUrl);
		renderFeedPills();
		updateFavoriteButtonState();
		setStatus(t("status.feedRemoved"));
		return;
	}

	if (action === "load") {
		try {
			const normalized = normalizeFeedUrl(rawUrl);
			feedUrlInput.value = normalized;
			updateFavoriteButtonState();
			loadAndRenderFeed(normalized);
		} catch (error) {
			setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
		}
	}
});

/**
 * Theme-Wechsel aktualisiert Stile und rendert sichtbare Karten neu.
 */
themeSelect.addEventListener("change", async () => {
	const didLoadThemeTemplate = await applyTheme(themeSelect.value);
	if (didLoadThemeTemplate) {
		setStatus(t("status.themeChanged", { theme: themeSelect.value }));
	}
});

languageSelect.addEventListener("change", async () => {
	try {
		await applyLanguage(languageSelect.value);
		setStatus(t("status.languageChanged", { language: t(`languages.${currentLanguage}`) }));
	} catch (error) {
		setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
	}
});

feedUrlInput.addEventListener("input", () => {
	updateFavoriteButtonState();
});

if (importFavoritesBtn && favoritesFileInput) {
	importFavoritesBtn.addEventListener("click", () => {
		favoritesFileInput.value = "";
		favoritesFileInput.click();
	});

	favoritesFileInput.addEventListener("change", async () => {
		const selectedFile = favoritesFileInput.files?.[0];
		if (!selectedFile) {
			return;
		}

		try {
			const content = await selectedFile.text();
			importFavoritesFromJsonText(content);
		} catch (error) {
			setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
		}
	});
}

if (exportFavoritesBtn) {
	exportFavoritesBtn.addEventListener("click", () => {
		exportFavoritesAsJson();
	});
}

/**
 * Löscht persistierte App-Daten und stellt den Initialzustand wieder her.
 */
async function handleResetApp() {
	const confirmed = window.confirm(
		t("confirm.reset")
	);

	if (!confirmed) {
		return;
	}

	if (resetAppBtn) {
		resetAppBtn.disabled = true;
	}

	// Remove all app-owned keys to avoid stale state across deployments.
	Object.keys(localStorage)
		.filter((key) => key.startsWith("rss4u-"))
		.forEach((key) => localStorage.removeItem(key));

	lastParsedFeed = null;
	currentLoadedUrl = "";
	feedMetaEl.replaceChildren();
	itemsEl.replaceChildren();

	setStatus(t("status.resetDone"));

	// Full reload guarantees a clean runtime state and reseeds defaults reliably.
	window.location.reload();
}

if (resetAppBtn) {
	resetAppBtn.addEventListener("click", () => {
		handleResetApp();
	});
}

/**
 * Initialisiert die App: Theme-Präferenz wiederherstellen und Start-Feed laden.
 */
async function initializeApp() {
	await applyLanguage(getPreferredLanguage(), { persist: false });
	seedInitialFeedsIfNeeded();
	renderFeedPills();

	const preferredTheme = localStorage.getItem(THEME_KEY) || "light";
	themeSelect.value = THEMES[preferredTheme] ? preferredTheme : "light";
	await applyTheme(themeSelect.value);

	const initialUrl = getSavedFeeds()[0]?.url || "https://blog.mozilla.org/feed/";
	feedUrlInput.value = initialUrl;
	updateFavoriteButtonState();
	loadAndRenderFeed(feedUrlInput.value);
}

function registerServiceWorker() {
	if (!("serviceWorker" in navigator)) {
		return;
	}

	window.addEventListener("load", () => {
		navigator.serviceWorker.register("./sw.js").catch((error) => {
			console.warn("Service worker registration failed:", error);
		});
	});
}

registerServiceWorker();

initializeApp().catch((error) => {
	setStatus(`${t("status.errorPrefix")} ${error.message}`, true);
});
