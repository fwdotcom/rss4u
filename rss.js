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

	const hasExplicitScheme = /^[a-z][a-z\d+\-.]*:/i.test(candidate);
	if (hasExplicitScheme && !/^https?:\/\//i.test(candidate)) {
		throw new Error(rssMessages.invalidUrl);
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
 * Wählt für Atom-Entries bevorzugt rel="alternate" statt rel="self".
 */
function extractEntryLink(itemNode, baseUrl) {
	const linkNodes = [...itemNode.querySelectorAll("link")];

	const preferred = linkNodes.find((linkEl) => {
		const rel = (linkEl.getAttribute("rel") || "alternate").toLowerCase();
		const href = (linkEl.getAttribute("href") || "").trim();
		return rel === "alternate" && Boolean(resolveHttpUrl(href, baseUrl));
	});

	if (preferred) {
		return resolveHttpUrl(preferred.getAttribute("href")?.trim() || "", baseUrl);
	}

	const firstHttpHref = linkNodes
		.map((linkEl) => (linkEl.getAttribute("href") || "").trim())
		.find((href) => Boolean(resolveHttpUrl(href, baseUrl)));

	if (firstHttpHref) {
		return resolveHttpUrl(firstHttpHref, baseUrl);
	}

	const textLink = itemNode.querySelector("link")?.textContent?.trim() || "";
	const safeTextLink = resolveHttpUrl(textLink, baseUrl);
	if (safeTextLink) {
		return safeTextLink;
	}

	const idLink = itemNode.querySelector("id")?.textContent?.trim() || "";
	const safeIdLink = resolveHttpUrl(idLink, baseUrl);
	if (safeIdLink) {
		return safeIdLink;
	}

	return "";
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
 * Löst relative oder absolute URL-Werte gegen eine optionale Basis-URL auf.
 *
 * Gibt nur gültige HTTP(S)-URLs zurück, sonst einen leeren String.
 */
function resolveHttpUrl(value, baseUrl = "") {
	if (!value) return "";
	const candidate = String(value).trim();
	if (!candidate) return "";

	try {
		const parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.toString();
		}
		return "";
	} catch {
		return "";
	}
}

/**
 * Prüft, ob ein Wert eine gültige HTTP(S)-URL ist.
 */
function isHttpUrl(value) {
	return Boolean(resolveHttpUrl(value));
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
function extractMediaUrl(itemNode, baseUrl) {
	const allElements = [...itemNode.getElementsByTagName("*")];

	const mediaElement = allElements.find((element) => {
		const localName = (element.localName || "").toLowerCase();
		if (localName !== "content" && localName !== "thumbnail") {
			return false;
		}

		const candidateUrl = element.getAttribute("url") || "";
		return Boolean(resolveHttpUrl(candidateUrl, baseUrl));
	});

	if (mediaElement) {
		return resolveHttpUrl(mediaElement.getAttribute("url") || "", baseUrl);
	}

	const enclosureUrl = itemNode.querySelector("enclosure")?.getAttribute("url") || "";
	const safeEnclosureUrl = resolveHttpUrl(enclosureUrl, baseUrl);
	if (safeEnclosureUrl) {
		return safeEnclosureUrl;
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
function extractChannelLink(doc, baseUrl) {
	const rssLink = doc.querySelector("channel > link")?.textContent?.trim() || "";
	const safeRssLink = resolveHttpUrl(rssLink, baseUrl);
	if (safeRssLink) {
		return safeRssLink;
	}

	const atomLinks = [...doc.querySelectorAll("feed > link")];
	const preferredAtomLink = atomLinks.find((linkEl) => {
		const rel = (linkEl.getAttribute("rel") || "alternate").toLowerCase();
		const href = (linkEl.getAttribute("href") || "").trim();
		return rel === "alternate" && Boolean(resolveHttpUrl(href, baseUrl));
	});

	if (preferredAtomLink) {
		return resolveHttpUrl(preferredAtomLink.getAttribute("href")?.trim() || "", baseUrl);
	}

	const fallbackAtomLink = atomLinks.find((linkEl) => {
		const href = (linkEl.getAttribute("href") || "").trim();
		return Boolean(resolveHttpUrl(href, baseUrl));
	});

	return resolveHttpUrl(fallbackAtomLink?.getAttribute("href")?.trim() || "", baseUrl);
}

/**
 * Liest eine optionale Thumbnail-/Logo-URL auf Kanalebene.
 */
function extractChannelImage(doc, baseUrl) {
	const rssImageUrl = doc.querySelector("channel > image > url")?.textContent?.trim() || "";
	const safeRssImageUrl = resolveHttpUrl(rssImageUrl, baseUrl);
	if (safeRssImageUrl) {
		return safeRssImageUrl;
	}

	const atomLogo = doc.querySelector("feed > logo")?.textContent?.trim() || "";
	const safeAtomLogo = resolveHttpUrl(atomLogo, baseUrl);
	if (safeAtomLogo) {
		return safeAtomLogo;
	}

	const atomIcon = doc.querySelector("feed > icon")?.textContent?.trim() || "";
	const safeAtomIcon = resolveHttpUrl(atomIcon, baseUrl);
	if (safeAtomIcon) {
		return safeAtomIcon;
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
		return Boolean(resolveHttpUrl(candidateUrl, baseUrl));
	});

	if (channelLevelMedia) {
		return resolveHttpUrl(channelLevelMedia.getAttribute("url") || "", baseUrl);
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
export function parseFeed(xmlText, options = {}) {
	const { baseUrl = "" } = options;
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

	const channelLink = extractChannelLink(doc, baseUrl);
	const channelImageUrl = extractChannelImage(doc, baseUrl);

	const rssItems = [...doc.querySelectorAll("item")];
	const atomEntries = [...doc.querySelectorAll("entry")];
	const rawItems = rssItems.length ? rssItems : atomEntries;

	const items = rawItems
		.map((itemNode) => {
			const title = itemNode.querySelector("title")?.textContent?.trim() || rssMessages.untitledItem;
			const link = extractEntryLink(itemNode, baseUrl);

			const rawDescription =
				itemNode.querySelector("description")?.textContent ||
				itemNode.querySelector("content")?.textContent ||
				itemNode.querySelector("summary")?.textContent ||
				"";

			const plainDescription = plainTextFromHtml(rawDescription);
			const safeArticleLink = resolveHttpUrl(link, baseUrl);

			const description = isReferenceOnlyDescription(plainDescription, safeArticleLink)
				? ""
				: plainDescription;

			const pubDate =
				itemNode.querySelector("pubDate")?.textContent ||
				itemNode.querySelector("published")?.textContent ||
				itemNode.querySelector("updated")?.textContent ||
				"";

			const mediaUrl = extractMediaUrl(itemNode, baseUrl);

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
	return parseFeed(xmlText, { baseUrl: url });
}
