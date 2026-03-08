/**
 * RSS/Atom-Datenzugriff und Parsing.
 *
 * Dieses Modul kapselt:
 * - URL-Normalisierung für Feed-Eingaben
 * - robustes Laden mit Timeout + Proxy-Fallback
 * - kurzlebiges XML-Caching zur Entlastung häufiger Reloads
 * - Parsing von RSS/Atom inkl. Kanalmetadaten
 * - heuristische Bild-/Video-Erkennung pro Item
 */

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

const FEED_REQUEST_TIMEOUT_MS = 6500;
const FEED_XML_CACHE_TTL_MS = 120000;
const feedXmlCache = new Map();

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

/**
 * Ersetzt Platzhalter im Stil `{{key}}` in einem Meldungstext.
 *
 * @param {string} template - Meldungsvorlage.
 * @param {Record<string, string|number|boolean>} [values={}] - Einzusetzende Werte.
 * @returns {string}
 */
function formatMessage(template, values = {}) {
	return Object.entries(values).reduce((output, [key, value]) => {
		return output.replaceAll(`{{${key}}}`, String(value));
	}, template);
}

/**
 * Holt XML aus dem In-Memory-Cache, sofern Eintrag noch gültig ist.
 *
 * @param {string} url - Feed-URL als Cache-Key.
 * @returns {string}
 */
function getCachedFeedXml(url) {
	const cached = feedXmlCache.get(url);
	if (!cached) {
		return "";
	}

	if (cached.expiresAt <= Date.now()) {
		feedXmlCache.delete(url);
		return "";
	}

	return cached.xmlText;
}

/**
 * Speichert XML mit Ablaufzeit in den In-Memory-Cache.
 *
 * @param {string} url - Feed-URL als Cache-Key.
 * @param {string} xmlText - Rohes XML.
 * @returns {void}
 */
function setCachedFeedXml(url, xmlText) {
	feedXmlCache.set(url, {
		xmlText,
		expiresAt: Date.now() + FEED_XML_CACHE_TTL_MS
	});
}

/**
 * Führt `fetch` mit AbortController-basiertem Timeout aus.
 *
 * @param {RequestInfo | URL} resource - Zielressource.
 * @param {RequestInit} [options={}] - Fetch-Optionen.
 * @param {number} [timeoutMs=FEED_REQUEST_TIMEOUT_MS] - Timeout in Millisekunden.
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(resource, options = {}, timeoutMs = FEED_REQUEST_TIMEOUT_MS) {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

	try {
		return await fetch(resource, {
			...options,
			signal: controller.signal
		});
	} finally {
		window.clearTimeout(timeoutId);
	}
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
	if (hasExplicitScheme) {
		try {
			const parsed = new URL(candidate);
			const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";

			if (!isHttp) {
				throw new Error(rssMessages.invalidUrl);
			}

			return parsed.toString();
		} catch {
			throw new Error(rssMessages.invalidUrl);
		}
	}

	const withProtocol = `https://${candidate}`;

	try {
		return new URL(withProtocol).toString();
	} catch {
		throw new Error(rssMessages.invalidUrl);
	}
}

function isHttpProtocolUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
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
	const parser = new DOMParser();
	const parsed = parser.parseFromString(String(html || ""), "text/html");
	return (parsed.body.textContent || "").trim();
}

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const MEDIA_PROTOCOLS = new Set(["http:", "https:"]);
const IMAGE_FILE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg", ".ico", ".tif", ".tiff", ".jfif"]);
const VIDEO_FILE_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv", ".m3u8", ".mkv"]);

function resolveUrlByProtocols(value, baseUrl = "", allowedProtocols = HTTP_PROTOCOLS) {
	if (!value) return "";
	const candidate = String(value).trim();
	if (!candidate) return "";

	try {
		const parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
		if (allowedProtocols.has(parsed.protocol)) {
			return parsed.toString();
		}
		return "";
	} catch {
		return "";
	}
}

/**
 * Löst relative oder absolute URL-Werte gegen eine optionale Basis-URL auf.
 *
 * Gibt nur gültige HTTP(S)-URLs zurück, sonst einen leeren String.
 */
function resolveHttpUrl(value, baseUrl = "") {
	return resolveUrlByProtocols(value, baseUrl, HTTP_PROTOCOLS);
}

function resolveMediaUrl(value, baseUrl = "") {
	return resolveUrlByProtocols(value, baseUrl, MEDIA_PROTOCOLS);
}

/**
 * Extrahiert Dateiendung aus der URL-Pfadkomponente.
 *
 * @param {string} urlValue - Zu prüfende URL.
 * @returns {string}
 */
function getUrlPathExtension(urlValue) {
	try {
		const parsed = new URL(urlValue);
		const pathname = (parsed.pathname || "").toLowerCase();
		const lastDot = pathname.lastIndexOf(".");
		return lastDot >= 0 ? pathname.slice(lastDot) : "";
	} catch {
		return "";
	}
}

/**
 * Prüft MIME-Typ auf Bildmedien.
 *
 * @param {string} typeValue
 * @returns {boolean}
 */
function isImageMediaType(typeValue) {
	return /^image\//i.test((typeValue || "").trim());
}

/**
 * Prüft MIME-Typ auf Videomedien.
 *
 * @param {string} typeValue
 * @returns {boolean}
 */
function isVideoMediaType(typeValue) {
	return /^video\//i.test((typeValue || "").trim());
}

/**
 * Heuristik: erkennt Bilddatei anhand URL-Endung.
 *
 * @param {string} urlValue
 * @returns {boolean}
 */
function isLikelyImageUrl(urlValue) {
	const extension = getUrlPathExtension(urlValue);
	return Boolean(extension) && IMAGE_FILE_EXTENSIONS.has(extension);
}

/**
 * Heuristik: erkennt Videodatei anhand URL-Endung.
 *
 * @param {string} urlValue
 * @returns {boolean}
 */
function isLikelyVideoUrl(urlValue) {
	const extension = getUrlPathExtension(urlValue);
	return Boolean(extension) && VIDEO_FILE_EXTENSIONS.has(extension);
}

/**
 * Klassifiziert einen Media-Kandidaten als `image`, `video` oder `unknown`.
 *
 * @param {{ localName?: string, medium?: string, type?: string, url?: string }} candidate
 * @returns {"image" | "video" | "unknown"}
 */
function classifyMediaCandidate({ localName = "", medium = "", type = "", url = "" }) {
	const safeLocalName = String(localName || "").toLowerCase();
	const safeMedium = String(medium || "").toLowerCase();
	const safeType = String(type || "").toLowerCase();

	if (safeMedium === "video" || isVideoMediaType(safeType) || isLikelyVideoUrl(url)) {
		return "video";
	}

	if (
		safeLocalName === "thumbnail" ||
		safeMedium === "image" ||
		isImageMediaType(safeType) ||
		isLikelyImageUrl(url)
	) {
		return "image";
	}

	return "unknown";
}

/**
 * Sucht in HTML-Inhalt nach erstem Bild bzw. Video inkl. Poster.
 *
 * @param {string} rawHtml - Unbereinigter HTML-Inhalt.
 * @param {string} baseUrl - Basis-URL zur Auflösung relativer Medienpfade.
 * @returns {{ imageUrl: string, videoUrl: string, posterUrl: string }}
 */
function extractMediaFromHtmlContent(rawHtml, baseUrl) {
	const emptyResult = {
		imageUrl: "",
		videoUrl: "",
		posterUrl: ""
	};

	if (!rawHtml) {
		return emptyResult;
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(String(rawHtml), "text/html");

	const firstImg = doc.querySelector("img[src], img[data-src], img[srcset]");
	if (firstImg) {
		const imgSource =
			firstImg.getAttribute("src") ||
			firstImg.getAttribute("data-src") ||
			(firstImg.getAttribute("srcset") || "").split(",")[0]?.trim().split(/\s+/)[0] ||
			"";
		const safeImgSource = resolveMediaUrl(imgSource, baseUrl);
		if (safeImgSource) {
			emptyResult.imageUrl = safeImgSource;
			return emptyResult;
		}
	}

	const firstVideo = doc.querySelector("video");
	if (firstVideo) {
		const videoPoster = resolveMediaUrl(firstVideo.getAttribute("poster") || "", baseUrl);
		if (videoPoster) {
			emptyResult.posterUrl = videoPoster;
		}

		const directVideoSrc = resolveMediaUrl(firstVideo.getAttribute("src") || "", baseUrl);
		if (directVideoSrc) {
			emptyResult.videoUrl = directVideoSrc;
			return emptyResult;
		}

		const sourceChild = firstVideo.querySelector("source[src]");
		const sourceVideoSrc = resolveMediaUrl(sourceChild?.getAttribute("src") || "", baseUrl);
		if (sourceVideoSrc) {
			emptyResult.videoUrl = sourceVideoSrc;
			return emptyResult;
		}
	}

	return emptyResult;
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
function extractMediaDetails(itemNode, baseUrl, rawDescription = "") {
	const allElements = [...itemNode.getElementsByTagName("*")];
	let fallbackUnknownCandidate = "";
	let fallbackVideoCandidate = "";
	let fallbackVideoPoster = "";

	const considerCandidate = ({ localName = "", medium = "", type = "", url = "", poster = "" }) => {
		const safeUrl = resolveMediaUrl(url, baseUrl);
		if (!safeUrl) {
			return "";
		}

		const safePoster = resolveMediaUrl(poster, baseUrl);

		const candidateKind = classifyMediaCandidate({
			localName,
			medium,
			type,
			url: safeUrl
		});

		if (candidateKind === "image") {
			return {
				mediaType: "image",
				mediaUrl: safeUrl,
				mediaPoster: ""
			};
		}

		if (candidateKind === "video") {
			if (!fallbackVideoCandidate) {
				fallbackVideoCandidate = safeUrl;
				fallbackVideoPoster = safePoster;
			}
			return "";
		}

		if (candidateKind === "unknown" && !fallbackUnknownCandidate) {
			fallbackUnknownCandidate = safeUrl;
		}

		return "";
	};

	for (const element of allElements) {
		const localName = (element.localName || "").toLowerCase();
		if (localName !== "content" && localName !== "thumbnail") {
			continue;
		}

		const preferred = considerCandidate({
			localName,
			medium: element.getAttribute("medium") || "",
			type: element.getAttribute("type") || "",
			url: element.getAttribute("url") || "",
			poster: element.getAttribute("poster") || ""
		});

		if (preferred) {
			return preferred;
		}
	}

	const enclosures = [...itemNode.querySelectorAll("enclosure")];
	for (const enclosure of enclosures) {
		const preferred = considerCandidate({
			localName: "enclosure",
			medium: enclosure.getAttribute("medium") || "",
			type: enclosure.getAttribute("type") || "",
			url: enclosure.getAttribute("url") || "",
			poster: enclosure.getAttribute("poster") || ""
		});

		if (preferred) {
			return preferred;
		}
	}

	const htmlMedia = extractMediaFromHtmlContent(rawDescription, baseUrl);
	if (htmlMedia.imageUrl) {
		return {
			mediaType: "image",
			mediaUrl: htmlMedia.imageUrl,
			mediaPoster: ""
		};
	}

	if (htmlMedia.videoUrl) {
		return {
			mediaType: "video",
			mediaUrl: htmlMedia.videoUrl,
			mediaPoster: htmlMedia.posterUrl
		};
	}

	if (fallbackVideoCandidate) {
		return {
			mediaType: "video",
			mediaUrl: fallbackVideoCandidate,
			mediaPoster: fallbackVideoPoster
		};
	}

	if (fallbackUnknownCandidate) {
		return {
			mediaType: "image",
			mediaUrl: fallbackUnknownCandidate,
			mediaPoster: ""
		};
	}

	return {
		mediaType: "",
		mediaUrl: "",
		mediaPoster: ""
	};
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
	const safeRssImageUrl = resolveMediaUrl(rssImageUrl, baseUrl);
	if (safeRssImageUrl) {
		return safeRssImageUrl;
	}

	const atomLogo = doc.querySelector("feed > logo")?.textContent?.trim() || "";
	const safeAtomLogo = resolveMediaUrl(atomLogo, baseUrl);
	if (safeAtomLogo) {
		return safeAtomLogo;
	}

	const atomIcon = doc.querySelector("feed > icon")?.textContent?.trim() || "";
	const safeAtomIcon = resolveMediaUrl(atomIcon, baseUrl);
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

		const candidateUrl = resolveMediaUrl(element.getAttribute("url") || "", baseUrl);
		if (!candidateUrl) {
			return false;
		}

		return classifyMediaCandidate({
			localName,
			medium: element.getAttribute("medium") || "",
			type: element.getAttribute("type") || "",
			url: candidateUrl
		}) === "image";
	});

	if (channelLevelMedia) {
		return resolveMediaUrl(channelLevelMedia.getAttribute("url") || "", baseUrl);
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
 *   items: Array<{ title, link, description, pubDate, mediaUrl, mediaType, mediaPoster }>
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

			const media = extractMediaDetails(itemNode, baseUrl, rawDescription);

			return {
				title,
				link: safeArticleLink,
				description,
				pubDate,
				mediaUrl: media.mediaUrl,
				mediaType: media.mediaType,
				mediaPoster: media.mediaPoster
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
	const cachedXml = getCachedFeedXml(url);
	if (cachedXml) {
		return cachedXml;
	}

	const attempts = isHttpProtocolUrl(url)
		? [...new Set([url, ...proxyFactories.map((proxy) => proxy(url))])]
		: [url];

	try {
		const xmlText = await Promise.any(
			attempts.map(async (attemptUrl) => {
				try {
					const response = await fetchWithTimeout(attemptUrl, {
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
					if (error?.name === "AbortError") {
						throw new Error(`${attemptUrl}: timeout`);
					}
					throw new Error(`${attemptUrl}: ${error?.message || rssMessages.unknownError}`);
				}
			})
		);

		setCachedFeedXml(url, xmlText);
		return xmlText;
	} catch (aggregateError) {
		const attemptErrors = Array.isArray(aggregateError?.errors)
			? aggregateError.errors.map((error) => error?.message || rssMessages.unknownError)
			: [aggregateError?.message || rssMessages.unknownError];
		const compactErrors = [...new Set(attemptErrors)].slice(0, 3).join(" | ");
		throw new Error(formatMessage(rssMessages.loadFailed, { details: compactErrors || rssMessages.unknownError }));
	}
}

/**
 * High-Level-Helper, der Network-Fetch + XML-Parsing in einem Aufruf ausführt.
 */
export async function loadFeed(url, options = {}) {
	const xmlText = await fetchFeedXml(url, options.proxies || DEFAULT_PROXIES);
	return parseFeed(xmlText, { baseUrl: url });
}
