/**
 * Zentralisierte Proxy-Strategie, wenn eine direkte RSS-Anfrage durch CORS blockiert wird.
 *
 * Die erste Anfrage geht immer direkt an die Original-URL. Diese Proxy-Funktionen
 * werden nur als Fallback verwendet und halten die Fetch-Schicht konfigurierbar.
 */
export const DEFAULT_PROXIES = [
	(url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
	(url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

const DEFAULT_RSS_MESSAGES = {
	emptyUrl: "Please enter a feed URL.",
	invalidUrl: "Invalid URL. Example: https://example.com/feed.xml",
	invalidXml: "Feed XML could not be parsed.",
	unnamedFeed: "Untitled feed",
	untitledItem: "Untitled item",
	emptyResponse: "Received an empty response.",
	unknownError: "Unknown error",
	loadFailed: "Feed could not be loaded. Details: {{details}}"
};

let rssMessages = { ...DEFAULT_RSS_MESSAGES };

function formatMessage(template, values = {}) {
	return Object.entries(values).reduce((output, [key, value]) => {
		return output.replaceAll(`{{${key}}}`, String(value));
	}, template);
}

/**
 * Aktualisiert die lokalisierten Meldungstexte dieses Moduls.
 */
export function setRssMessages(nextMessages = {}) {
	rssMessages = {
		...DEFAULT_RSS_MESSAGES,
		...nextMessages
	};
}

/**
 * Validiert und normalisiert Benutzereingaben zu einer absoluten Feed-URL.
 *
 * Verhalten:
 * - entfernt führende/nachgestellte Leerzeichen
 * - fügt automatisch https:// hinzu, falls ein Protokoll fehlt
 * - wirft bei leerer oder ungültiger Eingabe einen lokalisierten Fehler
 */
export function normalizeFeedUrl(rawUrl) {
	const candidate = (rawUrl || "").trim();
	if (!candidate) {
		throw new Error(rssMessages.emptyUrl);
	}

	const withProtocol = /^https?:\/\//i.test(candidate)
		? candidate
		: `https://${candidate}`;

	try {
		return new URL(withProtocol).toString();
	} catch {
		throw new Error(rssMessages.invalidUrl);
	}
}

/**
 * Wandelt ein HTML-Fragment in lesbaren Klartext um.
 *
 * Viele Feeds enthalten HTML-Markup in Beschreibungs-/Inhaltsfeldern. Das Parsen
 * über einen temporären DOM-Knoten liefert vorhersehbaren Text für Vorschauen.
 */
function plainTextFromHtml(html) {
	const temp = document.createElement("div");
	temp.innerHTML = html || "";
	return (temp.textContent || "").trim();
}

/**
 * Prüft, ob ein Wert eine gültige HTTP(S)-URL ist.
 */
function isHttpUrl(value) {
	if (!value) return false;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Erzeugt einen normalisierten URL-String für lockere Gleichheitsprüfungen.
 *
 * Hash-Fragmente und abschließende Slashes werden entfernt, um falsche Negativtreffer
 * bei URLs auf dieselbe Ressource in leicht unterschiedlicher Form zu vermeiden.
 */
function normalizeUrlForCompare(value) {
	if (!isHttpUrl(value)) return "";
	const parsed = new URL(value);
	parsed.hash = "";
	const normalizedPath = parsed.pathname.replace(/\/+$/, "");
	return `${parsed.origin}${normalizedPath}${parsed.search}`.toLowerCase();
}

/**
 * Extrahiert die erste http(s)-URL aus einem Textfragment.
 */
function extractFirstUrl(value) {
	const match = (value || "").match(/https?:\/\/[^\s<>")]+/i);
	return match ? match[0] : "";
}

/**
 * Liest eine Bild-URL robust aus RSS/Atom Item-Knoten (inkl. Namespaces).
 */
function extractMediaUrl(itemNode) {
	const allElements = [...itemNode.getElementsByTagName("*")];

	const mediaElement = allElements.find((element) => {
		const localName = (element.localName || "").toLowerCase();
		if (localName !== "content" && localName !== "thumbnail") {
			return false;
		}

		const candidateUrl = element.getAttribute("url") || "";
		return isHttpUrl(candidateUrl);
	});

	if (mediaElement) {
		return mediaElement.getAttribute("url") || "";
	}

	const enclosureUrl = itemNode.querySelector("enclosure")?.getAttribute("url") || "";
	if (isHttpUrl(enclosureUrl)) {
		return enclosureUrl;
	}

	return "";
}

/**
 * Liefert true, wenn eine Beschreibung im Kern nur eine Referenz-URL enthält.
 *
 * Einige Feeds legen nur eine URL ins Content-Feld.
 * In diesem Fall wird der Preview-Text unterdrückt und die UI zeigt einen Fallback-Text.
 */
function isReferenceOnlyDescription(description, articleLink) {
	const compact = (description || "").trim().replace(/\s+/g, " ");
	if (!compact) return true;

	const withoutLabel = compact.replace(/^(article\s*)?(url|link|source|comments?)\s*:\s*/i, "");
	if (/^(https?:\/\/|www\.)\S+$/i.test(withoutLabel)) {
		return true;
	}

	const normalizedDescriptionUrl = normalizeUrlForCompare(extractFirstUrl(withoutLabel));
	const normalizedArticle = normalizeUrlForCompare(articleLink);

	if (
		normalizedDescriptionUrl &&
		normalizedDescriptionUrl === normalizedArticle
	) {
		return true;
	}

	return false;
}

/**
 * Liest eine Website-URL auf Kanalebene aus RSS- oder Atom-Metadaten.
 */
function extractChannelLink(doc) {
	const rssLink = doc.querySelector("channel > link")?.textContent?.trim() || "";
	if (isHttpUrl(rssLink)) {
		return rssLink;
	}

	const atomLinks = [...doc.querySelectorAll("feed > link")];
	const preferredAtomLink = atomLinks.find((linkEl) => {
		const rel = (linkEl.getAttribute("rel") || "alternate").toLowerCase();
		const href = (linkEl.getAttribute("href") || "").trim();
		return rel === "alternate" && isHttpUrl(href);
	});

	if (preferredAtomLink) {
		return preferredAtomLink.getAttribute("href")?.trim() || "";
	}

	const fallbackAtomLink = atomLinks.find((linkEl) => {
		const href = (linkEl.getAttribute("href") || "").trim();
		return isHttpUrl(href);
	});

	return fallbackAtomLink?.getAttribute("href")?.trim() || "";
}

/**
 * Liest eine optionale Thumbnail-/Logo-URL auf Kanalebene.
 */
function extractChannelImage(doc) {
	const rssImageUrl = doc.querySelector("channel > image > url")?.textContent?.trim() || "";
	if (isHttpUrl(rssImageUrl)) {
		return rssImageUrl;
	}

	const atomLogo = doc.querySelector("feed > logo")?.textContent?.trim() || "";
	if (isHttpUrl(atomLogo)) {
		return atomLogo;
	}

	const atomIcon = doc.querySelector("feed > icon")?.textContent?.trim() || "";
	if (isHttpUrl(atomIcon)) {
		return atomIcon;
	}

	const channelLevelMedia = [...doc.getElementsByTagName("*")].find((element) => {
		const localName = (element.localName || "").toLowerCase();
		if (localName !== "thumbnail" && localName !== "content") {
			return false;
		}

		const parentName = (element.parentElement?.localName || "").toLowerCase();
		if (parentName !== "channel" && parentName !== "feed") {
			return false;
		}

		const candidateUrl = element.getAttribute("url") || "";
		return isHttpUrl(candidateUrl);
	});

	if (channelLevelMedia) {
		return channelLevelMedia.getAttribute("url") || "";
	}

	return "";
}

/**
 * Parst RSS- oder Atom-XML in die für die UI verwendete Datenstruktur.
 *
 * Ausgabestruktur:
 * {
 *   channelTitle: string,
 *   channelDescription: string,
 *   channelImageUrl: string,
 *   items: Array<{ title, link, description, pubDate, mediaUrl }>
 * }
 */
export function parseFeed(xmlText) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, "application/xml");
	const parserError = doc.querySelector("parsererror");

	if (parserError) {
		throw new Error(rssMessages.invalidXml);
	}

	const channelTitle =
		doc.querySelector("channel > title")?.textContent?.trim() ||
		doc.querySelector("feed > title")?.textContent?.trim() ||
		rssMessages.unnamedFeed;

	const channelDescription =
		doc.querySelector("channel > description")?.textContent?.trim() ||
		doc.querySelector("feed > subtitle")?.textContent?.trim() ||
		"";

	const channelLink = extractChannelLink(doc);
	const channelImageUrl = extractChannelImage(doc);

	const rssItems = [...doc.querySelectorAll("item")];
	const atomEntries = [...doc.querySelectorAll("entry")];
	const rawItems = rssItems.length ? rssItems : atomEntries;

	const items = rawItems
		.map((itemNode) => {
			const title = itemNode.querySelector("title")?.textContent?.trim() || rssMessages.untitledItem;

			let link = itemNode.querySelector("link")?.textContent?.trim() || "";
			if (!link) {
				link =
					itemNode.querySelector("link")?.getAttribute("href") ||
					itemNode.querySelector("id")?.textContent?.trim() ||
					"";
			}

			const rawDescription =
				itemNode.querySelector("description")?.textContent ||
				itemNode.querySelector("content")?.textContent ||
				itemNode.querySelector("summary")?.textContent ||
				"";

			const plainDescription = plainTextFromHtml(rawDescription);
			const safeArticleLink = isHttpUrl(link) ? link : "";

			const description = isReferenceOnlyDescription(plainDescription, safeArticleLink)
				? ""
				: plainDescription;

			const pubDate =
				itemNode.querySelector("pubDate")?.textContent ||
				itemNode.querySelector("published")?.textContent ||
				itemNode.querySelector("updated")?.textContent ||
				"";

			const mediaUrl = extractMediaUrl(itemNode);

			return {
				title,
				link: safeArticleLink,
				description,
				pubDate,
				mediaUrl
			};
		})
		.filter((item) => item.link || item.title);

	return {
		channelTitle,
		channelDescription,
		channelLink,
		channelImageUrl,
		items
	};
}

/**
 * Holt rohes XML von der Feed-URL via Direktanfrage + Proxy-Fallbacks.
 *
 * Wirft einen einzelnen Fehler, der einige eindeutige Fehlergründe kombiniert,
 * damit die Fehlersuche in der UI einfacher wird.
 */
export async function fetchFeedXml(url, proxyFactories = DEFAULT_PROXIES) {
	const attempts = [url, ...proxyFactories.map((proxy) => proxy(url))];
	const attemptErrors = [];

	for (const attempt of attempts) {
		try {
			const response = await fetch(attempt, {
				headers: {
					Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml"
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const text = await response.text();
			if (!text.trim()) {
				throw new Error(rssMessages.emptyResponse);
			}

			return text;
		} catch (error) {
			attemptErrors.push(error?.message || rssMessages.unknownError);
		}
	}

	const compactErrors = [...new Set(attemptErrors)].slice(0, 3).join(" | ");
	throw new Error(formatMessage(rssMessages.loadFailed, { details: compactErrors || rssMessages.unknownError }));
}

/**
 * High-Level-Helper, der Network-Fetch + XML-Parsing in einem Aufruf ausführt.
 */
export async function loadFeed(url, options = {}) {
	const xmlText = await fetchFeedXml(url, options.proxies || DEFAULT_PROXIES);
	return parseFeed(xmlText);
}
