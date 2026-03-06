import { loadFeed as loadRssFeed, normalizeFeedUrl } from "./rss.js";

const form = document.getElementById("feed-form");
const feedUrlInput = document.getElementById("feed-url");
const favoriteBtn = document.getElementById("favorite-btn");
const favoriteIcon = document.getElementById("favorite-icon");
const statusEl = document.getElementById("status");
const feedMetaEl = document.getElementById("feed-meta");
const itemsEl = document.getElementById("items");
const themeSelect = document.getElementById("theme-select");
const themeStylesheet = document.getElementById("theme-stylesheet");
const quickFeedsEl = document.getElementById("quick-feeds");
const resetAppBtn = document.getElementById("reset-app-btn");

const SAVED_FEEDS_KEY = "rss-saved-feeds";
const FEED_SEED_DONE_KEY = "rss-feeds-seeded-v1";
const INITIAL_FEEDS = [
	{ label: "Mozilla Blog", url: "https://blog.mozilla.org/feed/" },
	{ label: "xkcd", url: "https://xkcd.com/atom.xml" },
	{ label: "Hacker News", url: "https://hnrss.org/frontpage" }
];

/**
 * Theme registry for both stylesheet and per-theme tile template.
 *
 * Keeping paths in one map makes it easy to add future themes without touching
 * render logic or event handlers.
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
 * Fallback card template used whenever a theme template fails to load.
 *
 * Tokens are replaced at runtime in renderFeed().
 */
const FALLBACK_TEMPLATE = `
<article class="tile">
	#image#
	<div class="tile-content">
		<h3 class="tile-headline">#headline#</h3>
		<p class="tile-description">#description#</p>
		<div class="tile-meta">
			<span class="tile-date">#date#</span>
			<a class="tile-link" href="#link#" target="_blank" rel="noopener noreferrer">Zum Artikel</a>
		</div>
	</div>
</article>
`;

let currentTheme = "light";
let currentTileTemplate = FALLBACK_TEMPLATE;
let lastParsedFeed = null;
let currentLoadedUrl = "";

const STAR_OUTLINE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath d='M12 3.7l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8z' fill='none' stroke='%23ffffff' stroke-width='1.8' stroke-linejoin='round'/%3E%3C/svg%3E";
const STAR_FILLED_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath d='M12 3.7l2.6 5.2 5.7.8-4.1 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.1-4 5.7-.8z' fill='%23ffffff'/%3E%3C/svg%3E";

/**
 * Creates a short pill label from URL data.
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
 * Normalizes a feed label and falls back to URL-derived text if needed.
 */
function getSafeFeedLabel(label, url) {
	const trimmed = (label || "").trim();
	return trimmed || createFeedLabel(url);
}

/**
 * Reads saved feed entries from localStorage and validates structure.
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
 * Writes saved feed entries to localStorage.
 */
function setSavedFeeds(feeds) {
	localStorage.setItem(SAVED_FEEDS_KEY, JSON.stringify(feeds));
}

/**
 * Seeds example feeds into storage exactly once, then never auto-readds them.
 */
function seedInitialFeedsIfNeeded() {
	if (localStorage.getItem(FEED_SEED_DONE_KEY) === "1") {
		return;
	}

	const existingFeeds = getSavedFeeds();
	const existingUrls = new Set(existingFeeds.map((entry) => entry.url));
	const seededFeeds = [
		...INITIAL_FEEDS.filter((entry) => !existingUrls.has(entry.url)),
		...existingFeeds
	].map((entry) => ({
		url: entry.url,
		label: getSafeFeedLabel(entry.label, entry.url)
	}));

	setSavedFeeds(seededFeeds);
	localStorage.setItem(FEED_SEED_DONE_KEY, "1");
}

/**
 * Inserts a feed or updates its label when already stored.
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
 * Removes one URL from saved feeds.
 */
function removeFeed(url) {
	const savedFeeds = getSavedFeeds();
	const nextFeeds = savedFeeds.filter((entry) => entry.url !== url);
	setSavedFeeds(nextFeeds);
}

/**
 * Checks if a URL currently exists in saved feeds.
 */
function isSavedFeed(url) {
	return getSavedFeeds().some((entry) => entry.url === url);
}

/**
 * Updates the favorite button icon based on the current URL input.
 */
function updateFavoriteButtonState() {
	const rawInput = feedUrlInput.value.trim();
	if (!rawInput) {
		favoriteIcon.src = STAR_OUTLINE_ICON;
		favoriteBtn.setAttribute("title", "Als Favorit speichern");
		favoriteBtn.setAttribute("aria-label", "Als Favorit speichern");
		return;
	}

	try {
		const normalized = normalizeFeedUrl(rawInput);
		const isFavorite = isSavedFeed(normalized);
		favoriteIcon.src = isFavorite ? STAR_FILLED_ICON : STAR_OUTLINE_ICON;
		favoriteBtn.setAttribute("title", isFavorite ? "Favorit entfernen" : "Als Favorit speichern");
		favoriteBtn.setAttribute("aria-label", isFavorite ? "Favorit entfernen" : "Als Favorit speichern");
	} catch {
		favoriteIcon.src = STAR_OUTLINE_ICON;
		favoriteBtn.setAttribute("title", "Als Favorit speichern");
		favoriteBtn.setAttribute("aria-label", "Als Favorit speichern");
	}
}

/**
 * Renders default and user-saved feeds as clickable pills.
 */
function renderFeedPills() {
	const savedFeeds = getSavedFeeds();

	const feedMarkup = savedFeeds.map((entry) => {
		const safeUrl = escapeHtml(entry.url);
		const safeLabel = escapeHtml(entry.label);
		return `
			<div class="feed-pill deletable" data-url="${safeUrl}">
				<button type="button" class="feed-chip" data-feed-action="load" title="${safeUrl}">${safeLabel}</button>
				<button type="button" class="feed-chip-delete" data-feed-action="delete" aria-label="Feed loeschen" title="Feed loeschen">x</button>
			</div>
		`;
	}).join("");

	quickFeedsEl.innerHTML = feedMarkup;
}

/**
 * Updates the status area and applies error color when needed.
 */
function setStatus(message, isError = false) {
	statusEl.textContent = message;
	statusEl.style.color = isError ? "var(--error)" : "var(--muted)";
}

/**
 * Escapes user/content strings before interpolating into HTML templates.
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
 * Formats feed dates for a German audience.
 */
function formatDate(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("de-DE", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric"
	}).format(date);
}

/**
 * Generates image HTML only when the feed entry provides media.
 */
function buildImageMarkup(mediaUrl) {
	if (!mediaUrl) {
		return "";
	}

	return `<img class="tile-image" src="${escapeHtml(mediaUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
}

/**
 * Replaces all placeholder tokens in a template string.
 */
function fillTemplate(template, replacements) {
	let output = template;
	Object.entries(replacements).forEach(([token, value]) => {
		output = output.split(token).join(value);
	});
	return output;
}

/**
 * Loads a template file from disk/network.
 */
async function loadThemeTemplate(templatePath) {
	const response = await fetch(templatePath, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`Template konnte nicht geladen werden (HTTP ${response.status}).`);
	}

	const text = await response.text();
	if (!text.trim()) {
		throw new Error("Template-Datei ist leer.");
	}

	return text;
}

/**
 * Applies a selected theme and rerenders the currently loaded feed.
 */
async function applyTheme(themeName) {
	const safeTheme = THEMES[themeName] ? themeName : "light";
	const themeConfig = THEMES[safeTheme];

	themeStylesheet.setAttribute("href", themeConfig.cssPath);
	document.body.dataset.theme = safeTheme;

	try {
		currentTileTemplate = await loadThemeTemplate(themeConfig.templatePath);
	} catch {
		currentTileTemplate = FALLBACK_TEMPLATE;
		setStatus(`Theme-Template fuer '${safeTheme}' nicht gefunden, Fallback aktiv.`, true);
	}

	currentTheme = safeTheme;
	localStorage.setItem("rss-theme", safeTheme);

	if (lastParsedFeed) {
		renderFeed(lastParsedFeed);
	}
}

/**
 * Renders parsed RSS data into cards using the active tile template.
 */
function renderFeed(feed) {
	lastParsedFeed = feed;
	const channelLinkMarkup = feed.channelLink
		? `<a class="feed-meta-site-link" href="${escapeHtml(feed.channelLink)}" target="_blank" rel="noopener noreferrer">Zur Website</a>`
		: "";

	feedMetaEl.innerHTML = `
		<div class="feed-meta-top-row">
			<h2>${escapeHtml(feed.channelTitle)}</h2>
			${channelLinkMarkup}
		</div>
		<p>${escapeHtml(feed.channelDescription || "Keine Beschreibung vorhanden.")}</p>
	`;

	if (!feed.items.length) {
		itemsEl.innerHTML = '<li class="empty-state">Keine Eintraege gefunden.</li>';
		return;
	}

	itemsEl.innerHTML = feed.items
		.slice(0, 24)
		.map((item, index) => {
			const imageMarkup = buildImageMarkup(item.mediaUrl);
			const excerpt = escapeHtml(item.description.slice(0, 190) || "Keine Vorschau verfuegbar.");
			const formattedDate = formatDate(item.pubDate) || "Kein Datum";
			const safeLink = escapeHtml(item.link || "#");
			const tileMarkup = fillTemplate(currentTileTemplate, {
				"#date#": formattedDate,
				"#headline#": escapeHtml(item.title),
				"#description#": excerpt,
				"#link#": safeLink,
				"#image#": imageMarkup,
				"#theme#": escapeHtml(currentTheme)
			});

			return `
			<li class="item" style="animation-delay: ${Math.min(index * 45, 420)}ms">
				${tileMarkup}
			</li>
		`;
		})
		.join("");
}

/**
 * Loads and renders a feed URL through the RSS module.
 */
async function loadAndRenderFeed(url) {
	setStatus("Lade Feed...");
	itemsEl.innerHTML = "";
	feedMetaEl.innerHTML = "";

	try {
		const parsed = await loadRssFeed(url);
		currentLoadedUrl = url;
		if (isSavedFeed(url)) {
			upsertSavedFeed(url, parsed.channelTitle);
		}
		renderFeed(parsed);
		renderFeedPills();
		updateFavoriteButtonState();
		setStatus(`Feed geladen: ${parsed.items.length} Eintraege gefunden.`);
		return parsed;
	} catch (error) {
		setStatus(`Fehler: ${error.message}`, true);
		return null;
	}
}

/**
 * Normalizes the URL currently typed into the input field.
 */
function getNormalizedInputUrl() {
	const normalized = normalizeFeedUrl(feedUrlInput.value);
	feedUrlInput.value = normalized;
	return normalized;
}

/**
 * Returns a preferred label when adding a favorite.
 */
function getFavoriteLabelForUrl(url) {
	if (url === currentLoadedUrl && lastParsedFeed?.channelTitle) {
		return lastParsedFeed.channelTitle;
	}
	return undefined;
}

/**
 * Form submit: normalize user input and trigger feed loading.
 */
form.addEventListener("submit", (event) => {
	event.preventDefault();
	try {
		const url = getNormalizedInputUrl();
		loadAndRenderFeed(url);
	} catch (error) {
		setStatus(`Fehler: ${error.message}`, true);
	}
});

/**
 * Save-and-load button stores the feed and then loads it.
 */
favoriteBtn.addEventListener("click", () => {
	try {
		const url = getNormalizedInputUrl();
		if (isSavedFeed(url)) {
			removeFeed(url);
			renderFeedPills();
			updateFavoriteButtonState();
			setStatus("Favorit entfernt.");
			return;
		}

		const label = getFavoriteLabelForUrl(url);
		upsertSavedFeed(url, label);
		renderFeedPills();
		updateFavoriteButtonState();
		setStatus("Favorit gespeichert.");
	} catch (error) {
		setStatus(`Fehler: ${error.message}`, true);
	}
});

/**
 * Handles load and delete actions for default/saved feed pills.
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
		setStatus("Feed aus der Liste entfernt.");
		return;
	}

	if (action === "load") {
		try {
			const normalized = normalizeFeedUrl(rawUrl);
			feedUrlInput.value = normalized;
			updateFavoriteButtonState();
			loadAndRenderFeed(normalized);
		} catch (error) {
			setStatus(`Fehler: ${error.message}`, true);
		}
	}
});

/**
 * Theme change updates styles and rerenders the currently shown cards.
 */
themeSelect.addEventListener("change", async () => {
	await applyTheme(themeSelect.value);
	setStatus(`Theme gewechselt: ${themeSelect.value}`);
});

feedUrlInput.addEventListener("input", () => {
	updateFavoriteButtonState();
});

/**
 * Clears persisted app data and restores the initial state.
 */
async function handleResetApp() {
	const confirmed = window.confirm(
		"Wirklich alles zuruecksetzen? Gespeicherte Feeds und Theme-Einstellung werden geloescht."
	);

	if (!confirmed) {
		return;
	}

	if (resetAppBtn) {
		resetAppBtn.disabled = true;
	}

	localStorage.removeItem(SAVED_FEEDS_KEY);
	localStorage.removeItem(FEED_SEED_DONE_KEY);
	localStorage.removeItem("rss-theme");

	lastParsedFeed = null;
	currentLoadedUrl = "";
	feedMetaEl.innerHTML = "";
	itemsEl.innerHTML = "";

	setStatus("App wurde zurueckgesetzt. Standardfeeds werden geladen...");

	try {
		await initializeApp();
	} finally {
		if (resetAppBtn) {
			resetAppBtn.disabled = false;
		}
	}
}

if (resetAppBtn) {
	resetAppBtn.addEventListener("click", () => {
		handleResetApp();
	});
}

/**
 * Bootstraps the app: restore theme preference and load default feed.
 */
async function initializeApp() {
	seedInitialFeedsIfNeeded();
	renderFeedPills();

	const preferredTheme = localStorage.getItem("rss-theme") || "light";
	themeSelect.value = THEMES[preferredTheme] ? preferredTheme : "light";
	await applyTheme(themeSelect.value);

	const initialUrl = getSavedFeeds()[0]?.url || "https://blog.mozilla.org/feed/";
	feedUrlInput.value = initialUrl;
	updateFavoriteButtonState();
	loadAndRenderFeed(feedUrlInput.value);
}

initializeApp();
